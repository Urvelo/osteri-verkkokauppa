/* ===== CHECKOUT PAGE ===== */
(function() {
  var RETURN_FEE = 8.99;
  window.APPLIED_DISCOUNT = null;
  var paypalLoaded = false;
  var orderPending = null;

  
  function getShippingCost(subtotal) {
    if (window.STORE_SETTINGS) {
        var threshold = window.STORE_SETTINGS.free_shipping_threshold || 0;
        var fee = window.STORE_SETTINGS.shipping_fee || 0;
        
        if (threshold > 0 && subtotal >= threshold) {
            return 0; // Free shipping threshold met
        }
        return fee; // Apply global shipping fee
    }
    
    // Fallback if settings didn't load
    var el = document.getElementById('coCountry');
    var country = el ? el.value : 'FI';
    return SHIPPING_RATES[country] || SHIPPING_RATES.DEFAULT || 0;
  }

  function getProductUrl(productId) {
    if (!productId || typeof PRODUCTS === 'undefined') return '';
    var p = PRODUCTS.find(function(pr) { return pr.id === productId; });
    return p ? (p.url || '') : '';
  }

  function renderCheckout() {
    /* Login requirement removed */
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
        '<img src="' + escAttr(item.image) + '" alt="" onerror="this.style.display=\'none\'">' +
        '<div class="checkout-item-info">' +
        '<div class="checkout-item-title">' + esc(shortTitle) + '</div>' +
        '<div class="checkout-item-meta">' + (item.variant ? esc(item.variant) + ' \u00b7 ' : '') + item.qty + ' kpl</div>' +
        '<div class="checkout-item-price">\u20ac' + (item.price * item.qty).toFixed(2) + '</div>' +
        '</div></div>';
    });
    document.getElementById('checkoutItems').innerHTML = html;
    updateTotals();
    initPayPalButtons();
  }

  
  function updateTotals() {
    var subtotal = cart.reduce(function(s, i) { return s + i.price * i.qty; }, 0);
    
    var discountAmount = 0;
    
    // 1. Global Discount from Store Settings
    if (window.STORE_SETTINGS && window.STORE_SETTINGS.global_discount_percentage > 0) {
        discountAmount += subtotal * (window.STORE_SETTINGS.global_discount_percentage / 100);
    }
    
    // 2. Applied Discount Code
    if (window.APPLIED_DISCOUNT) {
        if (window.APPLIED_DISCOUNT.discount_percentage) {
            discountAmount += (subtotal - discountAmount) * (window.APPLIED_DISCOUNT.discount_percentage / 100);
        } else if (window.APPLIED_DISCOUNT.discount_amount) {
            discountAmount += window.APPLIED_DISCOUNT.discount_amount;
        }
    }
    
    // Ensure discount doesn't exceed subtotal
    if (discountAmount > subtotal) discountAmount = subtotal;
    
    var subtotalAfterDiscount = subtotal - discountAmount;
    
    var shipping = getShippingCost(subtotalAfterDiscount);
    var total = subtotalAfterDiscount + shipping;
    
    document.getElementById('coSubtotal').textContent = '€' + subtotal.toFixed(2);
    
    // Show discount row if > 0
    var discountRow = document.getElementById('coDiscountRow');
    if (discountAmount > 0) {
        if (!discountRow) {
            var ds = document.createElement('div');
            ds.className = 'checkout-summary-row';
            ds.id = 'coDiscountRow';
            ds.style.color = '#d32f2f';
            ds.innerHTML = '<span>Alennus</span><span id="coDiscountVal">-€' + discountAmount.toFixed(2) + '</span>';
            // Insert after subtotal
            var subRow = document.getElementById('coSubtotal').parentNode;
            subRow.parentNode.insertBefore(ds, subRow.nextSibling);
        } else {
            document.getElementById('coDiscountVal').textContent = '-€' + discountAmount.toFixed(2);
        }
    } else if (discountRow) {
        discountRow.parentNode.removeChild(discountRow);
    }
    
    document.getElementById('coShipping').textContent = '€' + shipping.toFixed(2);
    document.getElementById('coTotal').textContent = '€' + total.toFixed(2);
    
    return { subtotal: subtotal, discount: discountAmount, shipping: shipping, total: total };
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
    /* login ok */
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

  
  function initDiscountCode() {
     var btn = document.getElementById('applyDiscountBtn');
     var msg = document.getElementById('discountMessage');
     var codeInput = document.getElementById('discountCode');
     
     if (!btn) return;
     
     btn.addEventListener('click', async function() {
         var code = codeInput.value.trim().toUpperCase();
         if (!code) return;
         
         btn.disabled = true;
         btn.textContent = '...';
         
         const { data, error } = await window.supabaseClient
             .from('discount_codes')
             .select('*')
             .eq('code', code)
             .single();
             
         btn.disabled = false;
         btn.textContent = 'Käytä';
             
         if (error || !data || !data.is_active) {
             msg.style.color = 'red';
             msg.textContent = 'Koodia ei löytynyt tai se ei ole voimassa.';
             window.APPLIED_DISCOUNT = null;
         } else {
             msg.style.color = 'green';
             msg.textContent = 'Koodi lisätty!';
             window.APPLIED_DISCOUNT = data;
         }
         updateTotals();
     });
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
            description: 'Erät.fi tilaus',
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

  // --- STRIPE INTEGRATION ---
  var stripe = null;
  if (typeof Stripe !== 'undefined') {
    stripe = Stripe("pk_live_51TARPH1EkTrm4A7gPPvCZ4tyq9PNoygotdG5tB8V1j2nnOMAJJT1PtDKTKSucz2ezKFSfwqUnoN471wSVyUssccc00XUhvXgqD");
  }

  function initStripeButton() {
    var btn = document.getElementById('stripeCheckoutBtn');
    if (!btn) return;
    btn.addEventListener('click', function() {
      if (!validateForm()) return;
      
      var orderId = 'RK-STRIPE-' + Date.now();
      var pendingOrder = buildOrderData(orderId, null);
      
      // Save pending order to local storage so we can finalize it when returning
      localStorage.setItem('rk_pending_order', JSON.stringify(pendingOrder));

      btn.disabled = true;
      btn.textContent = 'Luodaan maksutapahtumaa...';

      // Call our Firebase function to create a Checkout Session
      // Using explicit URL for the Cloud Function. Let's make sure it's the correct functions URL or relative if hosted together.
      // Usually, functions are hosted under same domain if rewritten in firebase.json, or on cloudfunctions.net.
      // We will assume a relative path if rewritten, or we can use the cloudfunctions URL if known.
      // Since we don't know the full URL easily here, we'll try `/createCheckoutSession` assuming a rewrite in firebase.json,
      // or we can fetch the project ID dynamically. Let's assume Firebase Hosting rewrite.
      fetch('/api/createCheckoutSession', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: pendingOrder.items,
          orderId: orderId,
          customerEmail: pendingOrder.customer.email,
          shippingCost: pendingOrder.shipping
        })
      })
      .then(function(res) {
        if (!res.ok) throw new Error('Network response was not ok');
        return res.json();
      })
      .then(function(session) {
        if (session.error) throw new Error(session.error);
        return stripe.redirectToCheckout({ sessionId: session.id });
      })
      .catch(function(err) {
        console.error('Stripe error:', err);
        showToast('Virhe maksun aloituksessa. Yrit\u00e4 uudelleen.');
        btn.disabled = false;
        btn.textContent = '💳 Maksa kortilla / Verkkopankilla (Stripe)';
      });
    });
  }

  function handleStripeReturn() {
    var urlParams = new URLSearchParams(window.location.search);
    var sessionId = urlParams.get('session_id');
    var orderId = urlParams.get('order_id');
    var status = urlParams.get('status');

    if (status === 'cancel') {
      showToast('Maksu peruutettiin.');
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (sessionId && orderId) {
      // User returned successfully from Stripe checkout
      var pendingStr = localStorage.getItem('rk_pending_order');
      if (pendingStr) {
        try {
          var pendingOrder = JSON.parse(pendingStr);
          // Make sure it matches
          if (pendingOrder.id === orderId) {
            // Finalize
            pendingOrder.status = 'paid';
            pendingOrder.stripeSessionId = sessionId;
            finalizeOrder(pendingOrder);
            localStorage.removeItem('rk_pending_order');
            
            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        } catch (e) {
          console.error("Error finalizing Stripe order:", e);
        }
      }
    }
  }

  document.addEventListener('DOMContentLoaded', function() {
    // Wait for Supabase data + auth before rendering checkout
    (typeof dataReady !== 'undefined' ? dataReady : Promise.resolve()).then(function() {
      auth.onAuthStateChanged(function() {
        handleStripeReturn();
        renderCheckout();
        initStripeButton();
        initDiscountCode();
      });
    });
  });
})();
