/* ===================================================================
   ERÄT.FI – Shared JavaScript
   Firebase, Auth, Cart, UI Components, Receipts, Helpers
   =================================================================== */

// Global: hide any broken image across all pages
document.addEventListener('error', function(e) {
  if (e.target.tagName === 'IMG') {
    e.target.style.display = 'none';
    // For product cards: show text fallback
    var wrap = e.target.closest('.product-image-wrap');
    if (wrap && !wrap.querySelector('.product-image-fallback')) {
      var fb = document.createElement('div');
      fb.className = 'product-image-fallback';
      fb.textContent = e.target.alt || 'Tuote';
      wrap.appendChild(fb);
    }
  }
}, true);

// ROOT is set by each page before loading this script
if (typeof ROOT === 'undefined') var ROOT = '';
if (typeof PAGE_ID === 'undefined') var PAGE_ID = '';

/* ===== CONFIG ===== */
const MARKUP = 2.4;
const DELIVERY_DAYS = '10\u201325';
const SHIPPING_RATES = {
  FI: 4.90, SE: 6.90, NO: 7.90, DK: 6.90,
  DE: 5.90, EE: 5.90, LT: 5.90, LV: 5.90, DEFAULT: 9.90
};

/* ===== FIREBASE ===== */
const firebaseConfig = {
  apiKey: "AIzaSyDS9JDIppAP_qu_F0f0wkinQgLBDptJgQE",
  authDomain: "xn--ert-rla.fi",
  projectId: "rosterii",
  storageBucket: "rosterii.firebasestorage.app",
  messagingSenderId: "800162908964",
  appId: "1:800162908964:web:4e20feff9dfa9bec5801b1",
  measurementId: "G-MMZPM6S73E"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
let currentUser = null;

/* ===== AUTH ===== */
auth.onAuthStateChanged(function(user) {
  currentUser = user;
  var btn = document.getElementById('authBtn');
  var txt = document.getElementById('authBtnText');
  if (!btn || !txt) return;
  if (user) {
    txt.textContent = user.displayName ? user.displayName.split(' ')[0] : 'Tili';
    if (user.photoURL && !btn.querySelector('img')) {
      var img = document.createElement('img');
      img.src = user.photoURL;
      img.alt = '';
      btn.insertBefore(img, txt);
    }
  } else {
    txt.textContent = 'Kirjaudu';
    var img = btn.querySelector('img');
    if (img) img.remove();
  }
});

auth.getRedirectResult().then(function(result) {
  if (result.user) showToast('Tervetuloa, ' + (result.user.displayName || '') + '!');
}).catch(function(err) {
  if (err.code !== 'auth/credential-already-in-use') console.log('Redirect auth:', err.code);
});

function handleAuthClick() {
  if (currentUser) window.location.href = ROOT + 'tili/';
  else document.getElementById('authModal').classList.add('open');
}
function closeAuthModal() {
  document.getElementById('authModal').classList.remove('open');
}
function signInWithGoogle() {
  closeAuthModal();
  var provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).then(function(result) {
    showToast('Tervetuloa, ' + (result.user.displayName || '') + '!');
  }).catch(function(err) {
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user') {
      // Popup blocked — try redirect as last resort
      auth.signInWithRedirect(provider);
    } else if (err.code === 'auth/cancelled-popup-request') {
      // Multiple popups requested, ignore
    } else {
      console.error('Auth error:', err.code, err.message);
      showToast('Kirjautuminen ep\u00e4onnistui. Yrit\u00e4 uudelleen.');
    }
  });
}

/* ===== PRICE HELPERS ===== */
function shopPrice(raw) {
  return Math.ceil(parseFloat(raw) * MARKUP * 100 - 1) / 100;
}
function renderStars(score) {
  var s = parseFloat(score) || 0;
  return '\u2605'.repeat(Math.floor(s)) + '\u2606'.repeat(5 - Math.floor(s));
}
function formatOrders(n) {
  if (n >= 10000) return '10\u2009000+';
  if (n >= 1000) return Math.floor(n / 1000) + '\u2009000+';
  return String(n);
}
function getDiscount(sale, orig) {
  return orig > sale ? Math.round((1 - sale / orig) * 100) : 0;
}
function pTitle(p) { return p.title_fi || p.title; }

