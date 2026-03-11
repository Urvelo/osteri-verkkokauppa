/* ===== RETURN FORM PAGE ===== */
(function() {
  var returnImageUrl = '';
  var returnImageUploading = false;
  var userOrders = [];
  var selectedOrder = null;

  function initReturn() {
    var uploadArea = document.getElementById('retUploadArea');
    var fileInput = document.getElementById('retFileInput');
    if (!uploadArea || !fileInput) return;

    uploadArea.onclick = function() { fileInput.click(); };
    uploadArea.addEventListener('dragover', function(e) { e.preventDefault(); uploadArea.classList.add('dragover'); });
    uploadArea.addEventListener('dragleave', function() { uploadArea.classList.remove('dragover'); });
    uploadArea.addEventListener('drop', function(e) {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
      if (e.dataTransfer.files.length) handleReturnImage(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', function(e) {
      if (e.target.files.length) handleReturnImage(e.target.files[0]);
    });

    // Order select change
    var orderSelect = document.getElementById('retOrderSelect');
    if (orderSelect) {
      orderSelect.addEventListener('change', function() {
        var orderId = this.value;
        selectedOrder = userOrders.find(function(o) { return o.id === orderId; }) || null;
        var details = document.getElementById('retOrderDetails');
        if (selectedOrder && details) {
          var itemsHtml = selectedOrder.items.map(function(item) {
            return '<div style="display:flex;align-items:center;gap:10px;margin-top:8px">' +
              (item.image ? '<img src="' + item.image + '" style="width:40px;height:40px;object-fit:cover;border-radius:4px" onerror="this.style.display=\'none\'">' : '') +
              '<span>' + item.title + (item.variant ? ' – ' + item.variant : '') + ' x' + item.qty + '</span></div>';
          }).join('');
          details.innerHTML = '<div style="font-weight:600;margin-bottom:4px">' + selectedOrder.id + '</div>' +
            '<div style="color:var(--fg-muted);font-size:.85rem">' + new Date(selectedOrder.date).toLocaleDateString('fi-FI') +
            ' — ' + '\u20ac' + parseFloat(selectedOrder.total).toFixed(2) + '</div>' + itemsHtml;
          details.style.display = 'block';
        } else if (details) {
          details.style.display = 'none';
        }
      });
    }

    // Require login
    auth.onAuthStateChanged(function(user) {
      var loginMsg = document.getElementById('returnLoginRequired');
      var formContent = document.getElementById('returnFormContent');
      if (user) {
        // User logged in — show form, hide login
        if (loginMsg) loginMsg.style.display = 'none';
        if (formContent) formContent.style.display = 'block';

        // Fill name & email from Google account
        var nameField = document.getElementById('retName');
        var emailField = document.getElementById('retEmail');
        if (nameField) nameField.value = user.displayName || '';
        if (emailField) emailField.value = user.email || '';

        // Load user's orders from Firestore
        loadUserOrders(user.uid);
      } else {
        // Not logged in — show login prompt, hide form
        if (loginMsg) loginMsg.style.display = 'block';
        if (formContent) formContent.style.display = 'none';
      }
    });
  }

  function loadUserOrders(uid) {
    var orderSelect = document.getElementById('retOrderSelect');
    if (!orderSelect) return;
    orderSelect.innerHTML = '<option value="">Ladataan tilauksiasi...</option>';

    db.collection('orders').where('uid', '==', uid).get()
      .then(function(snapshot) {
        userOrders = [];
        snapshot.forEach(function(doc) {
          userOrders.push(doc.data());
        });
        // Sort newest first
        userOrders.sort(function(a, b) { return new Date(b.date) - new Date(a.date); });

        if (userOrders.length === 0) {
          orderSelect.innerHTML = '<option value="">Sinulla ei ole tilauksia</option>';
          return;
        }
        var opts = '<option value="">Valitse tilaus...</option>';
        userOrders.forEach(function(o) {
          var dateStr = new Date(o.date).toLocaleDateString('fi-FI');
          var itemNames = o.items.map(function(i) { return i.title; }).join(', ');
          if (itemNames.length > 50) itemNames = itemNames.substring(0, 50) + '...';
          opts += '<option value="' + o.id + '">' + o.id + ' — ' + dateStr + ' — ' + itemNames + '</option>';
        });
        orderSelect.innerHTML = opts;
      })
      .catch(function(err) {
        console.error('Error loading orders:', err);
        orderSelect.innerHTML = '<option value="">Tilausten lataus epäonnistui</option>';
      });
  }

  function handleReturnImage(file) {
    if (!file.type.match(/image\/(jpeg|png|webp)/)) {
      showToast('Vain JPG, PNG tai WebP kuvat!');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      showToast('Kuva on liian suuri (max 20 MB)');
      return;
    }
    var reader = new FileReader();
    reader.onload = function(ev) {
      document.getElementById('retPreviewWrap').innerHTML =
        '<div class="return-preview">' +
        '<img src="' + ev.target.result + '" alt="Esikatselu">' +
        '<button class="remove-preview" onclick="removeReturnImage()">\u2715</button></div>';
      uploadReturnImage(file);
    };
    reader.readAsDataURL(file);
  }

  function uploadReturnImage(file) {
    returnImageUploading = true;
    document.getElementById('retUploadStatus').innerHTML = '<div class="return-uploading">\u23f3 Ladataan kuvaa...</div>';
    var formData = new FormData();
    formData.append('file', file);
    formData.append('lifetime', '336');
    fetch('https://safenote.co/api/file', {
      method: 'POST',
      body: formData
    }).then(function(r) { return r.json(); })
    .then(function(result) {
      returnImageUploading = false;
      if (result.success) {
        returnImageUrl = result.link;
        document.getElementById('retUploadStatus').innerHTML = '<div style="color:var(--success);font-size:.85rem;margin-top:4px">\u2713 Kuva ladattu!</div>';
      } else {
        document.getElementById('retUploadStatus').innerHTML = '<div style="color:var(--danger);font-size:.85rem;margin-top:4px">Kuvan lataus ep\u00e4onnistui. Yrit\u00e4 uudelleen.</div>';
      }
    }).catch(function(err) {
      returnImageUploading = false;
      console.error('Image upload error:', err);
      document.getElementById('retUploadStatus').innerHTML = '<div style="color:var(--danger);font-size:.85rem;margin-top:4px">Kuvan lataus ep\u00e4onnistui. Yrit\u00e4 uudelleen.</div>';
    });
  }

  window.removeReturnImage = function() {
    returnImageUrl = '';
    document.getElementById('retPreviewWrap').innerHTML = '';
    document.getElementById('retUploadStatus').innerHTML = '';
    document.getElementById('retFileInput').value = '';
  };

  window.submitReturnForm = function() {
    if (returnImageUploading) {
      showToast('Odota, kuvaa ladataan...');
      return;
    }

    // Validate order selected
    if (!selectedOrder) {
      var sel = document.getElementById('retOrderSelect');
      if (sel) sel.style.borderColor = 'var(--danger)';
      showToast('Valitse tilaus!');
      return;
    }

    var name = document.getElementById('retName').value.trim();
    var email = document.getElementById('retEmail').value.trim();
    var reason = document.getElementById('retReason').value;
    var description = document.getElementById('retDescription').value.trim();

    // Validate reason
    if (!reason) {
      document.getElementById('retReason').style.borderColor = 'var(--danger)';
      document.getElementById('retReason').focus();
      showToast('Valitse palautuksen syy!');
      return;
    }
    document.getElementById('retReason').style.borderColor = '';

    // Validate image (required)
    if (!returnImageUrl) {
      showToast('Liitä kuva tuotteesta! Kuva on pakollinen.');
      document.getElementById('retUploadArea').style.borderColor = 'var(--danger)';
      return;
    }
    document.getElementById('retUploadArea').style.borderColor = '';

    var btn = document.getElementById('retSubmitBtn');
    btn.disabled = true;
    btn.textContent = 'Lähetetään...';

    var returnId = 'RET-' + Date.now();
    var returnData = {
      returnId: returnId,
      orderId: selectedOrder.id,
      orderDate: selectedOrder.date,
      items: selectedOrder.items,
      name: name,
      email: email,
      reason: reason,
      description: description,
      imageUrl: returnImageUrl,
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      uid: currentUser ? currentUser.uid : null
    };

    db.collection('returns').doc(returnId).set(returnData)
    .then(function() {
      var retEmail = new FormData();
      retEmail.append('Palautusnumero', returnId);
      retEmail.append('Tilausnumero', selectedOrder.id);
      retEmail.append('Nimi', name);
      retEmail.append('Sahkoposti', email);
      retEmail.append('Syy', reason);
      if (description) retEmail.append('Kuvaus', description);
      retEmail.append('Kuva', returnImageUrl);
      retEmail.append('_subject', 'Palautuspyynto: ' + returnId + ' - ' + reason);
      retEmail.append('_template', 'table');
      retEmail.append('_captcha', 'false');
      fetch('https://formsubmit.co/ajax/sovelluksenkehittaja@gmail.com', {
        method: 'POST', body: retEmail
      }).catch(function(e) { console.log('Return email:', e); });

      document.getElementById('returnFormContent').style.display = 'none';
      document.getElementById('returnSuccess').style.display = 'block';
      document.getElementById('returnIdDisplay').textContent = returnId;
      showToast('Palautuspyyntö lähetetty!');
    })
    .catch(function(err) {
      console.error('Return submit error:', err);
      btn.disabled = false;
      btn.textContent = 'Lähetä palautuspyyntö';
      showToast('Virhe! Yritä uudelleen tai ota yhteyttä info@rosterikuppia.fi');
    });
  };

  document.addEventListener('DOMContentLoaded', initReturn);
})();
