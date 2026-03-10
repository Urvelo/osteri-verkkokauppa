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

  function validateForm() {
    // Required fields
    var fields = [
      { id: 'coFirstName', label: 'Etunimi' },
      { id: 'coLastName', label: 'Sukunimi' },
      { id: 'coEmail', label: 'S\u00e4hk\u00f6posti' },
      { id: 'coAddress', label: 'Osoite' },
      { id: 'coPostal', label: 'Postinumero' },
      { id: 'coCity', label: 'Kaupunki' }
    ];
    for (var fi = 0; fi < fields.length; fi++) {
      var el = document.getElementById(fields[fi].id);
      if (!el || !el.value.trim()) {
        showToast('T\u00e4yt\u00e4 kentt\u00e4: ' + fields[fi].label);
        if (el) el.focus();
        return false;
      }
    }
    // Email format check
    var emailVal = document.getElementById('coEmail').value.trim();
    if (emailVal.indexOf('@') === -1 || emailVal.indexOf('.') === -1) {
      showToast('Tarkista s\u00e4hk\u00f6postiosoite!');
      document.getElementById('coEmail').focus();
      return false;
    }
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
    // Use form data for address — PayPal only handles payment
    var notesEl = document.getElementById('coNotes');
    return {
      id: 'RK-' + Date.now(),
      date: new Date().toISOString(),
      customer: {
        firstName: document.getElementById('coFirstName').value.trim(),
        lastName: document.getElementById('coLastName').value.trim(),
        email: document.getElementById('coEmail').value.trim(),
        phone: (document.getElementById('coPhone').value || '').trim(),
        address: document.getElementById('coAddress').value.trim(),
        postal: document.getElementById('coPostal').value.trim(),
        city: document.getElementById('coCity').value.trim(),
        country: document.getElementById('coCountry').value,
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

    // Build items HTML for emails
    var itemsHtml = order.items.map(function(i) {
      return i.title + (i.variant ? ' (' + i.variant + ')' : '') + ' x' + i.qty + ' = \u20ac' + (i.price * i.qty).toFixed(2);
    }).join('<br>');

    // Build AliExpress links HTML for owner email
    var aliLinksHtml = order.items.map(function(i) {
      var aliUrl = getProductUrl(i.productId);
      var name = i.title + (i.variant ? ' (' + i.variant + ')' : '') + ' x' + i.qty;
      if (aliUrl) return name + '<br><a href="' + aliUrl + '">' + aliUrl + '</a>';
      return name;
    }).join('<br><br>');

    var fullAddress = order.customer.address + ', ' + order.customer.postal + ' ' + order.customer.city + ', ' + order.customer.country;

    // Owner email via EmailJS
    emailjs.send('service_pl0if4u', 'template_5zzvxwf', {
      order_id: order.id,
      paypal_id: order.paypalOrderId || 'N/A',
      date: new Date(order.date).toLocaleDateString('fi-FI'),
      customer_name: order.customer.firstName + ' ' + order.customer.lastName,
      customer_email: order.customer.email,
      customer_phone: order.customer.phone || '-',
      customer_address: fullAddress,
      items_html: itemsHtml,
      shipping: '\u20ac' + order.shipping.toFixed(2),
      total: '\u20ac' + order.total.toFixed(2),
      notes: order.customer.notes || '',
      ali_links_html: aliLinksHtml
    }).then(function() { console.log('Owner email sent'); }).catch(function(e) { console.log('Owner email error:', e); });

    // Customer email via EmailJS
    emailjs.send('service_pl0if4u', 'template_6d2ncuq', {
      customer_name: order.customer.firstName,
      customer_email: order.customer.email,
      order_id: order.id,
      items_html: itemsHtml,
      shipping: '\u20ac' + order.shipping.toFixed(2),
      total: '\u20ac' + order.total.toFixed(2),
      customer_address: fullAddress,
      delivery_time: DELIVERY_DAYS,
      return_cost: '\u20ac' + RETURN_FEE.toFixed(2)
    }).then(function() { console.log('Customer email sent'); }).catch(function(e) { console.log('Customer email error:', e); });

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
        if (!validateForm()) {
          return new Promise(function(resolve, reject) { reject('Validointi ep\u00e4onnistui'); });
        }
        var sums = updateTotals();
        // Prefill payer info from our form so guest checkout has data ready
        var payerData = {
          email_address: (document.getElementById('coEmail').value || '').trim(),
          name: {
            given_name: (document.getElementById('coFirstName').value || '').trim(),
            surname: (document.getElementById('coLastName').value || '').trim()
          },
          address: {
            address_line_1: (document.getElementById('coAddress').value || '').trim(),
            postal_code: (document.getElementById('coPostal').value || '').trim(),
            admin_area_2: (document.getElementById('coCity').value || '').trim(),
            country_code: document.getElementById('coCountry').value || 'FI'
          }
        };
        var phoneVal = (document.getElementById('coPhone').value || '').trim();
        if (phoneVal) {
          payerData.phone = { phone_type: 'MOBILE', phone_number: { national_number: phoneVal.replace(/[^0-9]/g, '').replace(/^358/, '') } };
        }
        return actions.order.create({
          payer: payerData,
          application_context: {
            shipping_preference: 'NO_SHIPPING',
            user_action: 'PAY_NOW'
          },
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
