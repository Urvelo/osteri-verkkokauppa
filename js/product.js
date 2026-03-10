/* ===== PRODUCT DETAIL PAGE ===== */
(function() 
  var params = new URLSearchParams(window.location.search);
  var productId = params.get('id');
  var currentProduct = null;
  var selectedSku = null;
  var qty = 1;

  function init() {
    if (!productId || typeof PRODUCTS === 'undefined') {
      window.location.href = ROOT;
      return;
    }
    currentProduct = PRODUCTS.find(function(p) { return p.id === productId; });
    if (!currentProduct) {
      window.location.href = ROOT;
      return;
    }
    renderProduct();
    // Update page title
    document.title = pTitle(currentProduct) + ' – Rosterikuppia.fi';
  }

  function renderProduct() {
    var p = currentProduct;
    // Title
    document.getElementById('detailTitle').textContent = pTitle(p);

    // Rating
    document.getElementById('detailStars').innerHTML = renderStars(p.score);
    var evalCount = p.evaluationCount || p.evaluateRate || '0';
    document.getElementById('detailReviews').textContent = evalCount + ' arvostelua';
    document.getElementById('detailSales').textContent = '| ' + formatOrders(p.orders) + ' myyty';

    // Price
    updateDetailPrice(shopPrice(p.salePrice), shopPrice(p.originalPrice));

    // Gallery
    var imgs = (p.images && p.images.length) ? p.images : [p.image];
    var mainImg = document.getElementById('mainImage');
    mainImg.src = imgs[0];
    mainImg.onclick = function() { zoomImage(imgs[0]); };
    var thumbs = '';
    imgs.forEach(function(img, i) {
      thumbs += '<div class="gallery-thumb ' + (i === 0 ? 'active' : '') + '" onclick="selectThumb(this, \'' + img + '\')">' +
        '<img src="' + img + '" alt=""></div>';
    });
    document.getElementById('galleryThumbs').innerHTML = thumbs;

    // Variants / SKUs
    var skus = p.skus || [];
    var varSection = document.getElementById('variantSection');
    if (skus.length > 1) {
      varSection.style.display = 'block';
      var opts = '';
      skus.forEach(function(s, i) {
        var oos = s.stock <= 0;
        var name = s.name || ('Vaihtoehto ' + (i + 1));
        opts += '<button class="variant-opt ' + (oos ? 'out-of-stock' : '') + '" data-idx="' + i + '" onclick="selectVariant(' + i + ')"' + (oos ? ' disabled' : '') + '>' +
          name + ' \u2013 \u20ac' + shopPrice(s.price).toFixed(2) + '</button>';
      });
      document.getElementById('variantOptions').innerHTML = opts;
      var first = skus.findIndex(function(s) { return s.stock > 0; });
      if (first >= 0) selectVariant(first);
    } else if (skus.length === 1) {
      varSection.style.display = 'none';
      selectedSku = skus[0];
      updateStockInfo(skus[0].stock);
    } else {
      varSection.style.display = 'none';
      updateStockInfo(99);
    }

    // Qty reset
    qty = 1;
    document.getElementById('qtyVal').value = 1;

    // Description images
    var descImgs = p.descriptionImages || [];
    var descContainer = document.getElementById('descImages');
    var descSection = document.getElementById('descSection');
    if (descImgs.length > 0) {
      descSection.style.display = 'block';
      descContainer.innerHTML = descImgs.map(function(src) {
        return '<img src="' + src + '" alt="Tuotekuva" loading="lazy" onclick="zoomImage(\'' + src + '\')" style="cursor:zoom-in">';
      }).join('');
    }

    // Reviews
    renderReviews(p.id);
  }

  function renderReviews(productId) {
    if (typeof REVIEWS === 'undefined') return;
    var reviews = REVIEWS[productId];
    if (!reviews || !reviews.length) return;

    document.getElementById('reviewsSection').style.display = 'block';

    // Summary
    var total = reviews.length;
    var avgRating = reviews.reduce(function(s, r) { return s + r.rating; }, 0) / total;
    var summaryHtml = '<div class="reviews-avg">' +
      '<span class="reviews-avg-num">' + avgRating.toFixed(1) + '</span>' +
      '<span class="reviews-avg-stars">' + renderStars(avgRating.toFixed(1)) + '</span>' +
      '<span class="reviews-avg-count">' + total + ' arvostelua</span>' +
      '</div>';
    document.getElementById('reviewsSummary').innerHTML = summaryHtml;

    // Country flag emoji helper
    function countryFlag(cc) {
      if (!cc || cc.length !== 2) return '';
      var a = 0x1F1E6;
      return String.fromCodePoint(a + cc.charCodeAt(0) - 65, a + cc.charCodeAt(1) - 65);
    }

    // List
    var listHtml = reviews.map(function(r) {
      var stars = '';
      for (var si = 0; si < 5; si++) {
        stars += si < r.rating ? '\u2605' : '\u2606';
      }
      var imgs = '';
      if (r.images && r.images.length) {
        imgs = '<div class="review-images">' + r.images.map(function(src) {
          return '<img src="' + src + '" alt="" loading="lazy" onclick="zoomImage(\'' + src + '\')" style="cursor:zoom-in">';
        }).join('') + '</div>';
      }
      var flag = countryFlag(r.country);
      return '<div class="review-card">' +
        '<div class="review-header">' +
        '<span class="review-stars">' + stars + '</span>' +
        '<span class="review-date">' + (r.date || '') + '</span>' +
        '</div>' +
        '<p class="review-comment">' + r.comment + '</p>' +
        imgs +
        '<div class="review-author">' + flag + ' ' + r.name + '</div>' +
        '</div>';
    }).join('');
    document.getElementById('reviewsList').innerHTML = listHtml;
  }

  function updateDetailPrice(sale, orig) {
    document.getElementById('detailPrice').textContent = '\u20ac' + parseFloat(sale).toFixed(2);
    var origEl = document.getElementById('detailOrigPrice');
    var discEl = document.getElementById('detailDiscount');
    if (orig > sale) {
      origEl.textContent = '\u20ac' + parseFloat(orig).toFixed(2);
      origEl.style.display = 'inline';
      var d = getDiscount(sale, orig);
      if (d >= 5) { discEl.textContent = '-' + d + '%'; discEl.style.display = 'inline-block'; }
      else discEl.style.display = 'none';
    } else {
      origEl.style.display = 'none';
      discEl.style.display = 'none';
    }
  }

  function updateStockInfo(stock) {
    var el = document.getElementById('stockInfo');
    if (stock > 10) el.innerHTML = '<b>Varastossa</b>';
    else if (stock > 0) el.innerHTML = '<b style="color:var(--accent)">Vain ' + stock + ' jäljellä!</b>';
    else el.innerHTML = '<span style="color:var(--danger)">Loppu</span>';
  }

  // Exposed globally for onclick handlers
  window.selectThumb = function(el, src) {
    document.querySelectorAll('.gallery-thumb').forEach(function(t) { t.classList.remove('active'); });
    el.classList.add('active');
    var main = document.getElementById('mainImage');
    main.src = src;
    main.onclick = function() { zoomImage(src); };
  };

  window.selectVariant = function(idx) {
    var skus = currentProduct.skus || [];
    selectedSku = skus[idx];
    document.querySelectorAll('.variant-opt').forEach(function(b) {
      b.classList.toggle('selected', parseInt(b.dataset.idx) === idx);
    });
    if (selectedSku) {
      updateDetailPrice(shopPrice(selectedSku.price), shopPrice(selectedSku.originalPrice || currentProduct.originalPrice));
      updateStockInfo(selectedSku.stock);
      if (selectedSku.image) {
        document.getElementById('mainImage').src = selectedSku.image;
      }
      // Reset qty if exceeds new stock
      if (qty > selectedSku.stock && selectedSku.stock > 0) {
        qty = selectedSku.stock;
        document.getElementById('qtyVal').value = qty;
      }
    }
  };

  window.changeQty = function(delta) {
    var stock = selectedSku ? selectedSku.stock : 99;
    var newQty = qty + delta;
    if (newQty > stock) {
      showToast('Varastossa enintään ' + stock + ' kpl');
      return;
    }
    qty = Math.max(1, newQty);
    document.getElementById('qtyVal').value = qty;
  };

  window.addToCart = function() {
    if (!currentProduct) return;
    var sku = selectedSku || (currentProduct.skus && currentProduct.skus[0]) || null;
    var stock = sku ? sku.stock : 99;
    var skuId = sku ? sku.id : 'default';
    var variantName = sku ? sku.name : '';
    var price = sku ? shopPrice(sku.price) : shopPrice(currentProduct.salePrice);
    var image = (sku && sku.image) || currentProduct.image;

    if (stock <= 0) {
      showToast('Tuote on loppunut!');
      return;
    }

    // Check existing cart quantity
    var existing = cart.find(function(i) { return i.productId === currentProduct.id && i.skuId === skuId; });
    var currentCartQty = existing ? existing.qty : 0;

    if (currentCartQty + qty > stock) {
      var canAdd = stock - currentCartQty;
      if (canAdd <= 0) {
        showToast('Tuotetta ei voi lisätä enempää \u2013 varastossa vain ' + stock + ' kpl!');
        return;
      }
      showToast('Varastossa vain ' + stock + ' kpl \u2013 lisättiin ' + canAdd);
      qty = canAdd;
    }

    if (existing) {
      existing.qty += qty;
    } else {
      cart.push({
        productId: currentProduct.id,
        skuId: skuId,
        title: pTitle(currentProduct),
        variant: variantName,
        price: price,
        image: image,
        qty: qty
      });
    }
    saveCart();
    showToast('\u2713 ' + qty + 'x lisätty ostoskoriin!');
  };

  document.addEventListener('DOMContentLoaded', init);
})();
