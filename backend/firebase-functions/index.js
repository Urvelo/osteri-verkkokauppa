const functions = require("firebase-functions");
const admin = require("firebase-admin");
const fetch = require("node-fetch");
const crypto = require("crypto");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

admin.initializeApp();
const db = admin.firestore();

// ===== CONFIG (stored in functions/.env, NOT in client code) =====
// Secrets are in functions/.env (gitignored) and deployed to Cloud Functions
// Never expose these in client-side JavaScript
const IMGBB_KEY = process.env.IMGBB_KEY || "";
const OWNER_EMAIL = process.env.OWNER_EMAIL || "";

// AliExpress DS API config
const AE_APP_KEY = process.env.AE_APP_KEY || "";
const AE_APP_SECRET = process.env.AE_APP_SECRET || "";
const AE_ACCESS_TOKEN = process.env.AE_ACCESS_TOKEN || "";
const AE_API_URL = "https://api-sg.aliexpress.com/sync";

// ===== CORS helper =====
const ALLOWED_ORIGINS = [
  "https://urvelo.github.io",
  "https://xn--ert-rla.fi",
  "https://www.xn--ert-rla.fi",
  "https://rosterii.web.app",
  "http://localhost:8080",
  "http://localhost:5174",
  "http://127.0.0.1:8080",
  "http://127.0.0.1:5174",
];

function setCors(req, res) {
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.some((o) => origin.startsWith(o))) {
    res.set("Access-Control-Allow-Origin", origin);
  }
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return true;
  }
  return false;
}