/* ===== CART ===== */
var cart = JSON.parse(localStorage.getItem('rk_cart') || '[]');

function saveCart() {
  localStorage.setItem('rk_cart', JSON.stringify(cart));
  updateCartCount();
}

function updateCartCount() {
  var total = cart.reduce(function(s, i) { return s + i.qty; }, 0);
  var el = document.getElementById('cartCount');
  if (el) { el.style.display = total > 0 ? 'flex' : 'none'; el.textContent = total; }

}

function getStockForCartItem(item) {
  if (typeof PRODUCTS === 'undefined') return 99;
  var product = PRODUCTS.find(function(p) { return p.id === item.productId; });
  if (!product) return 99;
  if (product.skus && product.skus.length) {
    var sku = product.skus.find(function(s) { return s.id === item.skuId; });
    if (sku) return sku.stock;
  }
  return 99;
}

function toggleCart() {
  var sidebar = document.getElementById('cartSidebar');
  var overlay = document.getElementById('cartOverlay');
  if (!sidebar || !overlay) return;
  var isOpen = sidebar.classList.contains('open');
  sidebar.classList.toggle('open');
  overlay.classList.toggle('open');
  if (!isOpen) renderCart();
}

function renderCart() {
  var container = document.getElementById('cartItems');
  if (!container) return;
  if (!cart.length) {
    container.innerHTML = '<div class="cart-empty"><p>Ostoskori on tyhjä</p></div>';
    document.getElementById('cartTotal').textContent = '\u20ac0.00';
    return;
  }
  var html = '';
  cart.forEach(function(item, i) {
    var stock = getStockForCartItem(item);
    html += '<div class="cart-item">' +
      '<img class="cart-item-img" src="' + item.image + '" alt="" onerror="this.style.display=\'none\'">' +
      '<div class="cart-item-info">' +
      '<div class="cart-item-title">' + item.title + '</div>' +
      (item.variant ? '<div class="cart-item-variant">' + item.variant + '</div>' : '') +
      '<div class="cart-item-price">\u20ac' + (item.price * item.qty).toFixed(2) + '</div>' +
      '<div class="cart-item-qty">' +
      '<button onclick="cartQty(' + i + ', -1)">\u2212</button>' +
      '<span>' + item.qty + '</span>' +
      '<button onclick="cartQty(' + i + ', 1)">+</button>' +
      '</div>' +
      (stock < 99 ? '<div style="font-size:.7rem;color:var(--fg-muted);margin-top:2px">Varastossa: ' + stock + ' kpl</div>' : '') +
      '<button class="cart-item-remove" onclick="removeCartItem(' + i + ')">Poista</button>' +
      '</div></div>';
  });
  container.innerHTML = html;
  var total = cart.reduce(function(s, i) { return s + i.price * i.qty; }, 0);
  document.getElementById('cartTotal').textContent = '\u20ac' + total.toFixed(2);
}

function cartQty(i, delta) {
  if (delta > 0) {
    var stock = getStockForCartItem(cart[i]);
    if (cart[i].qty >= stock) {
      showToast('Varastossa vain ' + stock + ' kpl!');
      return;
    }
  }
  cart[i].qty = Math.max(1, cart[i].qty + delta);
  saveCart();
  renderCart();
}

function removeCartItem(i) {
  cart.splice(i, 1);
  saveCart();
  renderCart();
}

function goToCheckout() {
  if (!cart.length) { showToast('Ostoskori on tyhjä!'); return; }
  toggleCart();
  window.location.href = ROOT + 'kassa/';
}

/* ===== TOAST ===== */
function showToast(msg) {
  var t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(function() { t.classList.remove('show'); }, 2500);
}

/* ===== NAVIGATION ===== */
function openProduct(id) {
  window.location.href = ROOT + 'tuote/?id=' + id;
}

function zoomImage(src) {
  var img = document.getElementById('zoomImg');
  var overlay = document.getElementById('zoomOverlay');
  if (img && overlay) { img.src = src; overlay.classList.add('open'); }
}



/* ===== RECEIPT ===== */
function getOrderData(orderId) {
  var localOrders = JSON.parse(localStorage.getItem('rk_orders') || '[]');
  return localOrders.find(function(o) { return o.id === orderId; });
}

