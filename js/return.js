/* ===== RETURN FORM PAGE ===== */
(function() {
  var returnImageUrl = '';
  var returnImageUploading = false;

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

    // Pre-fill if logged in
    auth.onAuthStateChanged(function(user) {
      if (user) {
        var nameField = document.getElementById('retName');
        var emailField = document.getElementById('retEmail');
        if (nameField && !nameField.value && user.displayName) nameField.value = user.displayName;
        if (emailField && !emailField.value && user.email) emailField.value = user.email;
      }
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
    var orderId = document.getElementById('retOrderId').value.trim();
    var name = document.getElementById('retName').value.trim();
    var email = document.getElementById('retEmail').value.trim();
    var phone = document.getElementById('retPhone').value.trim();
    var reason = document.getElementById('retReason').value;
    var description = document.getElementById('retDescription').value.trim();

    var required = [
      { id: 'retOrderId', val: orderId },
      { id: 'retName', val: name },
      { id: 'retEmail', val: email },
      { id: 'retReason', val: reason }
    ];
    for (var k = 0; k < required.length; k++) {
      var el = document.getElementById(required[k].id);
      if (!required[k].val) {
        el.style.borderColor = 'var(--danger)';
        el.focus();
        showToast('Täytä kaikki pakolliset kentät!');
        return;
      }
      el.style.borderColor = '';
    }

    var btn = document.getElementById('retSubmitBtn');
    btn.disabled = true;
    btn.textContent = 'Lähetetään...';

    var returnId = 'RET-' + Date.now();
    var returnData = {
      returnId: returnId,
      orderId: orderId,
      name: name,
      email: email,
      phone: phone,
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
      retEmail.append('Tilausnumero', orderId);
      retEmail.append('Nimi', name);
      retEmail.append('Sahkoposti', email);
      if (phone) retEmail.append('Puhelin', phone);
      retEmail.append('Syy', reason);
      if (description) retEmail.append('Kuvaus', description);
      if (returnImageUrl) retEmail.append('Kuva', returnImageUrl);
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
