/* ===== ACCOUNT PAGE ===== */
(function() {

  function initAccount() {
    // Add Google SVG to login button
    var loginBtn = document.querySelector('#accountLoggedOut .google-btn');
    if (loginBtn) loginBtn.innerHTML = GOOGLE_SVG + ' Kirjaudu Googlella';

    // Listen to auth state
    auth.onAuthStateChanged(function(user) {
      if (user) {
        document.getElementById('accountLoggedIn').style.display = 'block';
        document.getElementById('accountLoggedOut').style.display = 'none';
        loadAccountData();
      } else {
        document.getElementById('accountLoggedIn').style.display = 'none';
        document.getElementById('accountLoggedOut').style.display = 'block';
      }
    });
  }

  function loadAccountData() {
    if (!currentUser) return;
    // Profile
    document.getElementById('accountName').textContent = currentUser.displayName || 'Käyttäjä';
    document.getElementById('accountEmail').textContent = currentUser.email || '';
    var avatar = document.getElementById('accountAvatar');
    var placeholder = document.getElementById('accountAvatarPlaceholder');
    if (currentUser.photoURL) {
      avatar.src = currentUser.photoURL;
      avatar.style.display = 'block';
      placeholder.style.display = 'none';
    } else {
      avatar.style.display = 'none';
      placeholder.style.display = 'flex';
    }
    // Member since
    var created = currentUser.metadata && currentUser.metadata.creationTime;
    if (created) {
      var d = new Date(created);
      document.getElementById('accMember').textContent = d.toLocaleDateString('fi-FI', { month: 'short', year: 'numeric' });
    }
    // Load orders
    document.getElementById('ordersContainer').innerHTML = '<div style="text-align:center;padding:30px;color:var(--fg-muted)">Ladataan tilauksia...</div>';
    db.collection('orders')
      .where('uid', '==', currentUser.uid)
      .limit(50)
      .get()
      .then(function(snapshot) {
        var orders = [];
        snapshot.forEach(function(doc) { orders.push(doc.data()); });
        orders.sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); });
        renderOrderHistory(orders);
      })
      .catch(function(err) {
        console.error('Orders load error:', err);
        var localOrders = JSON.parse(localStorage.getItem('rk_orders') || '[]')
          .filter(function(o) { return o.uid === currentUser.uid || o.userEmail === currentUser.email; })
          .reverse();
        renderOrderHistory(localOrders);
      });
  }

  function renderOrderHistory(orders) {
    var container = document.getElementById('ordersContainer');
    document.getElementById('accOrderCount').textContent = orders.length;
    document.getElementById('ordersCountBadge').textContent = orders.length;

    if (!orders.length) {
      container.innerHTML = '<div class="no-orders"><h3>Ei vielä tilauksia</h3><p>Kun teet ensimmäisen tilauksen, se näkyy täällä.</p>' +
        '<a class="btn" href="' + ROOT + '" style="margin-top:16px">Selaa tuotteita</a></div>';
      return;
    }

    var html = '';
    orders.forEach(function(order) {
      var date = order.date ? new Date(order.date).toLocaleDateString('fi-FI') : '\u2013';
      var statusClass = order.status || 'new';
      var statusText = { new: 'Uusi', paid: 'Maksettu', processing: 'Käsittelyssä', shipped: 'Lähetetty', delivered: 'Toimitettu' }[statusClass] || statusClass;
      var itemsHtml = '';
      (order.items || []).forEach(function(item) {
        var linkStart = item.productId ? '<a onclick="openProduct(\'' + item.productId + '\')" style="color:var(--accent);cursor:pointer">' : '';
        var linkEnd = item.productId ? '</a>' : '';
        var imgClick = item.productId ? 'openProduct(\'' + item.productId + '\')' : '';
        itemsHtml += '<div class="order-item-row">' +
          '<img src="' + (item.image || '') + '" alt="" onerror="this.style.display=\'none\'" onclick="' + imgClick + '">' +
          '<div class="item-title">' + linkStart + item.title + linkEnd +
          (item.variant ? '<br><small style="color:var(--fg-muted)">' + item.variant + '</small>' : '') + '</div>' +
          '<div class="item-qty">x' + item.qty + '</div>' +
          '<div class="item-price">\u20ac' + (item.price * item.qty).toFixed(2) + '</div></div>';
      });
      var c = order.customer || {};
      html += '<div class="order-card" id="order_' + order.id + '">' +
        '<div class="order-card-header" onclick="toggleOrderCard(\'' + order.id + '\')">' +
        '<div><span class="order-id">' + order.id + '</span><span class="order-date"> \u2022 ' + date + '</span></div>' +
        '<div style="display:flex;align-items:center;gap:10px"><span class="order-status ' + statusClass + '">' + statusText + '</span>' +
        '<span class="order-total">\u20ac' + (order.total || 0).toFixed(2) + '</span></div></div>' +
        '<div class="order-card-body">' + itemsHtml +
        '<div class="order-address"><b>\ud83d\udce6 Toimitusosoite:</b><br>' +
        (c.firstName || '') + ' ' + (c.lastName || '') + '<br>' +
        (c.address || '') + '<br>' + (c.postal || '') + ' ' + (c.city || '') + ', ' + (c.country || '') + '</div>' +
        '<div class="order-actions">' +
        '<button class="btn btn--sm" onclick="showReceipt(\'' + order.id + '\')">\ud83d\udcc4 Kuitti</button>' +
        '<button class="btn btn--sm btn--outline" onclick="downloadReceiptPDF(\'' + order.id + '\')">\ud83d\udce5 PDF</button>' +
        '</div></div></div>';
    });
    container.innerHTML = html;
  }

  window.toggleOrderCard = function(orderId) {
    var card = document.getElementById('order_' + orderId);
    if (card) card.classList.toggle('expanded');
  };

  document.addEventListener('DOMContentLoaded', initAccount);
})();