function showReceipt(orderId) {
  var order = getOrderData(orderId);
  if (!order) {
    db.collection('orders').doc(orderId).get().then(function(doc) {
      if (doc.exists) buildReceiptHTML(doc.data());
      else showToast('Tilausta ei l\u00f6ytynyt');
    }).catch(function() { showToast('Tilausta ei l\u00f6ytynyt'); });
    return;
  }
  buildReceiptHTML(order);
}

function buildReceiptHTML(order) {
  var c = order.customer || {};
  var date = order.date ? new Date(order.date).toLocaleDateString('fi-FI') : '\u2013';
  var itemRows = '';
  (order.items || []).forEach(function(item) {
    var clickAttr = item.productId ? ' onclick="closeReceipt();openProduct(\'' + item.productId + '\')" style="color:#1a68b0;cursor:pointer;text-decoration:underline"' : '';
    itemRows += '<tr><td' + clickAttr + '>' + item.title +
      (item.variant ? '<br><small style="color:#999">' + item.variant + '</small>' : '') +
      '</td><td class="right">' + item.qty + '</td><td class="right">\u20ac' + item.price.toFixed(2) +
      '</td><td class="right">\u20ac' + (item.price * item.qty).toFixed(2) + '</td></tr>';
  });
  var html = '<div class="receipt-header"><h1>ERÄT.FI</h1><p>Kuitti / Tilausvahvistus</p></div>' +
    '<div class="receipt-meta"><div><b>Tilausnumero:</b> ' + order.id + '<br><b>P\u00e4iv\u00e4m\u00e4\u00e4r\u00e4:</b> ' + date + '</div>' +
    '<div><b>Asiakas:</b> ' + (c.firstName || '') + ' ' + (c.lastName || '') +
    '<br><b>S\u00e4hk\u00f6posti:</b> ' + (c.email || '') + '<br><b>Puhelin:</b> ' + (c.phone || '') + '</div></div>' +
    '<div style="margin-bottom:8px;font-size:.85rem"><b>Toimitusosoite:</b> ' +
    (c.address || '') + ', ' + (c.postal || '') + ' ' + (c.city || '') + ', ' + (c.country || '') + '</div>' +
    '<table class="receipt-table"><thead><tr><th>Tuote</th><th class="right">Kpl</th><th class="right">\u00e1-hinta</th><th class="right">Yht.</th></tr></thead>' +
    '<tbody>' + itemRows + '</tbody></table>' +
    '<div class="receipt-totals">' +
    '<div class="row"><span>V\u00e4lisumma:</span><span>\u20ac' + (order.subtotal || 0).toFixed(2) + '</span></div>' +
    '<div class="row"><span>Toimitus:</span><span>\u20ac' + (order.shipping || 0).toFixed(2) + '</span></div>' +
    '<div class="row grand"><span>Yhteens\u00e4:</span><span>\u20ac' + (order.total || 0).toFixed(2) + '</span></div></div>' +
    '<div class="receipt-footer"><p>Kiitos tilauksestasi! \ud83d\ude4f</p><p>Toimitusaika: ' + DELIVERY_DAYS + ' arkip\u00e4iv\u00e4\u00e4</p>' +
    '<p style="margin-top:8px">\u00a9 2026 ERÄT.FI</p></div>' +
    '<div class="receipt-actions">' +
    '<button class="btn btn--sm" onclick="downloadReceiptPDF(\'' + order.id + '\')">\ud83d\udce5 Lataa PDF</button>' +
    '<button class="btn btn--sm btn--outline" onclick="closeReceipt()">Sulje</button></div>';
  document.getElementById('receiptPaper').innerHTML = html;
  document.getElementById('receiptOverlay').classList.add('open');
}

function closeReceipt() {
  document.getElementById('receiptOverlay').classList.remove('open');
}

function downloadReceiptPDF(orderId) {
  var order = getOrderData(orderId);
  if (!order) {
    db.collection('orders').doc(orderId).get().then(function(doc) {
      if (doc.exists) _loadJsPDFAndGenerate(doc.data());
      else showToast('Tilausta ei l\u00f6ytynyt');
    }).catch(function() { showToast('PDF-virhe'); });
    return;
  }
  _loadJsPDFAndGenerate(order);
}

function _loadJsPDFAndGenerate(order) {
  if (window.jspdf) { generatePDF(order); return; }
  var script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  script.onload = function() { generatePDF(order); };
  script.onerror = function() { showToast('PDF-virhe: jsPDF lataus ep\u00e4onnistui'); };
  document.head.appendChild(script);
}

