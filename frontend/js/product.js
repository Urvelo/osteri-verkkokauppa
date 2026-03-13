/* ===== PRODUCT DETAIL PAGE ===== */
(function() {
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
    document.title = pTitle(currentProduct) + ' – Erät.fi';
    // Dynamic SEO meta tags
    setSEO(currentProduct);
  }

  function setSEO(p) {
    var title = pTitle(p) + ' – Erät.fi';
    var desc = pTitle(p) + ' – Osta Erät.fi verkkokaupasta. Hinta ' + shopPrice(p.salePrice).toFixed(2) + ' €. Toimitamme koko Suomeen.';
    var url = 'https://xn--ert-rla.fi/tuote/?id=' + encodeURIComponent(p.id);
    var img = p.image || (p.images && p.images[0]) || 'https://xn--ert-rla.fi/logo.png';

    // Meta description
    var metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute('content', desc);

    // Canonical
    var canon = document.querySelector('link[rel="canonical"]');
    if (canon) canon.setAttribute('href', url);

    // Open Graph
    var ogMap = { 'og:title': title, 'og:description': desc, 'og:url': url, 'og:image': img };
    Object.keys(ogMap).forEach(function(prop) {
      var el = document.querySelector('meta[property="' + prop + '"]');
      if (el) el.setAttribute('content', ogMap[prop]);
    });

    // JSON-LD Product structured data
    var reviews = (typeof REVIEWS !== 'undefined') ? (REVIEWS[p.id] || []) : [];
    var ld = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      'name': pTitle(p),
      'image': img,
      'description': desc,
      'url': url,
      'brand': { '@type': 'Brand', 'name': 'Erät.fi' },
      'offers': {
        '@type': 'Offer',
        'price': shopPrice(p.salePrice).toFixed(2),
        'priceCurrency': 'EUR',
        'availability': 'https://schema.org/InStock',
        'url': url,
        'seller': { '@type': 'Organization', 'name': 'Erät.fi' }
      }
    };
    if (reviews.length > 0) {
      var totalRating = 0;
      reviews.forEach(function(r) { totalRating += (r.rating || 5); });
      ld.aggregateRating = {
        '@type': 'AggregateRating',
        'ratingValue': (totalRating / reviews.length).toFixed(1),
        'reviewCount': reviews.length
      };
    }
    var script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(ld);
    document.head.appendChild(script);
  }

  function renderProduct() {
    var p = currentProduct;
    var reviews = (typeof REVIEWS !== 'undefined') ? (REVIEWS[p.id] || []) : [];

    // Title
    document.getElementById('detailTitle').textContent = pTitle(p);

    // Rating – conditional on showRating
    if (p.showRating) {
      document.getElementById('detailStars').innerHTML = renderStars(p.score);
    } else {
      document.getElementById('detailStars').innerHTML = '';
    }
    var evalCount = reviews ? reviews.length : 0;
    document.getElementById('detailReviews').textContent = evalCount + ' arvostelua';
    // Sales – conditional on showSales
    if (p.showSales) {
      document.getElementById('detailSales').textContent = '| ' + formatOrders(p.orders) + ' myyty';
    } else {
      document.getElementById('detailSales').textContent = '';
    }

    // Price
    updateDetailPrice(shopPrice(p.salePrice), shopPrice(p.originalPrice), p);

// Gallery – pick up to 5 good images (product images first, then description images)
    var imgs = (p.images && p.images.length) ? p.images : [p.image];
    var descImgs = p.descriptionImages || [];
    var allImgs = imgs.concat(descImgs).slice(0, 5);
    var mainImg = document.getElementById('mainImage');
    mainImg.referrerPolicy = 'no-referrer';
    mainImg.src = allImgs[0];
    mainImg.onerror = function() {
      this.onerror = null;
      this.style.display = 'none';
      var fallback = document.createElement('div');
      fallback.className = 'gallery-fallback';
      fallback.textContent = pTitle(p);
      this.parentNode.appendChild(fallback);
    };
    mainImg.onclick = function() { zoomImage(allImgs[0]); };
    var thumbs = '';
    allImgs.forEach(function(img, i) {
      thumbs += '<div class="gallery-thumb ' + (i === 0 ? 'active' : '') + '" onclick="selectThumb(this, \'' + escAttr(img) + '\')">' 
        + '<img src="' + escAttr(img) + '" alt="" referrerpolicy="no-referrer" onerror="this.parentNode.style.display=\'none\'"></div>';
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
        var imgThumb = s.image ? '<img src="' + s.image + '" alt="" style="width:28px;height:28px;object-fit:cover;border-radius:4px;margin-right:6px;vertical-align:middle;">' : '';
        opts += '<button class="variant-opt ' + (oos ? 'out-of-stock' : '') + '" data-idx="' + i + '" onclick="selectVariant(' + i + ')"' + (oos ? ' disabled' : '') + '>' +
          imgThumb + name + ' \u2013 ' + formatPrice(shopPrice(s.price)) + '</button>';
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

    // Product description text (parsed from HTML, images stripped)
    var descSection = document.getElementById('descSection');
    var descContent = document.getElementById('descImages');
    var rawDesc = p.description || '';
    if (rawDesc) {
      // Parse HTML, strip images, extract text content
      var tempDiv = document.createElement('div');
      tempDiv.innerHTML = rawDesc;
      // Remove all img elements
      var descImgEls = tempDiv.querySelectorAll('img');
      for (var di = 0; di < descImgEls.length; di++) {
        var parent = descImgEls[di].parentNode;
        parent.removeChild(descImgEls[di]);
        // Remove empty wrapper divs
        if (parent.tagName === 'DIV' && !parent.textContent.trim()) parent.parentNode.removeChild(parent);
      }
      var descText = tempDiv.innerHTML.trim();
      if (descText && tempDiv.textContent.trim().length > 10) {
        descSection.style.display = 'block';
        // Sanitize: strip dangerous elements and attributes from AliExpress HTML
        var dangerEls = tempDiv.querySelectorAll('script,iframe,object,embed,form,input,textarea,select,button,link,meta,base,svg,math,template,noscript,style');
        for (var ri = 0; ri < dangerEls.length; ri++) dangerEls[ri].parentNode.removeChild(dangerEls[ri]);
        // Strip event handlers (on*) and javascript: URIs
        var allEls = tempDiv.querySelectorAll('*');
        for (var ai = 0; ai < allEls.length; ai++) {
          var attrs = allEls[ai].attributes;
          for (var ati = attrs.length - 1; ati >= 0; ati--) {
            var attrName = attrs[ati].name.toLowerCase();
            if (attrName.indexOf('on') === 0 || (attrs[ati].value && attrs[ati].value.trim().toLowerCase().indexOf('javascript:') === 0)) {
              allEls[ai].removeAttribute(attrs[ati].name);
            }
          }
        }
        var cleaned = tempDiv.innerHTML.trim()
          .replace(/style\s*=\s*"[^"]*"/gi, '')
          .replace(/style\s*=\s*'[^']*'/gi, '')
          .replace(/<font[^>]*>/gi, '').replace(/<\/font>/gi, '')
          .replace(/<span[^>]*>/gi, '<span>').replace(/color\s*[:=][^;"']*/gi, '')
          .replace(/font-size\s*:[^;"']*/gi, '').replace(/font-family\s*:[^;"']*/gi, '');
        descContent.innerHTML = '<div class="desc-text">' + cleaned + '</div>';
      }
    }

    // Reviews
    renderReviews(p.id, reviews);
  }

  function renderReviews(productId, reviews) {
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
          return '<img src="' + src + '" alt="" loading="lazy" referrerpolicy="no-referrer" data-zoom="' + src + '" onerror="this.style.display=\'none\'">';
        }).join('') + '</div>';
      }
      var flag = countryFlag(r.country);
      var authorName = r.name;
      if (!authorName || authorName.toLowerCase().indexOf('aliexpress') >= 0 || authorName.toLowerCase().indexOf('shopper') >= 0) {
        authorName = 'Asiakas';
      }
      return '<div class="review-card">' +
        '<div class="review-header">' +
        '<span class="review-stars">' + stars + '</span>' +
        '<span class="review-date">' + esc(r.date || '') + '</span>' +
        '</div>' +
        '<p class="review-comment">' + esc(r.comment) + '</p>' +
        imgs +
        '<div class="review-author">' + flag + ' ' + esc(authorName) + '</div>' +
        '</div>';
    }).join('');
    document.getElementById('reviewsList').innerHTML = listHtml;

    // Event delegation for review image zoom
    document.getElementById('reviewsList').addEventListener('click', function(e) {
      var img = e.target.closest('img[data-zoom]');
      if (img) zoomImage(img.dataset.zoom);
    });
  }

  function updateDetailPrice(sale, orig, p) {
    document.getElementById('detailPrice').innerHTML = formatPrice(parseFloat(sale));
    // Show original price if toggle is on and there's a difference
    if (p && p.showOriginalPrice && orig > sale) {
      var origEl = document.getElementById('detailOrigPrice');
      origEl.innerHTML = formatPrice(parseFloat(orig));
      origEl.style.display = '';
    } else {
      document.getElementById('detailOrigPrice').style.display = 'none';
    }
    // Show discount badge if toggle is on
    if (p && p.showDiscount && p.discount) {
      var discEl = document.getElementById('detailDiscount');
      discEl.textContent = p.discount;
      discEl.style.display = '';
    } else {
      document.getElementById('detailDiscount').style.display = 'none';
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
      updateDetailPrice(shopPrice(selectedSku.price), shopPrice(selectedSku.originalPrice || currentProduct.originalPrice), currentProduct);
      updateStockInfo(selectedSku.stock);
      if (selectedSku.image) {
        var mi = document.getElementById('mainImage');
        mi.style.display = '';
        var oldFb = mi.parentNode.querySelector('.gallery-fallback');
        if (oldFb) oldFb.remove();
        mi.src = selectedSku.image;
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

  document.addEventListener('DOMContentLoaded', function() {
    (typeof dataReady !== 'undefined' ? dataReady : Promise.resolve()).then(init);
  });
})();
