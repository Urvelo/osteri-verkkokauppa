const functions = require("firebase-functions");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

admin.initializeApp();
const db = admin.firestore();

// ===== CONFIG (stored in functions/.env, NOT in client code) =====
// Secrets are in functions/.env (gitignored) and deployed to Cloud Functions
// Never expose these in client-side JavaScript
const IMGBB_KEY = process.env.IMGBB_KEY || "";
const OWNER_EMAIL = process.env.OWNER_EMAIL || "";

// ===== CORS helper =====
const ALLOWED_ORIGINS = [
  "https://urvelo.github.io",
  "https://rosterikuppia.fi",
  "https://www.rosterikuppia.fi",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
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
          subject: `Tilausvahvistus ${order.id} – Rosterikuppia.fi`,
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
function buildReturnEmailHtml(data, isOwner) {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#333">
    <div style="background:#1a1a1a;padding:24px;text-align:center"><h1 style="color:#f7b829;margin:0;font-size:1.5rem">ROSTERIKUPPIA.FI</h1></div>
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
    <div style="background:#1a1a1a;padding:16px;text-align:center"><p style="color:#999;font-size:.8rem;margin:0">© 2026 Rosterikuppia.fi</p></div>
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
    <div style="background:#1a1a1a;padding:24px;text-align:center"><h1 style="color:#f7b829;margin:0;font-size:1.5rem">ROSTERIKUPPIA.FI</h1></div>
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
    <div style="background:#1a1a1a;padding:16px;text-align:center"><p style="color:#999;font-size:.8rem;margin:0">© 2026 Rosterikuppia.fi</p></div>
  </div>`;
}