function generatePDF(order) {
  var jsPDF = window.jspdf.jsPDF;
  var doc = new jsPDF();
  var c = order.customer || {};
  var date = order.date ? new Date(order.date).toLocaleDateString('fi-FI') : '-';
  var pg = doc.internal.pageSize;
  var w = pg.getWidth();

  doc.setFillColor(26, 26, 26);
  doc.rect(0, 0, w, 35, 'F');
  doc.setFontSize(22);
  doc.setTextColor(247, 184, 41);
  doc.text('ERÄT.FI', w / 2, 18, { align: 'center' });
  doc.setFontSize(9);
  doc.setTextColor(200, 200, 200);
  doc.text('Kuitti / Tilausvahvistus', w / 2, 28, { align: 'center' });

  doc.setTextColor(50, 50, 50);
  doc.setFontSize(10);
  var y = 48;
  doc.setFont(undefined, 'bold');
  doc.text('Tilausnumero:', 14, y);
  doc.setFont(undefined, 'normal');
  doc.text(order.id || '', 55, y);
  y += 7;
  doc.setFont(undefined, 'bold');
  doc.text('Pvm:', 14, y);
  doc.setFont(undefined, 'normal');
  doc.text(date, 55, y);

  doc.setFont(undefined, 'bold');
  doc.text('Asiakas:', 110, 48);
  doc.setFont(undefined, 'normal');
  doc.text((c.firstName || '') + ' ' + (c.lastName || ''), 140, 48);
  doc.text(c.email || '', 140, 55);
  doc.text(c.phone || '', 140, 62);

  y += 12;
  doc.setFont(undefined, 'bold');
  doc.text('Toimitusosoite:', 14, y);
  doc.setFont(undefined, 'normal');
  y += 6;
  doc.text((c.address || '') + ', ' + (c.postal || '') + ' ' + (c.city || '') + ', ' + (c.country || ''), 14, y);

  y += 14;
  doc.setFillColor(245, 245, 245);
  doc.rect(14, y - 5, w - 28, 8, 'F');
  doc.setFontSize(8);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(120, 120, 120);
  doc.text('TUOTE', 16, y);
  doc.text('KPL', 130, y, { align: 'center' });
  doc.text('A-HINTA', 157, y, { align: 'right' });
  doc.text('YHTEENSA', w - 16, y, { align: 'right' });

  doc.setFont(undefined, 'normal');
  doc.setTextColor(50, 50, 50);
  doc.setFontSize(9);
  y += 8;
  (order.items || []).forEach(function(item) {
    var title = item.title || '';
    if (title.length > 55) title = title.substring(0, 53) + '...';
    doc.text(title, 16, y);
    if (item.variant) {
      doc.setFontSize(7);
      doc.setTextColor(150, 150, 150);
      doc.text(item.variant.substring(0, 50), 16, y + 4);
      doc.setFontSize(9);
      doc.setTextColor(50, 50, 50);
    }
    doc.text(String(item.qty), 130, y, { align: 'center' });
    doc.text('EUR ' + item.price.toFixed(2), 157, y, { align: 'right' });
    doc.text('EUR ' + (item.price * item.qty).toFixed(2), w - 16, y, { align: 'right' });
    y += item.variant ? 10 : 7;
    doc.setDrawColor(230, 230, 230);
    doc.line(14, y - 2, w - 14, y - 2);
  });

  y += 6;
  doc.setFontSize(9);
  doc.text('Valisumma:', 140, y, { align: 'right' });
  doc.text('EUR ' + (order.subtotal || 0).toFixed(2), w - 16, y, { align: 'right' });
  y += 6;
  doc.text('Toimitus:', 140, y, { align: 'right' });
  doc.text('EUR ' + (order.shipping || 0).toFixed(2), w - 16, y, { align: 'right' });
  y += 3;
  doc.setDrawColor(247, 184, 41);
  doc.setLineWidth(1);
  doc.line(120, y, w - 14, y);
  y += 7;
  doc.setFontSize(13);
  doc.setFont(undefined, 'bold');
  doc.text('Yhteensa:', 140, y, { align: 'right' });
  doc.setTextColor(247, 184, 41);
  doc.text('EUR ' + (order.total || 0).toFixed(2), w - 16, y, { align: 'right' });

  y += 20;
  doc.setTextColor(150, 150, 150);
  doc.setFontSize(8);
  doc.setFont(undefined, 'normal');
  doc.text('Kiitos tilauksestasi! Toimitusaika: ' + DELIVERY_DAYS + ' arkipaivaa.', w / 2, y, { align: 'center' });
  y += 5;
  doc.text('(c) 2026 ERÄT.FI', w / 2, y, { align: 'center' });

  doc.save('kuitti_' + order.id + '.pdf');
  showToast('PDF-kuitti ladattu!');
}

