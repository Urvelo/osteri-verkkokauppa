/* ===================================================================
   ERÄT.FI – Supabase Data Loader
   Lataa tuotteet ja arvostelut suoraan Supabasesta (korvaa staattiset
   products.js / reviews.js -tiedostot).
   =================================================================== */

var PRODUCTS = [];
var REVIEWS = {};

var dataReady = (function () {
  var SB = 'https://libmjqruagyogsgnumjy.supabase.co/rest/v1';
  var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpYm1qcXJ1YWd5b2dzZ251bWp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMzQ0ODEsImV4cCI6MjA4ODgxMDQ4MX0.UvCRiEAUGCK6ZBxW07dW_dCDJS4pvRHDxfGjC8avNCw';
  var H = { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY };

  function get(path) {
    return fetch(SB + path, { headers: H }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + path);
      return r.json();
    });
  }

  return Promise.all([
    get('/products?select=*&status=eq.active&order=id'),
    get('/product_images?select=*&order=sort_order'),
    get('/product_skus?select=*&order=id'),
    get('/reviews?select=*&order=id'),
    get('/review_images?select=*&order=sort_order'),
    get('/store_settings?id=eq.default')
  ]).then(function (res) {
    var products = res[0], images = res[1], skus = res[2];
    var reviews = res[3], revImages = res[4], settings = res[5];
    
    var globalDiscount = 0;
    if (settings && settings.length > 0) {
      window.STORE_SETTINGS = settings[0];
      globalDiscount = parseFloat(window.STORE_SETTINGS.global_discount_percentage) || 0;
        // Collect banner texts from campaign banner and/or global discount text
        let bannerTexts = [];
        if (window.STORE_SETTINGS.campaign_active && window.STORE_SETTINGS.campaign_banner) {
            let lines = window.STORE_SETTINGS.campaign_banner.split('\n');
            for (let x of lines) {
                if (!x.trim()) continue;
                let parts = x.split('|');
                let txt = parts[0].trim().replace(/{discount}/g, String(globalDiscount));
                bannerTexts.push({ text: txt, dur: parts.length > 1 ? parseInt(parts[1])*1000 : 4000 });
            }
        }
        if (globalDiscount > 0 && window.STORE_SETTINGS.global_discount_text) {
            let gTxt = window.STORE_SETTINGS.global_discount_text.replace(/{discount}/g, String(globalDiscount));
            bannerTexts.push({ text: gTxt, dur: 5000 });
        }
        if (bannerTexts.length > 0) {
            // Inject ticker text inside the existing header – no layout shift at all
            const ticker = document.createElement('span');
            ticker.style.position = 'absolute';
            ticker.style.left = '50%';
            ticker.style.top = '50%';
            ticker.style.transform = 'translateX(-50%) translateY(-50%)';
            ticker.style.color = '#ecc94b';
            ticker.style.fontWeight = 'bold';
            ticker.style.fontSize = '0.85rem';
            ticker.style.whiteSpace = 'nowrap';
            ticker.style.overflow = 'hidden';
            ticker.style.maxWidth = '40%';
            ticker.style.textOverflow = 'ellipsis';
            ticker.style.pointerEvents = 'none';
            ticker.style.transition = 'opacity 0.4s';
            ticker.style.opacity = '0';

            var attachBanner = function() {
                var header = document.querySelector('header');
                if (header) {
                    // Make sure header allows absolute children
                    if (getComputedStyle(header).position === 'static') {
                        header.style.position = 'relative';
                    }
                    header.appendChild(ticker);
                } else {
                    setTimeout(attachBanner, 50);
                }
            };
            attachBanner();

            let idx = 0;
            function showNext() {
                ticker.style.opacity = '0';
                setTimeout(() => {
                    ticker.innerText = bannerTexts[idx].text;
                    ticker.style.opacity = '1';
                    let wait = bannerTexts[idx].dur;
                    idx = (idx + 1) % bannerTexts.length;
                    setTimeout(showNext, wait);
                }, 400);
            }
            showNext();
        }
    }

    // Group images & skus by product_id
    var imgMap = {}, skuMap = {};
    images.forEach(function (i) { (imgMap[i.product_id] = imgMap[i.product_id] || []).push(i); });
    skus.forEach(function (s) { (skuMap[s.product_id] = skuMap[s.product_id] || []).push(s); });

    // Build PRODUCTS array (same shape as old products.js)
    PRODUCTS = products.map(function (p) {
      var pid = String(p.id);
      var pImgs = imgMap[pid] || [];
      var gallery = pImgs.filter(function (i) { return !i.is_description_image; })
                         .map(function (i) { return i.image_url; });
      var descImgs = pImgs.filter(function (i) { return i.is_description_image; })
                          .map(function (i) { return i.image_url; });
      var sp = parseFloat(p.sale_price) || 0;
      var op = parseFloat(p.original_price) || 0;
      var hasOrig = !!p.show_original_price;
      var hasDisc = !!p.show_discount;
      var dStr = p.discount || '';

      if (globalDiscount > 0) {
        if (!hasOrig || op <= sp) op = sp;
        sp = sp * (1 - globalDiscount / 100);
        hasOrig = true;
        hasDisc = true;
        dStr = '-' + Math.round((1 - sp / op) * 100) + '%';
      }

      var pSkus = (skuMap[pid] || []).map(function (s) {
        var skSp = parseFloat(s.price || 0);
        var skOp = parseFloat(s.original_price || 0);
        if (globalDiscount > 0) {
           if (!skOp || skOp <= skSp) skOp = skSp;
           skSp = skSp * (1 - globalDiscount / 100);
        }
        return {
          id: s.id,
          name: s.name || '',
          price: String(skSp),
          originalPrice: String(skOp),
          stock: parseInt(s.stock || 0, 10),
          image: s.image || ''
        };
      });
      var obj = {
        id: pid,
        title: p.title || '',
        salePrice: sp,
        originalPrice: op,
        currency: p.currency || 'EUR',
        discount: dStr,
        image: p.image || '',
        images: gallery,
        url: p.url || '',
        orders: p.orders || 0,
        score: String(p.score || 0),
        evaluateRate: p.evaluate_rate || '',
        categoryId: p.category_id || '',
        description: p.description || '',
        descriptionImages: descImgs,
        skus: pSkus,
        evaluationCount: String(p.evaluation_count || 0),
        salesCount: String(p.sales_count || 0),
        showDiscount: hasDisc,
        showOriginalPrice: hasOrig,
        showSales: !!p.show_sales,
        showRating: p.show_rating !== false
      };
      if (p.title_fi) obj.title_fi = p.title_fi;
      return obj;
    });
    window.PRODUCTS = PRODUCTS;

    // Supabase prices are already the final selling price (markup applied in admin).
    // Override shopPrice so it does NOT multiply by MARKUP again.
    // This runs after shared.js has defined shopPrice, and before shop.js renders.
    if (typeof window.shopPrice === 'function') {
      window.shopPrice = function(raw) {
        return parseFloat(raw) || 0;
      };
    }

    // Group review images by review_id
    var revImgMap = {};
    revImages.forEach(function (i) { (revImgMap[i.review_id] = revImgMap[i.review_id] || []).push(i); });

    // Build REVIEWS object { product_id: [ {name, country, rating, comment, date, images} ] }
    REVIEWS = {};
    reviews.forEach(function (rv) {
      var obj = {
        name: rv.reviewer_name || '',
        country: rv.country || '',
        rating: rv.rating || 5,
        comment: rv.comment || '',
        date: rv.review_date || ''
      };
      var imgs = (revImgMap[rv.id] || []).map(function (i) { return i.image_url; });
      if (imgs.length) obj.images = imgs;
      (REVIEWS[String(rv.product_id)] = REVIEWS[String(rv.product_id)] || []).push(obj);
    });
    window.REVIEWS = REVIEWS;
  }).catch(function (err) {
    console.error('[Supabase] Data load FAILED:', err);
    // Fallback: leave empty arrays so site still renders
    window.PRODUCTS = PRODUCTS;
    window.REVIEWS = REVIEWS;
  });
})();