// ===== 1. Upload image to ImgBB (proxy) =====
// Client sends base64 image -> this function uploads to ImgBB -> returns URL
// API key never leaves the server
exports.uploadImage = functions.https.onRequest(async (req, res) => {
  if (setCors(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  try {
    const { image, name } = req.body;
    if (!image) {
      return res.status(400).json({ error: "No image provided" });
    }
    if (!IMGBB_KEY) {
      return res
        .status(500)
        .json({ error: "ImgBB API key not configured on server" });
    }

    // Rate limit: max 10 uploads per IP per hour
    const ip =
      req.headers["x-forwarded-for"] || req.connection.remoteAddress || "unknown";
    const rateLimitRef = db.collection("_ratelimits").doc(`img_${ip.replace(/[^a-zA-Z0-9]/g, "_")}`);
    const rateDoc = await rateLimitRef.get();
    const now = Date.now();
    if (rateDoc.exists) {
      const data = rateDoc.data();
      if (data.count >= 10 && now - data.firstRequest < 3600000) {
        return res.status(429).json({ error: "Too many uploads. Try again later." });
      }
      if (now - data.firstRequest >= 3600000) {
        await rateLimitRef.set({ count: 1, firstRequest: now });
      } else {
        await rateLimitRef.update({ count: admin.firestore.FieldValue.increment(1) });
      }
    } else {
      await rateLimitRef.set({ count: 1, firstRequest: now });
    }

    // Validate image is base64 and not too large (max 5MB base64 ≈ 6.7MB string)
    if (image.length > 7000000) {
      return res.status(400).json({ error: "Image too large (max 5MB)" });
    }

    // Upload to ImgBB
    const formBody = new URLSearchParams();
    formBody.append("key", IMGBB_KEY);
    formBody.append("image", image);
    if (name) formBody.append("name", name);
    // Auto-delete after 90 days (7776000 seconds)
    formBody.append("expiration", "7776000");

    const response = await fetch("https://api.imgbb.com/1/upload", {
      method: "POST",
      body: formBody,
    });
    const result = await response.json();

    if (result.success) {
      return res.json({
        success: true,
        url: result.data.display_url,
        thumb: result.data.thumb?.url || result.data.display_url,
        delete_url: result.data.delete_url,
      });
    } else {
      return res.status(500).json({ error: "ImgBB upload failed", details: result });
    }
  } catch (err) {
    console.error("uploadImage error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ===== 2. Submit return request =====
// Saves return request to Firestore, sends email notifications
exports.submitReturn = functions.https.onRequest(async (req, res) => {
  if (setCors(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  try {
    const { orderId, name, email, phone, reason, description, imageUrl } =
      req.body;

    if (!orderId || !name || !email || !reason) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Sanitize inputs
    const sanitize = (str) =>
      String(str || "")
        .replace(/[<>]/g, "")
        .trim()
        .substring(0, 1000);

    const returnData = {
      returnId: "RET-" + Date.now(),
      orderId: sanitize(orderId),
      name: sanitize(name),
      email: sanitize(email),
      phone: sanitize(phone),
      reason: sanitize(reason),
      description: sanitize(description),
      imageUrl: sanitize(imageUrl),
      status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Save to Firestore
    await db.collection("returns").doc(returnData.returnId).set(returnData);

    // Queue email to owner
    if (OWNER_EMAIL) {
      await db.collection("mail").add({
        to: OWNER_EMAIL,
        message: {
          subject: `Palautuspyyntö: ${returnData.returnId}`,
          html: buildReturnEmailHtml(returnData, true),
        },
      });
    }

    // Queue confirmation email to customer
    if (returnData.email) {
      await db.collection("mail").add({
        to: returnData.email,
        message: {
          subject: `Palautuspyyntö vastaanotettu – ${returnData.returnId}`,
          html: buildReturnEmailHtml(returnData, false),
        },
      });
    }

    return res.json({ success: true, returnId: returnData.returnId });
  } catch (err) {
    console.error("submitReturn error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ===== 3. Place order (server-side, hides owner email) =====
exports.placeOrder = functions.https.onRequest(async (req, res) => {
  if (setCors(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  try {
    const order = req.body;
    if (!order || !order.id || !order.customer || !order.items) {
      return res.status(400).json({ error: "Invalid order data" });
    }

    // Save order to Firestore
    await db.collection("orders").doc(order.id).set({
      ...order,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      status: "new",
    });

    // Email to owner
    if (OWNER_EMAIL) {
      await db.collection("mail").add({
        to: OWNER_EMAIL,
        message: {
          subject: `Uusi tilaus: ${order.id}`,
          html: buildOrderEmailHtml(order, true),
        },
      });
    }

    // Email to customer
    if (order.customer.email) {
      await db.collection("mail").add({
        to: order.customer.email,
        message: {
          subject: `Tilausvahvistus ${order.id} – ERÄT.FI`,
          html: buildOrderEmailHtml(order, false),
        },
      });
    }

    return res.json({ success: true, orderId: order.id });
  } catch (err) {
    console.error("placeOrder error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ===== Email builders =====

// ===== 4. Fetch AliExpress product (server-side, hides API keys) =====
function aeSignRequest(params, secret) {
  // IOP protocol: HMAC-SHA256(secret, sorted(key+value pairs)), NO secret wrapping
  const sorted = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
  const signStr = sorted.map(([k, v]) => `${k}${v}`).join("");
  return crypto.createHmac("sha256", secret).update(signStr).digest("hex").toUpperCase();
}

async function aeApiCall(method, params, accessToken) {
  const systemParams = {
    app_key: AE_APP_KEY,
    method,
    timestamp: String(Date.now()),
    sign_method: "sha256",
    access_token: accessToken,
  };
  const allParams = { ...systemParams, ...params };
  allParams.sign = aeSignRequest(allParams, AE_APP_SECRET);

  const body = new URLSearchParams(allParams);
  const resp = await fetch(AE_API_URL, { method: "POST", body, timeout: 30000 });
  if (!resp.ok) throw new Error(`AE API HTTP ${resp.status}`);
  return resp.json();
}

exports.fetchAliExpressProduct = functions.https.onRequest(async (req, res) => {
  if (setCors(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  try {
    const { product_id } = req.body;
    if (!product_id || !/^\d{10,20}$/.test(product_id)) {
      return res.status(400).json({ error: "Invalid product_id" });
    }

    // Read token from env or from Firestore
    let token = AE_ACCESS_TOKEN;
    if (!token) {
      const tokenDoc = await db.collection("_config").doc("aliexpress").get();
      if (tokenDoc.exists) token = tokenDoc.data().access_token || "";
    }
    if (!token) {
      return res.status(500).json({ error: "AliExpress access token not configured" });
    }

    // Fetch product info
    const result = await aeApiCall("aliexpress.ds.product.get", {
      product_id,
      ship_to_country: "FI",
      target_currency: "EUR",
      target_language: "en",
    }, token);

    const resp = (result.aliexpress_ds_product_get_response || {}).result || {};
    if (!resp || result.error_response) {
      const errMsg = result.error_response?.msg || "Product not found";
      return res.status(404).json({ error: errMsg });
    }

    // Parse SKUs
    const skus = [];
    const aeSkus = (resp.ae_item_sku_info_dtos || {}).ae_item_sku_info_d_t_o || [];
    for (const sku of aeSkus) {
      const attrs = (sku.ae_sku_property_dtos || {}).ae_sku_property_d_t_o || [];
      const nameParts = [];
      let skuImage = "";
      for (const attr of attrs) {
        if (attr.property_value_definition_name) nameParts.push(attr.property_value_definition_name);
        if (attr.sku_image) skuImage = attr.sku_image;
      }
      skus.push({
        id: sku.id || "",
        name: nameParts.join(" / "),
        price: parseFloat(sku.offer_sale_price || 0),
        original_price: parseFloat(sku.offer_bulk_sale_price || sku.sku_price || 0),
        stock: parseInt(sku.s_k_u_available_stock || 0, 10),
        image: skuImage,
      });
    }

    // Parse images
    const imgModule = resp.ae_multimedia_info_dto || {};
    const images = (imgModule.image_urls || "").split(";").filter(Boolean).map(s => s.trim());

    // Build response
    const product = {
      id: product_id,
      title: resp.subject || resp.product_name || "",
      sale_price: skus.length ? Math.min(...skus.filter(s => s.price > 0).map(s => s.price)) : 0,
      original_price: parseFloat(resp.original_price || 0),
      image: images[0] || "",
      images,
      url: `https://www.aliexpress.com/item/${product_id}.html`,
      orders: parseInt(resp.order_cnt || 0, 10),
      score: parseFloat(resp.avg_evaluation_rating || 0),
      evaluate_rate: String(resp.positive_feedback_rate || ""),
      category_id: String(resp.category_id || ""),
      description: resp.detail || "",
      evaluation_count: String(resp.evaluation_count || 0),
      sales_count: String(resp.order_cnt || 0),
      skus,
    };

    return res.json(product);
  } catch (err) {
    console.error("fetchAliExpressProduct error:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
});

// ===== 5. Refresh AliExpress stock/prices =====
exports.refreshAliExpressStock = functions.https.onRequest(async (req, res) => {
  if (setCors(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  try {
    const { product_id } = req.body;
    if (!product_id) return res.status(400).json({ error: "Missing product_id" });

    let token = AE_ACCESS_TOKEN;
    if (!token) {
      const tokenDoc = await db.collection("_config").doc("aliexpress").get();
      if (tokenDoc.exists) token = tokenDoc.data().access_token || "";
    }
    if (!token) return res.status(500).json({ error: "No token" });

    const result = await aeApiCall("aliexpress.ds.product.get", {
      product_id,
      ship_to_country: "FI",
      target_currency: "EUR",
      target_language: "en",
    }, token);

    const productResult = (result.aliexpress_ds_product_get_response || {}).result || {};
    if (!productResult) return res.status(404).json({ error: "Not found" });

    const aeSkus = (productResult.ae_item_sku_info_dtos || {}).ae_item_sku_info_d_t_o || [];
    const skus = aeSkus.map(s => ({
      id: s.id,
      stock: parseInt(s.s_k_u_available_stock || 0, 10),
      price: parseFloat(s.offer_sale_price || 0),
      original_price: parseFloat(s.offer_bulk_sale_price || s.sku_price || 0),
    }));

    return res.json({
      orders: parseInt(productResult.order_cnt || 0, 10),
      score: parseFloat(productResult.avg_evaluation_rating || 0),
      skus,
    });
  } catch (err) {
    console.error("refreshAliExpressStock error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ===== 5. Fetch AliExpress reviews (server-side proxy to bypass CORS) =====
exports.fetchReviews = functions.https.onRequest(async (req, res) => {
  if (setCors(req, res)) return;

  const productId = req.query.productId || (req.body && req.body.productId);
  const page = parseInt(req.query.page || req.body?.page || "1", 10);
  const pageSize = Math.min(parseInt(req.query.pageSize || req.body?.pageSize || "20", 10), 50);

  if (!productId) return res.status(400).json({ error: "productId required" });

  try {
    const url = `https://feedback.aliexpress.com/pc/searchEvaluation.do?productId=${productId}&page=${page}&pageSize=${pageSize}&lang=en_US`;
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": `https://www.aliexpress.com/item/${productId}.html`,
        "Accept": "application/json",
        "x-requested-with": "XMLHttpRequest",
      },
    });
    if (!resp.ok) return res.status(502).json({ error: `AliExpress returned ${resp.status}` });
    const data = await resp.json();
    const evaList = data?.data?.evaViewList || [];
    const totalNum = data?.data?.totalNum || 0;

    const reviews = evaList.map(r => ({
      reviewer_name: r.buyerName || "Buyer",
      country: r.buyerCountry || "",
      // buyerEval: 100=positive (5★), <60 negative etc. Map to 1-5 stars
      rating: r.starLevel ? Math.min(5, Math.max(1, Math.round(r.starLevel)))
             : r.buyerEval >= 80 ? 5 : r.buyerEval >= 60 ? 4 : r.buyerEval >= 40 ? 3 : r.buyerEval >= 20 ? 2 : 1,
      comment: r.buyerFeedback || "",
      review_date: r.evalDate || "",
      avatar: r.buyerHeadPortrait || "",
      sku_info: r.skuInfo || "",
      images: Array.isArray(r.imageUrls) ? r.imageUrls : [],
    })).filter(r => r.comment);

    return res.json({ success: true, reviews, totalNum, page, pageSize });
  } catch (err) {
    console.error("fetchReviews error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ===== 6. Stripe Checkout Session =====
exports.createCheckoutSession = functions.https.onRequest(async (req, res) => {
  if (setCors(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  try {
    const { items, orderId, customerEmail, shippingCost } = req.body;
    
    if (!items || !items.length) {
      return res.status(400).json({ error: "No items provided" });
    }

    const line_items = items.map(item => ({
      price_data: {
        currency: "eur",
        product_data: {
          name: (item.title || "Tuote") + (item.variant ? ` (${item.variant})` : ""),
          images: item.image ? [item.image] : [],
        },
        unit_amount: Math.round((item.price || 0) * 100), // Stripe expects cents
      },
      quantity: item.qty || 1,
    }));

    if (shippingCost && shippingCost > 0) {
      line_items.push({
        price_data: {
          currency: "eur",
          product_data: {
            name: "Toimitus",
          },
          unit_amount: Math.round(shippingCost * 100),
        },
        quantity: 1,
      });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "mobilepay"], // Removed klarna to keep the fast loading generic card + gpay + apple pay + mobilepay setup
      line_items: line_items,
      mode: "payment",
      success_url: req.headers.origin + "/kassa/index.html?session_id={CHECKOUT_SESSION_ID}&order_id=" + orderId,
      cancel_url: req.headers.origin + "/kassa/index.html?status=cancel",
      customer_email: customerEmail,
      metadata: {
        orderId: orderId,
      }
    });

    return res.json({ id: session.id, url: session.url });
  } catch (err) {
    console.error("createCheckoutSession error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ===== Email builders =====
function buildReturnEmailHtml(data, isOwner) {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#333">
    <div style="background:#1a1a1a;padding:24px;text-align:center"><h1 style="color:#f7b829;margin:0;font-size:1.5rem">ERÄT.FI</h1></div>
    <div style="padding:24px;background:#fff">
      <h2 style="color:#333">${isOwner ? "📦 Uusi palautuspyyntö" : "Palautuspyyntösi on vastaanotettu"}</h2>
      <p><b>Palautusnumero:</b> ${data.returnId}</p>
      <p><b>Tilausnumero:</b> ${data.orderId}</p>
      <p><b>Nimi:</b> ${data.name}</p>
      <p><b>Sähköposti:</b> ${data.email}</p>
      ${data.phone ? `<p><b>Puhelin:</b> ${data.phone}</p>` : ""}
      <p><b>Syy:</b> ${data.reason}</p>
      ${data.description ? `<p><b>Kuvaus:</b> ${data.description}</p>` : ""}
      ${data.imageUrl ? `<p><b>Kuva:</b><br><img src="${data.imageUrl}" style="max-width:400px;margin-top:8px" alt="Tuotekuva"></p>` : ""}
      ${!isOwner ? '<hr style="border:none;border-top:1px solid #eee;margin:16px 0"><p style="color:#999;font-size:.85rem">Käsittelemme palautuspyyntösi 1–3 arkipäivän kuluessa. Otamme yhteyttä sähköpostitse.</p>' : ""}
    </div>
    <div style="background:#1a1a1a;padding:16px;text-align:center"><p style="color:#999;font-size:.8rem;margin:0">© 2026 ERÄT.FI</p></div>
  </div>`;
}

function buildOrderEmailHtml(order, isOwner) {
  const itemRows = order.items
    .map(
      (i) =>
        `<tr><td style="padding:8px;border-bottom:1px solid #eee">${i.title}${i.variant ? " (" + i.variant + ")" : ""}</td>` +
        `<td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${i.qty}</td>` +
        `<td style="padding:8px;border-bottom:1px solid #eee;text-align:right">€${(i.price * i.qty).toFixed(2)}</td></tr>`
    )
    .join("");
  const c = order.customer;
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#333">
    <div style="background:#1a1a1a;padding:24px;text-align:center"><h1 style="color:#f7b829;margin:0;font-size:1.5rem">ERÄT.FI</h1></div>
    <div style="padding:24px;background:#fff">
      <h2 style="color:#333">${isOwner ? "📦 Uusi tilaus!" : "Kiitos tilauksestasi!"}</h2>
      <p style="color:#666"><b>Tilausnumero:</b> ${order.id}</p>
      <p style="color:#666"><b>Päivämäärä:</b> ${new Date(order.date).toLocaleDateString("fi-FI")}</p>
      <hr style="border:none;border-top:1px solid #eee;margin:16px 0">
      <h3 style="margin-bottom:8px">Tilatut tuotteet</h3>
      <table style="width:100%;border-collapse:collapse">
        <tr style="background:#f5f5f5"><th style="padding:8px;text-align:left">Tuote</th><th style="padding:8px;text-align:center">Kpl</th><th style="padding:8px;text-align:right">Hinta</th></tr>
        ${itemRows}
        <tr><td style="padding:8px" colspan="2"><b>Toimitus</b></td><td style="padding:8px;text-align:right">€${order.shipping.toFixed(2)}</td></tr>
        <tr style="background:#f7b829"><td style="padding:10px" colspan="2"><b style="font-size:1.1rem">Yhteensä</b></td><td style="padding:10px;text-align:right"><b style="font-size:1.1rem">€${order.total.toFixed(2)}</b></td></tr>
      </table>
      <hr style="border:none;border-top:1px solid #eee;margin:16px 0">
      <h3 style="margin-bottom:8px">Toimitusosoite</h3>
      <p style="color:#666">${c.firstName} ${c.lastName}<br>${c.address}<br>${c.postal} ${c.city}<br>${c.country}</p>
      <p style="color:#666"><b>Puhelin:</b> ${c.phone}<br><b>Sähköposti:</b> ${c.email}</p>
      ${c.notes ? `<p style="color:#666"><b>Lisätiedot:</b> ${c.notes}</p>` : ""}
      ${!isOwner ? '<hr style="border:none;border-top:1px solid #eee;margin:16px 0"><p style="color:#999;font-size:.85rem">Toimitusaika: 10–25 arkipäivää. Saat seurantatiedot sähköpostiisi kun paketti lähtee.</p>' : ""}
    </div>
    <div style="background:#1a1a1a;padding:16px;text-align:center"><p style="color:#999;font-size:.8rem;margin:0">© 2026 ERÄT.FI</p></div>
  </div>`;
}