/* ===== GOOGLE SVG (for auth buttons) ===== */
var GOOGLE_SVG = '<svg viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';

/* ===== INJECT SHARED UI ===== */
function injectSharedUI() {
  // Header
  var headerHTML = '<header><div class="container header-inner">' +
    '<a class="logo" href="' + ROOT + '"><img src="' + ROOT + 'logo.png" alt="Erät.fi" class="logo-img"></a>' +
    '<nav>' +
    '<a href="' + ROOT + '">Tuotteet</a>' +
    '<a href="' + ROOT + 'tili/">Tilini</a>' +
    '<button class="user-btn" id="authBtn" onclick="handleAuthClick()" title="Kirjaudu">' +
    '<span id="authBtnText">Kirjaudu</span></button>' +
    '<button class="cart-btn" onclick="toggleCart()" title="Ostoskori">' +
    '\ud83d\uded2 <span class="cart-count" id="cartCount" style="display:none">0</span></button>' +
    '</nav></div></header>';

  // Cart sidebar
  var cartHTML = '<div class="cart-overlay" id="cartOverlay" onclick="toggleCart()"></div>' +
    '<div class="cart-sidebar" id="cartSidebar">' +
    '<div class="cart-header"><h3>\ud83d\uded2 Ostoskori</h3>' +
    '<button class="cart-close" onclick="toggleCart()">\u2715</button></div>' +
    '<div class="cart-items" id="cartItems"></div>' +
    '<div class="cart-footer">' +
    '<div class="cart-total"><span>Yhteens\u00e4:</span><span class="price" id="cartTotal">\u20ac0.00</span></div>' +
    '<button class="btn" style="width:100%;text-align:center;padding:16px;font-size:1rem" onclick="goToCheckout()">Siirry kassalle \u2192</button>' +
    '</div></div>';

  // Bottom nav removed — navigation only via header

  // Auth modal
  var authHTML = '<div class="auth-modal-overlay" id="authModal"><div class="auth-modal">' +
    '<h3>Kirjaudu sis\u00e4\u00e4n</h3>' +
    '<p>Kirjaudu Google-tilill\u00e4si helposti ja turvallisesti.</p>' +
    '<button class="google-btn" onclick="signInWithGoogle()">' + GOOGLE_SVG + ' Kirjaudu Googlella</button>' +
    '<button class="close-auth" onclick="closeAuthModal()">Jatka ilman kirjautumista</button>' +
    '</div></div>';

  // Zoom overlay
  var zoomHTML = '<div class="zoom-overlay" id="zoomOverlay" onclick="this.classList.remove(\'open\')"><img id="zoomImg" src=""></div>';

  // Toast
  var toastHTML = '<div class="toast" id="toast"></div>';

  // Receipt overlay
  var receiptHTML = '<div class="receipt-overlay" id="receiptOverlay" onclick="if(event.target===this)closeReceipt()">' +
    '<div class="receipt-paper" id="receiptPaper"></div></div>';

  // Footer
  var footerHTML = '<footer><div class="container">' +
    '<p style="margin-bottom:12px;"><img src="' + ROOT + 'logo.png" alt="Erät.fi" style="height:36px;width:auto;"></p>' +
    '<p>Suomalainen verkkokauppa \u2013 kestävät metallikupit retkeilyyn ja eräilyyn.</p>' +
    '<p style="margin-top:16px;">' +
    '<a href="' + ROOT + 'tiedot/toimitus.html" style="margin:0 12px;">Toimitus &amp; palautukset</a> \u2022 ' +
    '<a href="' + ROOT + 'tiedot/tietosuoja.html" style="margin:0 12px;">Tietosuoja</a> \u2022 ' +
    '<a href="' + ROOT + 'tiedot/yhteyta.html" style="margin:0 12px;">Ota yhteytt\u00e4</a></p>' +
    '<p style="margin-top:20px;font-size:.7rem;color:#444;"><a href="' + ROOT + 'palautus/" style="color:#555">Palautuslomake</a></p>' +
    '<p style="margin-top:12px;font-size:.7rem;color:#444;">\u00a9 2026 Erät.fi \u2013 Kaikki oikeudet pid\u00e4tet\u00e4\u00e4n. Y-tunnus: Tulossa</p>' +
    '</div></footer>';

  // Inject header at top
  document.body.insertAdjacentHTML('afterbegin', headerHTML);

  // Inject footer after main content
  var main = document.getElementById('pageContent');
  if (main) {
    main.insertAdjacentHTML('afterend', footerHTML);
  }

  // Inject overlays at end (no bottom nav)
  document.body.insertAdjacentHTML('beforeend', cartHTML + authHTML + zoomHTML + toastHTML + receiptHTML);

  // Update cart counts
  updateCartCount();
}

