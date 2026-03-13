import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, MARKUP } from '../supabase'
import { fetchAliExpressProduct, fetchAliExpressReviews } from '../aliexpress'

// Convert plain text paragraphs to HTML <p> tags
function textToHtml(text) {
  if (!text) return ''
  return text
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('\n')
}

export default function ImportProduct() {
  const navigate = useNavigate()
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [aeProduct, setAeProduct] = useState(null)
  const [titleFi, setTitleFi] = useState('')
  const [titleOrig, setTitleOrig] = useState('')
  const [descText, setDescText] = useState('')
  const [customPrice, setCustomPrice] = useState('')
  const [origPrice, setOrigPrice] = useState('')
  const [productStatus, setProductStatus] = useState('draft')
  const [skus, setSkus] = useState([])
  const [images, setImages] = useState([])
  const [reviewPages, setReviewPages] = useState(5)

  function parseProductId(text) {
    text = text.trim()
    if (/^\d{10,20}$/.test(text)) return text
    const patterns = [
      /\/item\/(\d{10,20})/,
      /productIds=(\d{10,20})/,
      /x_object_id(?:%3A|:)(\d{10,20})/,
      /(?:^|\/)(\d{13,20})(?:\.|\/|$|\?|&|:)/,
    ]
    for (const p of patterns) {
      const m = text.match(p)
      if (m) return m[1]
    }
    return null
  }

  async function handleFetch(e) {
    e.preventDefault()
    const productId = parseProductId(url)
    if (!productId) {
      setStatus({ type: 'error', message: 'Virheellinen linkki. Liitä AliExpress-tuotelinkki tai tuote-ID.' })
      return
    }
    setLoading(true)
    setAeProduct(null)
    setStatus({ type: 'loading', message: `Haetaan tuotetta ${productId}...` })
    try {
      const data = await fetchAliExpressProduct(productId)
      setAeProduct(data)
      setTitleFi('')
      setTitleOrig(data.title || '')
      const tempDiv = document.createElement('div')
      tempDiv.innerHTML = data.description || ''
      const plain = tempDiv.textContent.trim().replace(/\s{3,}/g, '\n\n')
      setDescText(plain)
      const aeMin = data.sale_price || 0
      setCustomPrice(String(Math.ceil(aeMin * MARKUP * 100) / 100))
      setOrigPrice(String(Math.ceil((data.original_price || aeMin) * MARKUP * 100) / 100))
      setImages(data.images.map((imgUrl, i) => ({ url: imgUrl, selected: true, isMain: i === 0 })))
      setSkus(data.skus.map(s => ({
        ...s,
        ae_price: s.price || 0,
        price: Math.ceil((s.price || 0) * MARKUP * 100) / 100,
        original_price: Math.ceil((s.original_price || s.price || 0) * MARKUP * 100) / 100,
      })))
      setProductStatus('draft')
      setStatus({ type: 'success', message: `Haettu! ${data.skus.length} varianttia, ${data.images.length} kuvaa. Muokkaa ja tallenna.` })
    } catch (err) {
      setStatus({ type: 'error', message: `Virhe: ${err.message}` })
    }
    setLoading(false)
  }

  function setMainImage(idx) {
    setImages(prev => prev.map((img, i) => ({ ...img, isMain: i === idx, selected: i === idx ? true : img.selected })))
  }

  function toggleImage(idx) {
    setImages(prev => prev.map((img, i) => {
      if (i !== idx) return img
      if (img.isMain) return img
      return { ...img, selected: !img.selected }
    }))
  }

  function toggleAllImages() {
    const allSelected = images.every(img => img.selected)
    setImages(prev => prev.map(img => ({ ...img, selected: img.isMain ? true : !allSelected })))
  }

  function updateSku(idx, field, value) {
    setSkus(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s))
  }

  function deleteSku(idx) {
    setSkus(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSave() {
    if (!aeProduct) return
    setSaving(true)
    setStatus({ type: 'loading', message: 'Tallennetaan...' })
    try {
      const productId = aeProduct.id
      const aePrice = aeProduct.sale_price || 0
      const sellingPrice = parseFloat(customPrice) || Math.ceil(aePrice * MARKUP * 100) / 100
      const mainImgUrl = images.find(i => i.isMain)?.url || images.find(i => i.selected)?.url || images[0]?.url || ''

      const { error: insertError } = await supabase.from('products').upsert({
        id: productId,
        title: titleOrig,
        title_fi: titleFi,
        sale_price: sellingPrice,
        original_price: parseFloat(origPrice) || sellingPrice,
        ae_price: aePrice,
        currency: 'EUR',
        image: mainImgUrl,
        url: aeProduct.url || `https://www.aliexpress.com/item/${productId}.html`,
        orders: aeProduct.orders || 0,
        score: aeProduct.score || 0,
        evaluate_rate: aeProduct.evaluate_rate || '',
        category_id: aeProduct.category_id || '',
        description: textToHtml(descText),
        evaluation_count: String(aeProduct.evaluation_count || 0),
        sales_count: String(aeProduct.sales_count || 0),
        status: productStatus,
        show_rating: true,
      })
      if (insertError) throw insertError

      const selectedImgs = images.filter(i => i.selected)
      await supabase.from('product_images').delete().eq('product_id', productId)
      if (selectedImgs.length) {
        const ordered = [...selectedImgs.filter(i => i.isMain), ...selectedImgs.filter(i => !i.isMain)]
        await supabase.from('product_images').insert(
          ordered.map((img, i) => ({ product_id: productId, image_url: img.url, sort_order: i, is_description_image: false }))
        )
      }

      await supabase.from('product_skus').delete().eq('product_id', productId)
      if (skus.length) {
        const { error: skuErr } = await supabase.from('product_skus').insert(
          skus.map(s => ({
            product_id: productId,
            name: s.name || '',
            price: parseFloat(s.price) || 0,
            original_price: parseFloat(s.original_price) || parseFloat(s.price) || 0,
            ae_price: s.ae_price || 0,
            stock: parseInt(s.stock) || 0,
            image: s.image || '',
          }))
        )
        if (skuErr) console.error('SKU insert error:', skuErr)
      }

      if (reviewPages > 0) {
        setStatus({ type: 'loading', message: `Haetaan arvosteluja (${reviewPages} sivua)...` })
        try {
          const reviews = await fetchAliExpressReviews(productId, reviewPages)
          if (reviews.length) {
            await supabase.from('reviews').delete().eq('product_id', productId)
            for (const rev of reviews) {
              const { data: inserted, error: revErr } = await supabase.from('reviews').insert({
                product_id: productId,
                reviewer_name: rev.reviewer_name || 'Buyer',
                country: rev.country || '',
                rating: rev.rating || 5,
                comment: rev.comment || '',
                review_date: rev.review_date || '',
              }).select('id').single()
              if (!revErr && inserted && rev.images?.length) {
                await supabase.from('review_images').insert(
                  rev.images.map((imgUrl, i) => ({ review_id: inserted.id, image_url: imgUrl, sort_order: i }))
                )
              }
            }
            setStatus({ type: 'success', message: `Tallennettu! ${reviews.length} arvostelua tuotu.` })
          } else {
            setStatus({ type: 'success', message: 'Tuote tallennettu. Arvosteluja ei löytynyt.' })
          }
        } catch {
          setStatus({ type: 'success', message: 'Tuote tallennettu! Arvostelujen haku epäonnistui.' })
        }
      } else {
        setStatus({ type: 'success', message: 'Tuote tallennettu!' })
      }
      setTimeout(() => navigate(`/edit/${productId}`), 900)
    } catch (err) {
      setStatus({ type: 'error', message: `Virhe: ${err.message}` })
    }
    setSaving(false)
  }

  const selectedCount = images.filter(i => i.selected).length
  const skusWithStock = skus.filter(s => parseInt(s.stock) > 0)
  const minPrice = skus.length ? Math.min(...skus.filter(s => s.price > 0).map(s => parseFloat(s.price) || 0)) : 0
  const maxPrice = skus.length ? Math.max(...skus.map(s => parseFloat(s.price) || 0)) : 0

  return (
    <>
      <div className="page-header">
        <h1>Lisää tuote</h1>
      </div>

      <div className="card">
        <form onSubmit={handleFetch}>
          <div className="import-input-wrap">
            <input
              type="text"
              className="form-input"
              placeholder="https://aliexpress.com/item/1005001234567890.html tai pelkkä tuote-ID"
              value={url}
              onChange={e => setUrl(e.target.value)}
              required
              autoFocus
            />
            <button className="btn btn-primary" disabled={loading || saving}>
              {loading
                ? <><div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> Haetaan...</>
                : ' Hae tuote'
              }
            </button>
          </div>
        </form>
        {status && (
          <div className={`import-status ${status.type}`} style={{ marginBottom: 0 }}>
            {status.type === 'loading' && <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2, display: 'inline-block', marginRight: 8 }} />}
            {status.message}
          </div>
        )}
      </div>

      {aeProduct && (
        <>
          {/* AE info bar */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', margin: '16px 0', padding: '10px 16px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '.82rem', color: 'var(--fg-muted)', alignItems: 'center' }}>
            <span>ID: <strong style={{ color: 'var(--fg)' }}>{aeProduct.id}</strong></span>
            <span>AE-ostohinta: <strong style={{ color: 'var(--accent)' }}>€{(aeProduct.sale_price || 0).toFixed(2)}</strong></span>
            <span>Tilauksia: <strong style={{ color: 'var(--fg)' }}>{aeProduct.orders}</strong></span>
            <span>Arvosana: <strong style={{ color: 'var(--fg)' }}>{aeProduct.score}/5</strong></span>
            <span>Variantteja: <strong style={{ color: 'var(--fg)' }}>{skus.length}</strong></span>
            <span>Varastossa: <strong style={{ color: skusWithStock.length > 0 ? 'var(--success)' : 'var(--danger)' }}>{skus.reduce((s, k) => s + (parseInt(k.stock) || 0), 0)} kpl</strong></span>
          </div>

          {/* Perustiedot */}
          <div className="card">
            <h2 style={{ marginBottom: 16, fontSize: '1rem' }}>Perustiedot</h2>
            <div className="form-group">
              <label>Tuotenimi suomeksi</label>
              <input
                type="text"
                className="form-input"
                placeholder="Kirjoita oma nimi suomeksi, esim. Retkeilymuki 400ml ruostumaton teräs"
                value={titleFi}
                onChange={e => setTitleFi(e.target.value)}
                style={{ fontSize: '1rem', fontWeight: 600 }}
              />
            </div>
            <div className="form-group">
              <label>Alkuperäinen nimi (AliExpress)</label>
              <input type="text" className="form-input" value={titleOrig} onChange={e => setTitleOrig(e.target.value)} />
            </div>
            <div className="form-row-3">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ color: 'var(--accent)' }}>Myyntihinta (€)</label>
                <input type="number" step="0.01" className="form-input" value={customPrice} onChange={e => setCustomPrice(e.target.value)} style={{ borderColor: 'var(--accent)', fontWeight: 700, fontSize: '1.1rem' }} />
                <span style={{ fontSize: '.72rem', color: 'var(--fg-dim)', marginTop: 3, display: 'block' }}>AE  {MARKUP} = €{(Math.ceil((aeProduct.sale_price || 0) * MARKUP * 100) / 100).toFixed(2)}</span>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Alkuperäinen hinta (€)</label>
                <input type="number" step="0.01" className="form-input" value={origPrice} onChange={e => setOrigPrice(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Tila</label>
                <select className="form-input" value={productStatus} onChange={e => setProductStatus(e.target.value)}>
                  <option value="draft">Luonnos</option>
                  <option value="active">Aktiivinen</option>
                </select>
              </div>
            </div>
          </div>

          {/* Kuvaus */}
          <div className="card" style={{ marginTop: 16 }}>
            <h2 style={{ marginBottom: 6, fontSize: '1rem' }}>Tuotekuvaus</h2>
            <p style={{ color: 'var(--fg-muted)', fontSize: '.82rem', marginBottom: 10 }}>Kirjoita normaalia tekstiä. Tyhjä rivi = uusi kappale. Tallennetaan HTML-muotoon automaattisesti.</p>
            <textarea
              className="form-input"
              style={{ minHeight: 160, lineHeight: 1.7 }}
              value={descText}
              onChange={e => setDescText(e.target.value)}
              placeholder={'Korkealaatuinen retkeilymuki ruostumattomasta teräksestä.\n\nSopii erinomaisesti retkeilyyn ja ulkoiluun.\n\nTilavuus: 400ml. Materiaali: 304 ruostumaton teräs.'}
            />
          </div>

          {/* Variantit */}
          {skus.length > 0 && (
            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-header">
                <h2 style={{ fontSize: '1rem' }}>Variantit ({skus.length} kpl)</h2>
                <div style={{ fontSize: '.8rem', color: 'var(--fg-dim)' }}>
                  {minPrice === maxPrice ? `€${minPrice.toFixed(2)}` : `€${minPrice.toFixed(2)}  €${maxPrice.toFixed(2)}`}
                  {'  '}yhteensä {skus.reduce((s, k) => s + (parseInt(k.stock) || 0), 0)} kpl
                </div>
              </div>
              <div className="sku-import-grid">
                <div className="sku-import-header">
                  <div></div>
                  <div>Variantin nimi</div>
                  <div>AE-hinta €</div>
                  <div>Myyntihinta €</div>
                  <div>Varasto kpl</div>
                  <div></div>
                </div>
                {skus.map((sku, idx) => (
                  <div key={idx} className="sku-import-row">
                    <div className="sku-img-cell">
                      {sku.image
                        ? <img src={sku.image} alt="" className="sku-img-big" />
                        : <div className="sku-img-placeholder"></div>
                      }
                    </div>
                    <div>
                      <input className="form-input" value={sku.name || ''} onChange={e => updateSku(idx, 'name', e.target.value)} placeholder="Variantin nimi" />
                    </div>
                    <div>
                      <input type="number" step="0.01" className="form-input" value={sku.ae_price || ''} disabled style={{ opacity: 0.5, background: 'var(--bg)' }} />
                    </div>
                    <div>
                      <input type="number" step="0.01" className="form-input" value={sku.price || ''} onChange={e => updateSku(idx, 'price', e.target.value)} style={{ borderColor: 'var(--accent)' }} />
                    </div>
                    <div>
                      <input type="number" className="form-input" value={sku.stock || 0} onChange={e => updateSku(idx, 'stock', e.target.value)} />
                    </div>
                    <div>
                      <button className="btn btn-ghost btn-sm" onClick={() => deleteSku(idx)} title="Poista"></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Kuvat */}
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-header">
              <h2 style={{ fontSize: '1rem' }}>Kuvat ({selectedCount}/{images.length} valittu)</h2>
              <button className="btn btn-ghost btn-sm" onClick={toggleAllImages}>
                {images.every(i => i.selected) ? 'Poista kaikki' : 'Valitse kaikki'}
              </button>
            </div>
            <p style={{ color: 'var(--fg-muted)', fontSize: '.82rem', marginBottom: 12 }}>
              Klikkaa kuvaa valitaksesi tai poistaaksesi. Paina  asettaaksesi pääkuvan (näytetään tuotekorteilla).
            </p>
            <div className="image-gallery">
              {images.map((img, idx) => (
                <div key={idx} className={`image-item ${img.isMain ? 'is-main' : ''}`} style={{ opacity: img.selected ? 1 : 0.3 }} onClick={() => toggleImage(idx)}>
                  <img src={img.url} alt={`Kuva ${idx + 1}`} loading="lazy" />
                  <div className="image-actions" onClick={e => e.stopPropagation()}>
                    <button title="Pääkuva" onClick={() => setMainImage(idx)} style={img.isMain ? { background: 'var(--accent)', color: '#111' } : {}}></button>
                    <button onClick={() => toggleImage(idx)} style={img.selected ? { background: 'var(--success)', color: '#fff' } : {}}>{img.selected ? '' : '+'}</button>
                  </div>
                  {img.isMain && <span className="main-badge">Pääkuva</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Arvostelut */}
          <div className="card" style={{ marginTop: 16 }}>
            <h2 style={{ marginBottom: 10, fontSize: '1rem' }}>Arvostelut</h2>
            <select className="form-input" value={reviewPages} onChange={e => setReviewPages(Number(e.target.value))} style={{ maxWidth: 280 }}>
              <option value={0}>Älä hae arvosteluja</option>
              <option value={1}>1 sivu (~20 arvostelua)</option>
              <option value={3}>3 sivua (~60 arvostelua)</option>
              <option value={5}>5 sivua (~100 arvostelua)</option>
              <option value={10}>10 sivua (~200 arvostelua)</option>
            </select>
          </div>

          {/* Tallenna */}
          <div style={{ marginTop: 20, display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => { setAeProduct(null); setStatus(null) }}>Peruuta</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving || loading} style={{ padding: '12px 32px', fontSize: '1rem' }}>
              {saving
                ? <><div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> Tallennetaan...</>
                : ' Tallenna tuote'
              }
            </button>
          </div>
        </>
      )}

      {!aeProduct && (
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ padding: '16px 20px', background: 'var(--bg)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
            <h3 style={{ marginBottom: 10, fontSize: '.95rem' }}>Näin se toimii</h3>
            <ol style={{ paddingLeft: 20, color: 'var(--fg-muted)', lineHeight: 2, fontSize: '.9rem' }}>
              <li>Liitä AliExpress-tuotelinkki tai pelkkä ID kenttään</li>
              <li>Paina <strong>Hae tuote</strong>  kaikki tiedot, kuvat ja variantit haetaan kerralla</li>
              <li>Muokkaa nimi, kuvaus, hinnat ja valitse kuvat</li>
              <li>Variantit näkyvät <strong>kuvineen</strong>  muokkaa hinnat ja varastot per variantti</li>
              <li>Paina <strong>Tallenna</strong>  siirrytään muokkaussivulle jatkomuokkausta varten</li>
            </ol>
          </div>
        </div>
      )}
    </>
  )
}
