import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase, MARKUP } from '../supabase'
import { fetchAliExpressProduct, fetchAliExpressReviews } from '../aliexpress'

function htmlToText(html) {
  if (!html) return ''
  const div = document.createElement('div')
  div.innerHTML = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<\/li>/gi, '\n')
  return div.textContent.replace(/\n{3,}/g, '\n\n').trim()
}

function textToHtml(text) {
  if (!text) return ''
  return text
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('\n')
}

export default function EditProduct() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [product, setProduct] = useState(null)
  const [images, setImages] = useState([])
  const [skus, setSkus] = useState([])
  const [reviews, setReviews] = useState([])
  const [mainImage, setMainImage] = useState('')
  const [previewImg, setPreviewImg] = useState('')
  const [toast, setToast] = useState(null)
  const [descText, setDescText] = useState('')
  const dragItem = useRef(null)
  const dragOver = useRef(null)
  const [newImageUrl, setNewImageUrl] = useState('')
  const [newReview, setNewReview] = useState({ reviewer_name: '', country: '', rating: 5, comment: '' })
  const [editingReviews, setEditingReviews] = useState({})

  useEffect(() => { loadProduct() }, [id])

  async function loadProduct() {
    setLoading(true)

    const [{ data: prod }, { data: imgs }, { data: skuData }, { data: revData }] = await Promise.all([
      supabase.from('products').select('*').eq('id', id).single(),
      supabase.from('product_images').select('*').eq('product_id', id).order('sort_order'),
      supabase.from('product_skus').select('*').eq('product_id', id),
      supabase.from('reviews').select('*, review_images(*)').eq('product_id', id).order('created_at', { ascending: false }),
    ])

    if (!prod) {
      navigate('/products')
      return
    }

    setProduct(prod)
    setImages(imgs || [])
    setSkus(skuData || [])
    setReviews(revData || [])
    setMainImage(prod.image || (imgs?.[0]?.image_url || ''))
    setPreviewImg(prod.image || (imgs?.[0]?.image_url || ''))
    setDescText(htmlToText(prod.description || ''))
    setLoading(false)
  }

  function updateField(field, value) {
    setProduct(prev => ({ ...prev, [field]: value }))
  }

  // ── Image Management ──
  function handleDragStart(idx) { dragItem.current = idx }
  function handleDragEnter(idx) { dragOver.current = idx }

  function handleDragEnd() {
    const from = dragItem.current
    const to = dragOver.current
    if (from === null || to === null || from === to) return

    const reordered = [...images]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(to, 0, moved)
    setImages(reordered.map((img, i) => ({ ...img, sort_order: i })))
    dragItem.current = null
    dragOver.current = null
  }

  function handleSetMain(imgUrl) {
    setMainImage(imgUrl)
    setPreviewImg(imgUrl)
    updateField('image', imgUrl)
  }

  function handleDeleteImage(idx) {
    const newImages = images.filter((_, i) => i !== idx)
    setImages(newImages.map((img, i) => ({ ...img, sort_order: i })))
    // If we deleted the main image, pick the first one
    if (images[idx]?.image_url === mainImage && newImages.length) {
      handleSetMain(newImages[0].image_url)
    }
  }

  
    async function handleImageUpload(e) {
      const file = e.target.files[0]
      if (!file) return

      try {
        // Automatically try to upload to "product-images" bucket
        const fileExt = file.name.split('.').pop()
        const fileName = `${Math.random()}.${fileExt}`
        const filePath = `${fileName}`

        setToast('Ladataan kuvaa...')
        const { error: uploadError, data } = await supabase.storage.from('product-images').upload(filePath, file)
        
        if (uploadError) {
           console.log('Bucket upload failed, attempting fallback to base64 Data URL...', uploadError)
           
           // Fallback to Base64 String
           const reader = new FileReader()
           reader.onloadend = () => {
             const base64data = reader.result
             setImages(prev => [...prev, { image_url: base64data, sort_order: prev.length, is_description_image: false }])
             if (!mainImage) handleSetMain(base64data)
             setToast('Kuva lisätty (Base64 muodossa)!')
             e.target.value = ''
           }
           reader.readAsDataURL(file)
           return
        }

        const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(filePath)
        
        setImages(prev => [...prev, { image_url: publicUrl, sort_order: prev.length, is_description_image: false }])
        if (!mainImage) handleSetMain(publicUrl)
        setToast('Kuva lisätty!')
        e.target.value = ''
      } catch (err) {
        alert(err.message)
      }
    }

  
  async function handleSkuImageUpload(e, idx) {
    const file = e.target.files[0]
    if (!file) return

    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${Math.random()}.${fileExt}`
      const filePath = `${fileName}`

      setToast('Ladataan SKU-kuvaa...')
      const { error: uploadError } = await supabase.storage.from('product-images').upload(filePath, file)
      
      if (uploadError) {
         console.log('Bucket upload failed, attempting fallback to base64 Data URL...', uploadError)
         const reader = new FileReader()
         reader.onloadend = () => {
           updateSku(idx, 'image', reader.result)
           setToast('SKU-kuva lisätty (Base64)!')
           e.target.value = ''
         }
         reader.readAsDataURL(file)
         return
      }

      const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(filePath)
      updateSku(idx, 'image', publicUrl)
      setToast('SKU-kuva lisätty!')
      e.target.value = ''
    } catch (err) {
      alert(err.message)
    }
  }

  function handleAddImageUrl() {
    const url = newImageUrl.trim()
    if (!url) return
    setImages(prev => [...prev, { image_url: url, sort_order: prev.length, is_description_image: false }])
    if (!mainImage) handleSetMain(url)
    setNewImageUrl('')
  }

  // ── SKU Management ──
  function updateSku(idx, field, value) {
    setSkus(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s))
  }

  function deleteSku(idx) {
    setSkus(prev => prev.filter((_, i) => i !== idx))
  }

  function handleAddSku() {
    setSkus(prev => [...prev, {
      id: `${id}-manual-${Date.now()}`,
      product_id: id,
      name: '',
      price: Number(product?.sale_price || 0),
      original_price: Number(product?.original_price || 0),
      ae_price: 0,
      stock: 0,
      image: '',
    }])
  }

  // ── Save ──
  async function handleSave() {
    setSaving(true)
    try {
      // Update product
      const { error: prodErr } = await supabase.from('products').update({
        title: product.title,
        title_fi: product.title_fi,
        sale_price: product.sale_price,
        original_price: product.original_price,
        ae_price: product.ae_price || 0,
        currency: product.currency || 'EUR',
        discount: product.discount,
        image: mainImage,
        url: product.url,
        description: product.description,
        status: product.status || 'draft',
        category_id: product.category_id,
        orders: product.orders,
        score: product.score,
        evaluate_rate: product.evaluate_rate,
        evaluation_count: product.evaluation_count,
        sales_count: product.sales_count,
        show_discount: product.show_discount || false,
        show_original_price: product.show_original_price || false,
        show_sales: product.show_sales || false,
        show_rating: product.show_rating !== false,
      }).eq('id', id)

      if (prodErr) throw prodErr

      // Update images
      await supabase.from('product_images').delete().eq('product_id', id)
      if (images.length) {
        await supabase.from('product_images').insert(
          images.map((img, i) => ({
            product_id: id,
            image_url: img.image_url,
            sort_order: i,
            is_description_image: img.is_description_image || false,
          }))
        )
      }

      // Update SKUs
      await supabase.from('product_skus').delete().eq('product_id', id)
      if (skus.length) {
        const { error: skuErr } = await supabase.from('product_skus').insert(
          skus.map(s => ({
            product_id: id,
            name: s.name,
            price: s.price,
            original_price: s.original_price,
            ae_price: s.ae_price || 0,
            stock: s.stock,
            image: s.image,
          }))
        )
        if (skuErr) throw skuErr
      }

      showToast('Tallennettu!', 'success')
    } catch (err) {
      showToast(`Virhe: ${err.message}`, 'error')
    }
    setSaving(false)
  }

  // ── Refresh from AliExpress ──
  async function handleRefresh() {
    setSaving(true)
    showToast('Päivitetään AliExpressistä...', 'info')
    try {
      const data = await fetchAliExpressProduct(id)

      // Update stock and prices for existing SKUs
      if (data.skus?.length) {
        const apiSkus = Object.fromEntries(data.skus.map(s => [s.id, s]))
        setSkus(prev => prev.map(s => {
          const api = apiSkus[s.id]
          if (api) {
            return {
              ...s,
              stock: api.stock,
              ae_price: api.price,
              price: Math.ceil(api.price * MARKUP * 100) / 100,
              original_price: Math.ceil((api.original_price || api.price) * MARKUP * 100) / 100,
            }
          }
          return s
        }))
      }

      // Update ae_price on product
      updateField('ae_price', data.sale_price || 0)
      updateField('orders', data.orders || product.orders)
      updateField('score', data.score || product.score)
      showToast('Varasto ja hinnat päivitetty!', 'success')
    } catch (err) {
      showToast('Päivitys epäonnistui: ' + err.message, 'error')
    }
    setSaving(false)
  }

  // ── Refresh reviews from AliExpress ──
  async function handleRefreshReviews() {
    setSaving(true)
    showToast('Haetaan arvosteluja...', 'info')
    try {
      const newReviews = await fetchAliExpressReviews(id, 5)
      if (!newReviews.length) {
        showToast('Arvosteluja ei löytynyt.', 'info')
        setSaving(false)
        return
      }

      // Delete existing reviews and save new ones
      await supabase.from('reviews').delete().eq('product_id', id)
      for (const rev of newReviews) {
        const { data: insertedReview, error: revError } = await supabase.from('reviews').insert({
          product_id: id,
          reviewer_name: rev.reviewer_name || 'Buyer',
          country: rev.country || '',
          rating: rev.rating || 5,
          comment: rev.comment || '',
          review_date: rev.review_date || '',
        }).select('id').single()

        if (!revError && insertedReview && rev.images?.length) {
          await supabase.from('review_images').insert(
            rev.images.map((imgUrl, i) => ({
              review_id: insertedReview.id,
              image_url: imgUrl,
              sort_order: i,
            }))
          )
        }
      }

      // Reload reviews
      const { data: revData } = await supabase.from('reviews').select('*, review_images(*)').eq('product_id', id).order('created_at', { ascending: false })
      setReviews(revData || [])
      showToast(`${newReviews.length} arvostelua haettu!`, 'success')
    } catch (err) {
      showToast('Arvostelujen haku epäonnistui: ' + err.message, 'error')
    }
    setSaving(false)
  }

  // ── Delete a single review ──
  async function handleDeleteReview(reviewId) {
    await supabase.from('reviews').delete().eq('id', reviewId)
    setReviews(prev => prev.filter(r => r.id !== reviewId))
  }

  async function handleAddReview() {
    if (!newReview.comment.trim()) return
    setSaving(true)
    const { data, error } = await supabase.from('reviews').insert({
      product_id: id,
      reviewer_name: newReview.reviewer_name || 'Asiakas',
      country: newReview.country || '',
      rating: Number(newReview.rating) || 5,
      comment: newReview.comment,
      review_date: new Date().toISOString(),
    }).select('*').single()
    if (!error && data) {
      setReviews(prev => [{ ...data, review_images: [] }, ...prev])
      setNewReview({ reviewer_name: '', country: '', rating: 5, comment: '' })
      showToast('Arvostelu lisätty!', 'success')
    } else {
      showToast('Virhe: ' + (error?.message || 'Tuntematon'), 'error')
    }
    setSaving(false)
  }

  async function handleSaveReview(rev) {
    const { error } = await supabase.from('reviews').update({
      reviewer_name: rev.reviewer_name,
      country: rev.country,
      rating: Number(rev.rating),
      comment: rev.comment,
    }).eq('id', rev.id)
    if (!error) {
      setEditingReviews(prev => ({ ...prev, [rev.id]: false }))
      showToast('Arvostelu tallennettu!', 'success')
    }
  }

  function updateReviewLocal(reviewId, field, value) {
    setReviews(prev => prev.map(r => r.id === reviewId ? { ...r, [field]: value } : r))
  }

  function toggleEditReview(reviewId) {
    setEditingReviews(prev => ({ ...prev, [reviewId]: !prev[reviewId] }))
  }

  function showToast(msg, type) {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  if (loading) {
    return <div className="loading-screen"><div className="spinner" /><p>Ladataan tuotetta...</p></div>
  }

  if (!product) return null

  const displayPrice = Number(product.sale_price || 0).toFixed(2)
  const displayOriginal = Number(product.original_price || 0).toFixed(2)
  const descPlain = (product.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

  return (
    <>
      {/* Toast */}
      {toast && (
        <div className="toast-container">
          <div className={`toast ${toast.type}`}>{toast.msg}</div>
        </div>
      )}

      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link to="/products" className="btn btn-ghost btn-sm">← Takaisin</Link>
          <h1>{product.title_fi || product.title || id}</h1>
          <span className={`badge badge-${product.status || 'draft'}`}>{product.status || 'draft'}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={handleRefresh} disabled={saving} title="Päivitä varasto AliExpressistä">
            ↻ Päivitä
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Tallennetaan...' : '💾 Tallenna'}
          </button>
        </div>
      </div>

      <div className="editor-layout">
        {/* ── LEFT: Editor ── */}
        <div>
          {/* Basic Info */}
          <div className="card">
            <h2 style={{ marginBottom: 16, fontSize: '1rem' }}>Perustiedot</h2>

            <div className="form-group">
              <label>Tuotenimi (suomeksi)</label>
              <input
                type="text"
                className="form-input"
                placeholder="esim. Retkeilymuki ruostumaton teräs"
                value={product.title_fi || ''}
                onChange={e => updateField('title_fi', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Tuotenimi (alkuperäinen)</label>
              <input
                type="text"
                className="form-input"
                value={product.title || ''}
                onChange={e => updateField('title', e.target.value)}
              />
            </div>

            <div className="form-row-3">
              <div className="form-group">
                <label style={{ color: 'var(--accent)' }}>Myyntihinta (Päätuote) (€)</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-input"
                  value={product.sale_price || ''}
                  onChange={e => updateField('sale_price', e.target.value)}
                  style={{ borderColor: 'var(--accent)', fontWeight: 600 }}
                />
              </div>
              <div className="form-group">
                <label>Alkuperäinen hinta (€)</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-input"
                  value={product.original_price || ''}
                  onChange={e => updateField('original_price', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Tila</label>
                <select
                  className="form-input"
                  value={product.status || 'draft'}
                  onChange={e => updateField('status', e.target.value)}
                >
                  <option value="draft">Luonnos</option>
                  <option value="active">Aktiivinen</option>
                  <option value="archived">Arkistoitu</option>
                </select>
              </div>
            </div>

            {/* AE Price info */}
            {product.ae_price > 0 && (
              <div style={{ padding: '10px 14px', background: 'var(--bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', marginBottom: 16 }}>
                <span style={{ fontSize: '.85rem', color: 'var(--fg-muted)' }}>
                  AliExpress-hinta: <strong style={{ color: 'var(--fg)' }}>€{Number(product.ae_price).toFixed(2)}</strong>
                  {' · '}Kate ×{MARKUP}: <strong style={{ color: 'var(--fg)' }}>€{(Math.ceil(Number(product.ae_price) * MARKUP * 100) / 100).toFixed(2)}</strong>
                  {product.sale_price > 0 && (
                    <>{' · '}Todellinen kate: <strong style={{ color: 'var(--accent)' }}>×{(Number(product.sale_price) / Number(product.ae_price)).toFixed(1)}</strong></>
                  )}
                </span>
              </div>
            )}

          </div>

          {/* Visibility Toggles */}
          <div className="card">
            <h2 style={{ marginBottom: 16, fontSize: '1rem' }}>Näkyvyysasetukset</h2>

            <div className="toggle-row">
              <label>Näytä alennusprosentti</label>
              <label className="toggle-switch">
                <input type="checkbox" checked={!!product.show_discount} onChange={e => updateField('show_discount', e.target.checked)} />
                <span className="toggle-slider" />
              </label>
            </div>
            <div className={`toggle-field ${product.show_discount ? 'open' : ''}`}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Alennus-teksti</label>
                <input type="text" className="form-input" placeholder="esim. -30%" value={product.discount || ''} onChange={e => updateField('discount', e.target.value)} />
              </div>
            </div>

            <div className="toggle-row">
              <label>Näytä alkuperäinen hinta (yliviivattuna)</label>
              <label className="toggle-switch">
                <input type="checkbox" checked={!!product.show_original_price} onChange={e => updateField('show_original_price', e.target.checked)} />
                <span className="toggle-slider" />
              </label>
            </div>

            <div className="toggle-row">
              <label>Näytä myyntimäärä</label>
              <label className="toggle-switch">
                <input type="checkbox" checked={!!product.show_sales} onChange={e => updateField('show_sales', e.target.checked)} />
                <span className="toggle-slider" />
              </label>
            </div>
            <div className={`toggle-field ${product.show_sales ? 'open' : ''}`}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Tilauksia (luku)</label>
                <input type="number" className="form-input" value={product.orders || 0} onChange={e => updateField('orders', e.target.value)} />
              </div>
            </div>

            <div className="toggle-row">
              <label>Näytä arvosana (tähdet)</label>
              <label className="toggle-switch">
                <input type="checkbox" checked={product.show_rating !== false} onChange={e => updateField('show_rating', e.target.checked)} />
                <span className="toggle-slider" />
              </label>
            </div>
            <div className={`toggle-field ${product.show_rating !== false ? 'open' : ''}`}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Arvosana (0-5)</label>
                <input type="number" step="0.1" min="0" max="5" className="form-input" value={product.score || ''} onChange={e => updateField('score', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="card">
            <h2 style={{ marginBottom: 6, fontSize: '1rem' }}>Kuvaus</h2>
            <p style={{ color: 'var(--fg-muted)', fontSize: '.82rem', marginBottom: 10 }}>Kirjoita normaalia tekstiä. Tyhjä rivi = uusi kappale. Tallennetaan HTML-muotoon automaattisesti.</p>
            <div className="form-group">
              <textarea
                className="form-input"
                style={{ minHeight: 200, lineHeight: 1.7 }}
                value={descText}
                onChange={e => { setDescText(e.target.value); updateField('description', textToHtml(e.target.value)) }}
                placeholder={'Korkealaatuinen retkeilymuki ruostumattomasta teräksestä.\n\nSopii erinomaisesti retkeilyyn ja ulkoiluun.\n\nTilavuus: 400ml.'}
              />
            </div>
          </div>

          {/* Images */}
          <div className="card">
            <div className="card-header">
              <h2 style={{ fontSize: '1rem' }}>
                Kuvat ({images.length})
                {mainImage && <span style={{ color: 'var(--fg-muted)', fontWeight: 400, marginLeft: 8, fontSize: '.85rem' }}>⭐ = pääkuva</span>}
              </h2>
            </div>

            {images.length === 0 ? (
              <p style={{ color: 'var(--fg-muted)' }}>Ei kuvia. Hae tuote uudelleen AliExpressistä.</p>
            ) : (
              <div className="image-gallery">
                {images.map((img, idx) => (
                  <div
                    key={idx}
                    className={`image-item ${img.image_url === mainImage ? 'is-main' : ''}`}
                    draggable
                    onDragStart={() => handleDragStart(idx)}
                    onDragEnter={() => handleDragEnter(idx)}
                    onDragEnd={handleDragEnd}
                    onDragOver={e => e.preventDefault()}
                  >
                    <img
                      src={img.image_url}
                      alt={`Kuva ${idx + 1}`}
                      loading="lazy"
                      onClick={() => setPreviewImg(img.image_url)}
                    />
                    <div className="image-actions">
                      <button title="Aseta pääkuvaksi" onClick={() => handleSetMain(img.image_url)}>⭐</button>
                      <button title="Poista" onClick={() => handleDeleteImage(idx)}>✕</button>
                    </div>
                    {img.image_url === mainImage && <span className="main-badge">Pääkuva</span>}
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontWeight: 500 }}>Lataa tietokoneelta:</span>
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={handleImageUpload} 
                  style={{ flex: 1 }} 
                />
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontWeight: 500 }}>Tai lisää URL:</span>
                <input
                  type="url"
                  className="form-input"
                  placeholder="https://..."
                  value={newImageUrl}
                  onChange={e => setNewImageUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddImageUrl())}
                  style={{ flex: 1 }}
                />
                <button className="btn btn-secondary btn-sm" style={{ whiteSpace: 'nowrap' }} onClick={handleAddImageUrl}>+ Lisää kuva</button>
              </div>
            </div>
          </div>

          {/* SKUs */}
          <div className="card">
            <div className="card-header">
              <h2 style={{ fontSize: '1rem' }}>Variantit / SKU:t ({skus.length})</h2>
              <button className="btn btn-secondary btn-sm" onClick={handleAddSku}>+ Lisää variantti</button>
            </div>

            {skus.length === 0 ? (
              <p style={{ color: 'var(--fg-muted)' }}>Ei variantteja.</p>
            ) : (
              <div className="sku-grid">
                <div className="sku-row" style={{ fontWeight: 600, fontSize: '.8rem', color: 'var(--fg-muted)', borderBottom: '2px solid var(--border)' }}>
                  <div></div>
                  <div>Nimi</div>
                  <div>AE-hinta €</div>
                  <div>Hinta €</div>
                  <div>Alk. hinta €</div>
                  <div>Varasto</div>
                  <div></div>
                </div>
                {skus.map((sku, idx) => (
                  <div key={sku.id || idx} className="sku-row">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                        <div 
                          style={{ cursor: 'pointer', position: 'relative' }} 
                          title="Vaihda kuva (klikkaa)"
                          onClick={() => document.getElementById(`sku-upload-${idx}`).click()}
                        >
                          {sku.image ? (
                            <img src={sku.image} alt="" className="sku-thumb" />
                          ) : (
                            <div className="sku-thumb" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-dim)', fontSize: '.7rem' }}>+</div>
                          )}
                        </div>
                        <input 
                          type="file" 
                          id={`sku-upload-${idx}`} 
                          style={{ display: 'none' }} 
                          accept="image/*" 
                          onChange={(e) => handleSkuImageUpload(e, idx)} 
                        />
                        <button 
                          className="btn btn-secondary" 
                          style={{ padding: '2px 4px', fontSize: '0.6rem' }}
                          title="Lisää URL"
                          onClick={() => {
                            const url = prompt("Syötä uuden kuvan URL osoite (https://...):")
                            if (url) updateSku(idx, 'image', url)
                          }}
                        >
                           URL
                        </button>
                      </div>
                    <div>
                      <input
                        className="form-input"
                        value={sku.name || ''}
                        onChange={e => updateSku(idx, 'name', e.target.value)}
                      />
                    </div>
                    <div>
                      <input
                        type="number" step="0.01"
                        className="form-input"
                        value={sku.ae_price || ''}
                        disabled
                        style={{ opacity: 0.6, background: 'var(--bg)' }}
                        title="AliExpress-hinta (ei muokattavissa)"
                      />
                    </div>
                    <div>
                      <input
                        type="number" step="0.01"
                        className="form-input"
                        value={sku.price || ''}
                        onChange={e => updateSku(idx, 'price', e.target.value)}
                      />
                    </div>
                    <div>
                      <input
                        type="number" step="0.01"
                        className="form-input"
                        value={sku.original_price || ''}
                        onChange={e => updateSku(idx, 'original_price', e.target.value)}
                      />
                    </div>
                    <div>
                      <input
                        type="number"
                        className="form-input"
                        value={sku.stock || 0}
                        onChange={e => updateSku(idx, 'stock', e.target.value)}
                      />
                    </div>
                    <div>
                      <button className="btn btn-ghost btn-sm" onClick={() => deleteSku(idx)}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Reviews */}
          <div className="card">
            <div className="card-header">
              <h2 style={{ fontSize: '1rem' }}>Arvostelut ({reviews.length})</h2>
              <button className="btn btn-secondary btn-sm" onClick={handleRefreshReviews} disabled={saving}>
                ↻ Hae arvostelut AliExpressistä
              </button>
            </div>

            {reviews.length === 0 ? (
              <p style={{ color: 'var(--fg-muted)' }}>Ei arvosteluja. Paina "Hae arvostelut" tuodaksesi AliExpressistä.</p>
            ) : (
              <div style={{ maxHeight: 500, overflow: 'auto' }}>
                {reviews.map((rev) => (
                  <div key={rev.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                    {editingReviews[rev.id] ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input className="form-input" style={{ flex: 2 }} placeholder="Nimi" value={rev.reviewer_name || ''} onChange={e => updateReviewLocal(rev.id, 'reviewer_name', e.target.value)} />
                          <input className="form-input" style={{ flex: 1 }} placeholder="Maa" value={rev.country || ''} onChange={e => updateReviewLocal(rev.id, 'country', e.target.value)} />
                          <select className="form-input" style={{ width: 80 }} value={rev.rating || 5} onChange={e => updateReviewLocal(rev.id, 'rating', Number(e.target.value))}>
                            {[1,2,3,4,5].map(n => <option key={n} value={n}>{n} ★</option>)}
                          </select>
                        </div>
                        <textarea className="form-input" style={{ minHeight: 80 }} value={rev.comment || ''} onChange={e => updateReviewLocal(rev.id, 'comment', e.target.value)} />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="btn btn-primary btn-sm" onClick={() => handleSaveReview(rev)}>Tallenna</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => toggleEditReview(rev.id)}>Peruuta</button>
                          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto', color: 'var(--danger)' }} onClick={() => handleDeleteReview(rev.id)}>✕ Poista</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '.85rem', marginBottom: 4 }}>
                            <strong>{rev.reviewer_name}</strong>
                            {rev.country && <span style={{ color: 'var(--fg-dim)', marginLeft: 8 }}>{rev.country}</span>}
                            <span style={{ color: 'var(--accent)', marginLeft: 8 }}>
                              {'★'.repeat(rev.rating || 5)}{'☆'.repeat(5 - (rev.rating || 5))}
                            </span>
                          </div>
                          <div style={{ fontSize: '.85rem', color: 'var(--fg-muted)' }}>
                            {rev.comment?.slice(0, 200)}{rev.comment?.length > 200 && '...'}
                          </div>
                          {rev.review_images?.length > 0 && (
                            <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                              {rev.review_images.map((img, i) => (
                                <img key={i} src={img.image_url} alt="" style={{ width: 40, height: 40, borderRadius: 4, objectFit: 'cover' }} />
                              ))}
                            </div>
                          )}
                        </div>
                        <button className="btn btn-ghost btn-sm" onClick={() => toggleEditReview(rev.id)} title="Muokkaa">✏️</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleDeleteReview(rev.id)} title="Poista">✕</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Lisää arvostelu manuaalisesti */}
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <h3 style={{ fontSize: '.9rem', marginBottom: 10, color: 'var(--fg-muted)' }}>+ Lisää arvostelu manuaalisesti</h3>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input className="form-input" style={{ flex: 2 }} placeholder="Nimi (esim. Anna S.)" value={newReview.reviewer_name} onChange={e => setNewReview(p => ({ ...p, reviewer_name: e.target.value }))} />
                <input className="form-input" style={{ flex: 1 }} placeholder="Maa (esim. FI)" value={newReview.country} onChange={e => setNewReview(p => ({ ...p, country: e.target.value }))} />
                <select className="form-input" style={{ width: 90 }} value={newReview.rating} onChange={e => setNewReview(p => ({ ...p, rating: Number(e.target.value) }))}>
                  {[1,2,3,4,5].map(n => <option key={n} value={n}>{n} ★</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <textarea className="form-input" style={{ flex: 1, minHeight: 70 }} placeholder="Arvosteluteksti..." value={newReview.comment} onChange={e => setNewReview(p => ({ ...p, comment: e.target.value }))} />
                <button className="btn btn-secondary" style={{ alignSelf: 'flex-end', whiteSpace: 'nowrap' }} onClick={handleAddReview} disabled={saving || !newReview.comment.trim()}>+ Lisää</button>
              </div>
            </div>
          </div>

          {/* Meta / AliExpress */}
          <div className="card">
            <h2 style={{ marginBottom: 16, fontSize: '1rem' }}>Lisätiedot</h2>
            <div className="form-row">
              <div className="form-group">
                <label>AliExpress ID</label>
                <input type="text" className="form-input" value={id} disabled />
              </div>
              <div className="form-group">
                <label>AliExpress URL</label>
                <input
                  type="text"
                  className="form-input"
                  value={product.url || ''}
                  onChange={e => updateField('url', e.target.value)}
                />
              </div>
            </div>
            <div className="form-row-3">
              <div className="form-group">
                <label>Tilauksia</label>
                <input type="number" className="form-input" value={product.orders || 0} onChange={e => updateField('orders', e.target.value)} disabled style={{ opacity: 0.5 }} />
              </div>
              <div className="form-group">
                <label>Arvosana</label>
                <input type="number" step="0.1" className="form-input" value={product.score || ''} onChange={e => updateField('score', e.target.value)} disabled style={{ opacity: 0.5 }} />
              </div>
              <div className="form-group">
                <label>Kategoria</label>
                <input type="text" className="form-input" value={product.category_id || ''} onChange={e => updateField('category_id', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="form-actions" style={{ borderTop: 'none', marginTop: 0 }}>
            <Link to="/products" className="btn btn-secondary">Peruuta</Link>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Tallennetaan...' : '💾 Tallenna muutokset'}
            </button>
          </div>
        </div>

        {/* ── RIGHT: Live Preview ── */}
        <div className="preview-card">
          <img
            src={previewImg || mainImage || '/placeholder.png'}
            alt="Preview"
            className="preview-image"
            onError={e => { e.target.style.background = 'var(--bg-input)'; e.target.src = '' }}
          />
          <div className="preview-body">
            <div className="preview-title">{product.title_fi || product.title || 'Tuotenimi'}</div>
            <div className="preview-price">
              €{displayPrice}
              {product.show_original_price && displayOriginal > displayPrice && (
                <span className="original">€{displayOriginal}</span>
              )}
              {product.show_discount && product.discount && (
                <span style={{ marginLeft: 8, color: 'var(--danger)', fontWeight: 700, fontSize: '.85rem' }}>{product.discount}</span>
              )}
            </div>
            {product.show_rating !== false && product.score > 0 && (
              <div className="preview-rating">
                {'★'.repeat(Math.round(product.score))}{'☆'.repeat(5 - Math.round(product.score))}
                {' '}{product.score}
                {product.show_sales && <>{' · '}{product.orders || 0} tilausta</>}
              </div>
            )}
            {!product.show_rating && product.show_sales && (
              <div className="preview-rating" style={{ color: 'var(--fg-muted)', fontSize: '.85rem' }}>
                {product.orders || 0} tilausta
              </div>
            )}
          </div>

          {images.length > 1 && (
            <div className="preview-gallery">
              {images.slice(0, 8).map((img, i) => (
                <img
                  key={i}
                  src={img.image_url}
                  alt=""
                  onClick={() => setPreviewImg(img.image_url)}
                  style={img.image_url === previewImg ? { borderColor: 'var(--accent)' } : {}}
                />
              ))}
            </div>
          )}

          {descPlain && (
            <div className="preview-desc">
              {descPlain.slice(0, 300)}{descPlain.length > 300 && '...'}
            </div>
          )}

          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
            <span className={`badge badge-${product.status || 'draft'}`}>
              {product.status || 'draft'}
            </span>
            {skus.length > 0 && (
              <span style={{ color: 'var(--fg-muted)', fontSize: '.8rem', marginLeft: 12 }}>
                {skus.length} varianttia · {skus.reduce((sum, s) => sum + (Number(s.stock) || 0), 0)} kpl varastossa
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