/* ===== COOKIE CONSENT ===== */
function hasConsent() {
  return localStorage.getItem('rk_cookies') === 'accepted';
}

function showCookieBanner() {
  if (localStorage.getItem('rk_cookies')) return; // already answered
  var banner = document.createElement('div');
  banner.id = 'cookieBanner';
  banner.className = 'cookie-banner';
  banner.innerHTML =
    '<div class="cookie-inner">' +
    '<p>\ud83c\udf6a Käytämme evästeitä kävijämäärän ja maakohtaisen tilastoinnin seurantaan. ' +
    'Evästeet auttavat meitä parantamaan palveluamme. ' +
    '<a href="' + ROOT + 'tiedot/tietosuoja.html">Lue lisää</a></p>' +
    '<div class="cookie-buttons">' +
    '<button class="btn cookie-accept" onclick="acceptCookies()">Hyväksy</button>' +
    '<button class="btn btn--outline cookie-decline" onclick="declineCookies()">Hylkää</button>' +
    '</div></div>';
  document.body.appendChild(banner);
  // Animate in
  requestAnimationFrame(function() {
    requestAnimationFrame(function() { banner.classList.add('open'); });
  });
}

function acceptCookies() {
  localStorage.setItem('rk_cookies', 'accepted');
  closeCookieBanner();
  trackVisit(); // start tracking now
}

function declineCookies() {
  localStorage.setItem('rk_cookies', 'declined');
  closeCookieBanner();
}

function closeCookieBanner() {
  var b = document.getElementById('cookieBanner');
  if (b) {
    b.classList.remove('open');
    setTimeout(function() { b.remove(); }, 400);
  }
}

/* ===== VISITOR ANALYTICS ===== */
function trackVisit() {
  var today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  var key = 'rk_visit_' + today;
  if (localStorage.getItem(key)) return; // already counted today
  localStorage.setItem(key, '1');

  // Clean old visit flags (keep only last 3 days)
  for (var i = 0; i < localStorage.length; i++) {
    var k = localStorage.key(i);
    if (k && k.startsWith('rk_visit_') && k !== key) {
      localStorage.removeItem(k);
    }
  }

  // Get country from free IP geolocation API, then save to Firestore
  fetch('https://ip-api.com/json/?fields=status,countryCode')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var country = (data && data.status === 'success' && data.countryCode) ? data.countryCode : 'XX';
      saveVisit(today, country);
    })
    .catch(function() {
      saveVisit(today, 'XX');
    });
}

function saveVisit(date, country) {
  var docId = date; // one document per day: "2026-03-11"
  var ref = db.collection('analytics').doc(docId);
  ref.get().then(function(doc) {
    if (doc.exists) {
      var d = doc.data();
      var countries = d.countries || {};
      countries[country] = (countries[country] || 0) + 1;
      ref.update({
        count: (d.count || 0) + 1,
        countries: countries
      });
    } else {
      var countries = {};
      countries[country] = 1;
      ref.set({
        date: date,
        count: 1,
        countries: countries
      });
    }
  }).catch(function(e) {
    console.warn('Visit tracking error:', e);
  });
}

document.addEventListener('DOMContentLoaded', function() {
  injectSharedUI();
  showCookieBanner();
  if (hasConsent()) trackVisit();
});
