/* ===== CHECKOUT PAGE ===== */
(function() {

  function getShippingCost() {
    var el = document.getElementById('coCountry');
    var country = el ? el.value : 'FI';
    return SHIPPING_RATES[country] || SHIPPING_RATES.DEFAULT;
  }

  function renderCheckout() {
    if (!cart.length) {
      document.getElementById('checkoutContent').innerHTML =
        '<div class="order-success"><h2>Ostoskori on tyhjä</h2>' +
        '<p>Lisää tuotteita ostoskoriin ennen kassalle siirtymistä.</p>' +
        '<a class="btn" href="' + ROOT + '">Selaa tuotteita</a></div>';
      return;
    }
    var html = '';
    cart.forEach(function(item) {
      var shortTitle = item.title.length > 40 ? item.title.substring(0, 38) + '\u2026' : item.title;
      html += '<div class="checkout-item">' +
        '<img src="' + item.image + '" alt="">' +
        '<div class="checkout-item-info">' +
        '<div class="checkout-item-title">' + shortTitle + '</div>' +
        '<div class="checkout-item-meta">' + (item.variant ? item.variant + ' \u00b7 ' : '') + item.qty + ' kpl</div>' +
        '<div class="checkout-item-price">\u20ac' + (item.price * item.qty).toFixed(2) + '</div>' +
        '</div></div>';
    });
    document.getElementById('checkoutItems').innerHTML = html;
    var subtotal = cart.reduce(function(s, i) { return s + i.price * i.qty; }, 0);
    var shipping = getShippingCost();
    document.getElementById('coSubtotal').textContent = '\u20ac' + subtotal.toFixed(2);
    document.getElementById('coShipping').textContent = '\u20ac' + shipping.toFixed(2);
    document.getElementById('coTotal').textContent = '\u20ac' + (subtotal + shipping).toFixed(2);
  }

  window.updateShipping = function() { renderCheckout(); };

  window.placeOrder = function() {
    var fields = ['coFirstName', 'coLastName', 'coEmail', 'coPhone', 'coAddress', 'coPostal', 'coCity'];
    for (var k = 0; k < fields.length; k++) {
      var el = document.getElementById(fields[k]);
      if (!el.value.trim()) {
        el.style.borderColor = 'var(--danger)';
        el.focus();
        showToast('Täytä kaikki pakolliset kentät!');
        return;
      }
      el.style.borderColor = '';
    }

    // Stock validation before placing order
    for (var ci = 0; ci < cart.length; ci++) {
      var stock = getStockForCartItem(cart[ci]);
      if (cart[ci].qty > stock) {
        showToast(cart[ci].title + ': varastossa vain ' + stock + ' kpl!');
        return;
      }
    }

    var shipping = getShippingCost();
    var subtotal = cart.reduce(function(s, i) { return s + i.price * i.qty; }, 0);
    var order = {
      id: 'RK-' + Date.now(),
      date: new Date().toISOString(),
      customer: {
        firstName: document.getElementById('coFirstName').value.trim(),
        lastName: document.getElementById('coLastName').value.trim(),
        email: document.getElementById('coEmail').value.trim(),
        phone: document.getElementById('coPhone').value.trim(),
        address: document.getElementById('coAddress').value.trim(),
        postal: document.getElementById('coPostal').value.trim(),
        city: document.getElementById('coCity').value.trim(),
        country: document.getElementById('coCountry').value,
        notes: document.getElementById('coNotes').value.trim()
      },
      items: cart.map(function(i) {
        return { productId: i.productId, title: i.title, variant: i.variant, qty: i.qty, price: i.price, image: i.image };
      }),
      shipping: shipping,
      subtotal: subtotal,
      total: subtotal + shipping,
      uid: currentUser ? currentUser.uid : null,
      userEmail: currentUser ? currentUser.email : null,
      status: 'new',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    // Save to Firestore
    db.collection('orders').doc(order.id).set(order).then(function() {
      console.log('Tilaus tallennettu:', order.id);
    }).catch(function(err) {
      console.error('Firestore error:', err);
    });

    // Send email notification
    var itemsList = order.items.map(function(i) {
      return i.title + (i.variant ? ' (' + i.variant + ')' : '') + ' x' + i.qty + ' = \u20ac' + (i.price * i.qty).toFixed(2);
    }).join('\n');
    var emailBody = new FormData();
    emailBody.append('Tilausnumero', order.id);
    emailBody.append('Pvm', new Date(order.date).toLocaleDateString('fi-FI'));
    emailBody.append('Asiakas', order.customer.firstName + ' ' + order.customer.lastName);
    emailBody.append('Email', order.customer.email);
    emailBody.append('Puhelin', order.customer.phone);
    emailBody.append('Osoite', order.customer.address + ', ' + order.customer.postal + ' ' + order.customer.city + ', ' + order.customer.country);
    emailBody.append('Tuotteet', itemsList);
    emailBody.append('Toimitus', '\u20ac' + order.shipping.toFixed(2));
    emailBody.append('Yhteensa', '\u20ac' + order.total.toFixed(2));
    if (order.customer.notes) emailBody.append('Lisatiedot', order.customer.notes);
    emailBody.append('_subject', 'Uusi tilaus: ' + order.id + ' - \u20ac' + order.total.toFixed(2));
    emailBody.append('_template', 'table');
    emailBody.append('_captcha', 'false');
    fetch('https://formsubmit.co/ajax/sovelluksenkehittaja@gmail.com', {
      method: 'POST', body: emailBody
    }).catch(function(e) { console.log('Email notification:', e); });

    // Save to localStorage
    var orders = JSON.parse(localStorage.getItem('rk_orders') || '[]');
    orders.push(order);
    localStorage.setItem('rk_orders', JSON.stringify(orders));

    // Clear cart
    cart = [];
    saveCart();

    // Show success
    document.getElementById('checkoutContent').style.display = 'none';
    var successEl = document.getElementById('orderSuccess');
    successEl.style.display = 'block';
    successEl.innerHTML = '<h2>\u2713 Kiitos tilauksestasi!</h2>' +
      '<p>Tilausnumero: <b style="color:var(--accent);font-size:1.1rem">' + order.id + '</b></p>' +
      '<p style="color:var(--fg-muted);font-size:.9rem;">Tilausvahvistus l\u00e4hetet\u00e4\u00e4n s\u00e4hk\u00f6postiisi. Toimitusaika: ' + DELIVERY_DAYS + ' arkip\u00e4iv\u00e4\u00e4.</p>' +
      '<div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:20px">' +
      '<button class="btn" onclick="showReceipt(\'' + order.id + '\')">\ud83d\udcc4 N\u00e4yt\u00e4 kuitti</button>' +
      '<button class="btn btn--outline" onclick="downloadReceiptPDF(\'' + order.id + '\')">\ud83d\udce5 Lataa PDF-kuitti</button>' +
      '<a class="btn btn--outline" href="' + ROOT + '">Jatka ostoksia</a></div>';
    showToast('Tilaus vahvistettu!');
  };

  // Pre-fill user info if logged in
  function prefillUser() {
    if (!currentUser) return;
    var emailField = document.getElementById('coEmail');
    if (emailField && !emailField.value) emailField.value = currentUser.email || '';
    var nameField = document.getElementById('coFirstName');
    if (nameField && !nameField.value && currentUser.displayName) {
      var parts = currentUser.displayName.split(' ');
      nameField.value = parts[0] || '';
      var lastField = document.getElementById('coLastName');
      if (lastField && !lastField.value) lastField.value = parts.slice(1).join(' ') || '';
    }
  }

  document.addEventListener('DOMContentLoaded', function() {
    renderCheckout();
    // Wait a bit for auth to initialize
    setTimeout(prefillUser, 500);
    auth.onAuthStateChanged(function() { prefillUser(); });
  });
})();
