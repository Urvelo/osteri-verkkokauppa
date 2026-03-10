/* ===== CHECKOUT PAGE ===== */
(function() {
  var RETURN_FEE = 8.99;
  var paypalLoaded = false;
  var orderPending = null;

  function getShippingCost() {
    var el = document.getElementById('coCountry');
    var country = el ? el.value : 'FI';
    return SHIPPING_RATES[country] || SHIPPING_RATES.DEFAULT;
  }

  function getProductUrl(productId) {
    if (!productId || typeof PRODUCTS === 'undefined') return '';
    var p = PRODUCTS.find(function(pr) { return pr.id === productId; });
    return p ? (p.url || '') : '';
  }

  function renderCheckout() {
    // Login required
    if (!currentUser) {
      document.getElementById('checkoutContent').innerHTML =
        '<div class="order-success"><h2>Kirjaudu ensin</h2>' +
        '<p>Tilauksen tekeminen edellytt\u00e4\u00e4 kirjautumista. Kirjaudu Google-tilill\u00e4si.</p>' +
        '<button class="google-btn" onclick="signInWithGoogle()" style="max-width:360px;margin:12px auto">' + GOOGLE_SVG + ' Kirjaudu Googlella</button>' +
        '<a class="btn btn--outline" href="' + ROOT + '" style="margin-top:12px">Takaisin kauppaan</a></div>';
      return;
    }
    if (!cart.length) {
      document.getElementById('checkoutContent').innerHTML =
        '<div class="order-success"><h2>Ostoskori on tyhjä</h2>' +
        '<p>Lis\u00e4\u00e4 tuotteita ostoskoriin ennen kassalle siirtymist\u00e4.</p>' +
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
    updateTotals();
    initPayPalButtons();
  }

  function updateTotals() {
    var subtotal = cart.reduce(function(s, i) { return s + i.price * i.qty; }, 0);
    var shipping = getShippingCost();
    var total = subtotal + shipping;
    document.getElementById('coSubtotal').textContent = '\u20ac' + subtotal.toFixed(2);
    document.getElementById('coShipping').textContent = '\u20ac' + shipping.toFixed(2);
    document.getElementById('coTotal').textContent = '\u20ac' + total.toFixed(2);
    return { subtotal: subtotal, shipping: shipping, total: total };
  }

  window.updateShipping = function() { updateTotals(); };

  function validateCart() {
    // Stock validation
    for (var ci = 0; ci < cart.length; ci++) {
      var stock = getStockForCartItem(cart[ci]);
      if (cart[ci].qty > stock) {
        showToast(cart[ci].title + ': varastossa vain ' + stock + ' kpl!');
        return false;
      }
    }
    if (!currentUser) {
      showToast('Kirjaudu sis\u00e4\u00e4n ennen tilaamista!');
      return false;
    }
    return true;
  }

  function buildOrderData(paypalOrderId, paypalDetails) {
    var sums = updateTotals();
    // Extract address from PayPal response
    var shipping = paypalDetails && paypalDetails.purchase_units && paypalDetails.purchase_units[0] && paypalDetails.purchase_units[0].shipping || {};
    var payer = paypalDetails && paypalDetails.payer || {};
    var payerName = payer.name || {};
    var shippingName = shipping.name || {};
    var shippingAddr = shipping.address || {};
    var notesEl = document.getElementById('coNotes');
    return {
      id: 'RK-' + Date.now(),
      date: new Date().toISOString(),
      customer: {
        firstName: payerName.given_name || shippingName.full_name || '',
        lastName: payerName.surname || '',
        email: payer.email_address || (currentUser ? currentUser.email : ''),
        phone: payer.phone && payer.phone.phone_number && payer.phone.phone_number.national_number || '',
        address: [shippingAddr.address_line_1 || '', shippingAddr.address_line_2 || ''].filter(Boolean).join(', '),
        postal: shippingAddr.postal_code || '',
        city: shippingAddr.admin_area_2 || '',
        country: shippingAddr.country_code || document.getElementById('coCountry').value,
        notes: notesEl ? notesEl.value.trim() : ''
      },
      items: cart.map(function(i) {
        return { productId: i.productId, title: i.title, variant: i.variant, qty: i.qty, price: i.price, image: i.image };
      }),
      shipping: sums.shipping,
      subtotal: sums.subtotal,
      total: sums.total,
      uid: currentUser ? currentUser.uid : null,
      userEmail: currentUser ? currentUser.email : null,
      paypalOrderId: paypalOrderId || null,
      status: 'paid',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
  }

  function finalizeOrder(order) {
    // Save to Firestore
    db.collection('orders').doc(order.id).set(order).then(function() {
      console.log('Tilaus tallennettu:', order.id);
    }).catch(function(err) { console.error('Firestore error:', err); });

    // Build items list with AliExpress links for owner email
    var itemsList = order.items.map(function(i) {
      var aliUrl = getProductUrl(i.productId);
      var line = i.title + (i.variant ? ' (' + i.variant + ')' : '') + ' x' + i.qty + ' = \u20ac' + (i.price * i.qty).toFixed(2);
      if (aliUrl) line += '\nAliExpress: ' + aliUrl;
      return line;
    }).join('\n\n');

    // Owner email notification (with AliExpress links)
    var emailBody = new FormData();
    emailBody.append('Tilausnumero', order.id);
    emailBody.append('PayPal', order.paypalOrderId || 'N/A');
    emailBody.append('Pvm', new Date(order.date).toLocaleDateString('fi-FI'));
    emailBody.append('Asiakas', order.customer.firstName + ' ' + order.customer.lastName);
    emailBody.append('Email', order.customer.email);
    emailBody.append('Puhelin', order.customer.phone);
    emailBody.append('Osoite', order.customer.address + ', ' + order.customer.postal + ' ' + order.customer.city + ', ' + order.customer.country);
    emailBody.append('Tuotteet', itemsList);
    emailBody.append('Toimitus', '\u20ac' + order.shipping.toFixed(2));
    emailBody.append('Yhteensa', '\u20ac' + order.total.toFixed(2));
    if (order.customer.notes) emailBody.append('Lisatiedot', order.customer.notes);
    emailBody.append('_subject', '\u2705 Uusi tilaus: ' + order.id + ' - \u20ac' + order.total.toFixed(2));
    emailBody.append('_template', 'table');
    emailBody.append('_captcha', 'false');
    fetch('https://formsubmit.co/ajax/sovelluksenkehittaja@gmail.com', {
      method: 'POST', body: emailBody
    }).catch(function(e) { console.log('Owner email:', e); });

    // Customer email confirmation
    var custItems = order.items.map(function(i) {
      return i.title + (i.variant ? ' (' + i.variant + ')' : '') + ' x' + i.qty + ' = \u20ac' + (i.price * i.qty).toFixed(2);
    }).join('\n');
    var custEmail = new FormData();
    custEmail.append('Tilausnumero', order.id);
    custEmail.append('Pvm', new Date(order.date).toLocaleDateString('fi-FI'));
    custEmail.append('Tuotteet', custItems);
    custEmail.append('Toimitus', '\u20ac' + order.shipping.toFixed(2));
    custEmail.append('Yhteensa', '\u20ac' + order.total.toFixed(2));
    custEmail.append('Osoite', order.customer.address + ', ' + order.customer.postal + ' ' + order.customer.city + ', ' + order.customer.country);
    custEmail.append('Toimitusaika', DELIVERY_DAYS + ' arkip\u00e4iv\u00e4\u00e4');
    custEmail.append('Palautus', 'Tuotteen palautuskustannus: \u20ac' + RETURN_FEE.toFixed(2));
    custEmail.append('Info', 'Kiitos tilauksestasi! Tilausvahvistus on tallennettu tilillesi osoitteessa rosterikuppia.fi');
    custEmail.append('_subject', 'Tilausvahvistus: ' + order.id + ' - Rosterikuppia.fi');
    custEmail.append('_template', 'table');
    custEmail.append('_captcha', 'false');
    custEmail.append('_replyto', 'sovelluksenkehittaja@gmail.com');
    fetch('https://formsubmit.co/ajax/' + order.customer.email, {
      method: 'POST', body: custEmail
    }).catch(function(e) { console.log('Customer email:', e); });

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
      '<p style="color:var(--fg-muted);font-size:.9rem;">Tilausvahvistus on l\u00e4hetetty osoitteeseen <b>' + order.customer.email + '</b>. Toimitusaika: ' + DELIVERY_DAYS + ' arkip\u00e4iv\u00e4\u00e4.</p>' +
      '<p style="color:var(--fg-muted);font-size:.8rem;margin-top:8px;">Tuotteen palautuskustannus: \u20ac' + RETURN_FEE.toFixed(2) + '</p>' +
      '<div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:20px">' +
      '<button class="btn" onclick="showReceipt(\'' + order.id + '\')">\ud83d\udcc4 N\u00e4yt\u00e4 kuitti</button>' +
      '<button class="btn btn--outline" onclick="downloadReceiptPDF(\'' + order.id + '\')">\ud83d\udce5 Lataa PDF-kuitti</button>' +
      '<a class="btn btn--outline" href="' + ROOT + '">Jatka ostoksia</a></div>';
    showToast('Tilaus vahvistettu ja maksu suoritettu!');
  }

  function initPayPalButtons() {
    var ppContainer = document.getElementById('paypal-button-container');
    if (!ppContainer) return;
    ppContainer.innerHTML = '';

    if (typeof paypal === 'undefined') {
      ppContainer.innerHTML = '<p style="color:var(--fg-muted);font-size:.85rem;text-align:center;padding:12px">PayPal-maksu latautuu...</p>';
      var checkInterval = setInterval(function() {
        if (typeof paypal !== 'undefined') {
          clearInterval(checkInterval);
          renderPayPalButtons();
        }
      }, 500);
      return;
    }
    renderPayPalButtons();
  }

  function renderPayPalButtons() {
    var ppContainer = document.getElementById('paypal-button-container');
    if (!ppContainer || ppContainer.dataset.rendered === 'true') return;
    ppContainer.innerHTML = '';
    ppContainer.dataset.rendered = 'true';

    paypal.Buttons({
      style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'pay', height: 48 },
      createOrder: function(data, actions) {
        if (!validateCart()) {
          return new Promise(function(resolve, reject) { reject('Validointi ep\u00e4onnistui'); });
        }
        var sums = updateTotals();
        return actions.order.create({
          purchase_units: [{
            description: 'Rosterikuppia.fi tilaus',
            amount: {
              currency_code: 'EUR',
              value: sums.total.toFixed(2),
              breakdown: {
                item_total: { currency_code: 'EUR', value: sums.subtotal.toFixed(2) },
                shipping: { currency_code: 'EUR', value: sums.shipping.toFixed(2) }
              }
            }
          }]
        });
      },
      onApprove: function(data, actions) {
        showToast('Maksu hyv\u00e4ksytty, k\u00e4sitell\u00e4\u00e4n...');
        return actions.order.capture().then(function(details) {
          var order = buildOrderData(details.id, details);
          order.paypalDetails = {
            payerEmail: details.payer && details.payer.email_address || '',
            payerName: details.payer && details.payer.name && details.payer.name.given_name || '',
            status: details.status
          };
          finalizeOrder(order);
        });
      },
      onCancel: function() {
        showToast('Maksu peruutettu.');
      },
      onError: function(err) {
        console.error('PayPal error:', err);
        if (err && String(err).indexOf('Validointi') !== -1) return;
        showToast('Maksuvirhe! Yrit\u00e4 uudelleen.');
      }
    }).render('#paypal-button-container');
  }

  document.addEventListener('DOMContentLoaded', function() {
    // Wait for auth before rendering checkout
    auth.onAuthStateChanged(function() {
      renderCheckout();
    });
  });
})();
