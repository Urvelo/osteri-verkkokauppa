/* ===== SHOP PAGE – Product Grid, Filters, Sorting ===== */
(function() {
  var currentFilter = 'all';
  var currentSort = 'orders';
  var searchQuery = '';
  var visibleCount = 12;
  var PAGE_SIZE = 12;

  function getFilteredProducts() {
    var list = PRODUCTS.slice();
    if (searchQuery) {
      var q = searchQuery.toLowerCase();
      list = list.filter(function(p) {
        return pTitle(p).toLowerCase().includes(q) || p.title.toLowerCase().includes(q);
      });
    }
    if (currentFilter === 'under5') list = list.filter(function(p) { return shopPrice(p.salePrice) < 5; });
    else if (currentFilter === '5to10') list = list.filter(function(p) { var sp = shopPrice(p.salePrice); return sp >= 5 && sp <= 15; });
    else if (currentFilter === 'over10') list = list.filter(function(p) { return shopPrice(p.salePrice) > 15; });

    if (currentSort === 'orders') list.sort(function(a, b) { return b.orders - a.orders; });
    else if (currentSort === 'price-asc') list.sort(function(a, b) { return a.salePrice - b.salePrice; });
    else if (currentSort === 'price-desc') list.sort(function(a, b) { return b.salePrice - a.salePrice; });
    else if (currentSort === 'rating') list.sort(function(a, b) { return parseFloat(b.score) - parseFloat(a.score); });
    else if (currentSort === 'discount') list.sort(function(a, b) {
      var da = a.originalPrice > 0 ? (1 - a.salePrice / a.originalPrice) : 0;
      var db = b.originalPrice > 0 ? (1 - b.salePrice / b.originalPrice) : 0;
      return db - da;
    });
    return list;
  }

  function renderProducts() {
    var grid = document.getElementById('productGrid');
    if (!grid) return;
    var filtered = getFilteredProducts();
    var toShow = filtered.slice(0, visibleCount);
    if (!toShow.length) {
      grid.innerHTML = '';
      document.getElementById('noResults').style.display = 'block';
      document.getElementById('loadMoreWrap').style.display = 'none';
      document.getElementById('resultsCount').textContent = '0 tuotetta';
      return;
    }
    document.getElementById('noResults').style.display = 'none';
    var html = '';
    for (var _i = 0; _i < toShow.length; _i++) {
      var p = toShow[_i];
      var sp = shopPrice(p.salePrice);
      var op = shopPrice(p.originalPrice);
      var disc = getDiscount(sp, op);
      // Check total stock
      var totalStock = 0;
      if (p.skus && p.skus.length) {
        for (var j = 0; j < p.skus.length; j++) totalStock += (p.skus[j].stock || 0);
      } else {
        totalStock = 99;
      }
      var stockLabel = '';
      if (totalStock <= 0) stockLabel = '<span class="product-badge" style="background:var(--fg-muted)">Loppu</span>';
      else if (totalStock <= 5) stockLabel = '<span class="product-badge" style="background:var(--accent);color:#111">Vain ' + totalStock + ' jälj.</span>';

      html += '<div class="product-card" onclick="openProduct(\'' + p.id + '\')">' +
        '<div class="product-image-wrap">' +
        '<img src="' + p.image + '" alt="' + pTitle(p) + '" class="product-image" loading="lazy" ' +
        'onerror="this.onerror=null;this.src=\'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 200 200%22><rect fill=%22%23242424%22 width=%22200%22 height=%22200%22/><text x=%2250%25%22 y=%2250%25%22 fill=%22%23666%22 font-size=%2216%22 text-anchor=%22middle%22 dy=%22.3em%22>Kuva</text></svg>\'">' +
        (disc >= 15 ? '<span class="product-badge">-' + disc + '%</span>' : '') +
        stockLabel +
        '</div>' +
        '<div class="product-info">' +
        '<h3 class="product-title">' + pTitle(p) + '</h3>' +
        '<div class="product-meta">' +
        '<span class="stars">' + renderStars(p.score) + '</span>' +
        '<span>' + formatOrders(p.orders) + ' myyty</span>' +
        '</div>' +
        '<div class="product-price-row">' +
        '<span class="product-price">\u20ac' + sp.toFixed(2) + '</span>' +
        (op > sp ? '<span class="product-orig-price">\u20ac' + op.toFixed(2) + '</span>' : '') +
        (disc >= 10 ? '<span class="product-discount">-' + disc + '%</span>' : '') +
        '</div></div>' +
        '<div class="product-card-btn">Katso tuote \u2192</div></div>';
    }
    grid.innerHTML = html;
    document.getElementById('resultsCount').textContent = filtered.length + ' tuotetta' + (filtered.length !== PRODUCTS.length ? ' (suodatettu)' : '');
    document.getElementById('loadMoreWrap').style.display = visibleCount < filtered.length ? 'block' : 'none';
  }

  function updateStats() {
    var prices = PRODUCTS.map(function(p) { return shopPrice(p.salePrice); });
    var minPrice = Math.min.apply(null, prices);
    document.getElementById('stat-products').textContent = PRODUCTS.length;
    document.getElementById('stat-min').textContent = '\u20ac' + minPrice.toFixed(2);
  }

  // Expose functions globally
  window.setFilter = function(f) {
    currentFilter = f;
    visibleCount = PAGE_SIZE;
    document.querySelectorAll('.filter-btn').forEach(function(b) {
      b.classList.toggle('active', b.dataset.filter === f);
    });
    renderProducts();
  };

  window.loadMore = function() {
    visibleCount += PAGE_SIZE;
    renderProducts();
  };

  document.addEventListener('DOMContentLoaded', function() {
    window.setFilter('all');
    updateStats();
    renderProducts();

    var searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', function(e) {
        searchQuery = e.target.value;
        visibleCount = PAGE_SIZE;
        renderProducts();
      });
    }
    var sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
      sortSelect.addEventListener('change', function(e) {
        currentSort = e.target.value;
        renderProducts();
      });
    }
  });
})();
