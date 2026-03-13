import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import ConfirmDialog from '../components/ConfirmDialog'

export default function Products() {
  const navigate = useNavigate()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [deleteId, setDeleteId] = useState(null)

  useEffect(() => { loadProducts() }, [])

  async function loadProducts() {
    setLoading(true)
    const { data } = await supabase
      .from('products')
      .select('id, title, title_fi, sale_price, image, status, orders, score, updated_at, product_skus(id)')
      .order('updated_at', { ascending: false })
    setProducts(data || [])
    setLoading(false)
  }

  
    async function handleCreateEmpty() {
    // Generate a negative ID using timestamp to ensure it's a valid bigint, distinct from AliExpress IDs
    const newId = -1 * Date.now()
    const { data, error } = await supabase.from('products').insert([{
      id: newId,
        title_fi: 'Uusi oma tuote',
        status: 'draft',
        ae_price: 0,
        sale_price: 0
      }]).select()
      if (error) {
        alert('Virhe luodessa tuotetta: ' + error.message)
      } else if (data && data[0]) {
        navigate('/edit/' + data[0].id)
      }
    }

    async function handleDelete() {

    if (!deleteId) return
    // Cascade deletes handle images, skus, reviews
    await supabase.from('products').delete().eq('id', deleteId)
    setProducts(prev => prev.filter(p => p.id !== deleteId))
    setDeleteId(null)
  }

  async function handleStatusChange(id, newStatus) {
    await supabase.from('products').update({ status: newStatus }).eq('id', id)
    setProducts(prev => prev.map(p => p.id === id ? { ...p, status: newStatus } : p))
  }

  async function handleDuplicate(product) {
    const newId = product.id + '-copy-' + Date.now().toString(36)
    const { data: full } = await supabase.from('products').select('*').eq('id', product.id).single()
    if (!full) return

    const copy = { ...full, id: newId, title_fi: (full.title_fi || full.title || '') + ' (kopio)', status: 'draft', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    await supabase.from('products').insert(copy)

    // Copy images
    const { data: imgs } = await supabase.from('product_images').select('*').eq('product_id', product.id)
    if (imgs?.length) {
      await supabase.from('product_images').insert(imgs.map(i => ({ ...i, id: undefined, product_id: newId })))
    }

    // Copy SKUs
    const { data: skus } = await supabase.from('product_skus').select('*').eq('product_id', product.id)
    if (skus?.length) {
      await supabase.from('product_skus').insert(skus.map(s => ({ ...s, id: s.id + '-' + Date.now().toString(36), product_id: newId })))
    }

    navigate(`/edit/${newId}`)
  }

  const filtered = products.filter(p => {
    const matchSearch = !search ||
      (p.title_fi || '').toLowerCase().includes(search.toLowerCase()) ||
      (p.title || '').toLowerCase().includes(search.toLowerCase()) ||
      p.id.includes(search)
    const matchStatus = statusFilter === 'all' || (p.status || 'draft') === statusFilter
    return matchSearch && matchStatus
  })

  return (
    <>
      <div className="page-header">
        <h1>Tuotteet ({filtered.length})</h1>
                  <Link to="/import" className="btn btn-primary" style={{ marginRight: 8 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8m-4-4h8"/></svg>
            Tuo AliExpressistä
          </Link>
          <button onClick={handleCreateEmpty} className="btn" style={{ background: 'var(--success)', color: 'white', border: 'none' }}>
            + Luo oma tuote
          </button>
      </div>

      <div className="search-bar">
        <input
          type="text"
          className="form-input"
          placeholder="Hae tuotteen nimellä tai ID:llä..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="form-input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">Kaikki tilat</option>
          <option value="active">Aktiivinen</option>
          <option value="draft">Luonnos</option>
          <option value="archived">Arkistoitu</option>
        </select>
      </div>

      <div className="card">
        {loading ? (
          <div className="empty-state"><div className="spinner" /><p>Ladataan...</p></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <h3>Ei tuotteita</h3>
            <p>{search ? 'Hakuehto ei tuottanut tuloksia.' : 'Aloita lisäämällä ensimmäinen tuote.'}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 60 }}></th>
                  <th>Tuote</th>
                  <th>Hinta</th>
                  <th>Variantit</th>
                  <th>Tilauksia</th>
                  <th>Tila</th>
                  <th>Toiminnot</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id}>
                    <td>
                      {p.image ? (
                        <img src={p.image} alt="" className="table-thumb" loading="lazy" />
                      ) : (
                        <div className="table-thumb" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-dim)' }}>?</div>
                      )}
                    </td>
                    <td>
                      <Link to={`/edit/${p.id}`} style={{ color: 'var(--fg)', fontWeight: 600 }}>
                        {p.title_fi || p.title || p.id}
                      </Link>
                      <br />
                      <span style={{ color: 'var(--fg-dim)', fontSize: '.8rem' }}>{p.id}</span>
                    </td>
                    <td style={{ fontWeight: 600 }}>
                      {p.sale_price ? `€${Number(p.sale_price).toFixed(2)}` : '–'}
                    </td>
                    <td style={{ color: 'var(--fg-muted)', fontSize: '.82rem', textAlign: 'center' }}>
                      {(p.product_skus?.length || 0) > 0
                        ? <span style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '2px 8px', fontWeight: 600, color: 'var(--fg)' }}>{p.product_skus.length}</span>
                        : <span style={{ color: 'var(--fg-dim)' }}>–</span>}
                    </td>
                    <td style={{ color: 'var(--fg-muted)' }}>{p.orders || 0}</td>
                    <td>
                      <select
                        className="form-input"
                        style={{ padding: '4px 8px', width: 'auto', fontSize: '.8rem' }}
                        value={p.status || 'draft'}
                        onChange={e => handleStatusChange(p.id, e.target.value)}
                      >
                        <option value="active">Aktiivinen</option>
                        <option value="draft">Luonnos</option>
                        <option value="archived">Arkistoitu</option>
                      </select>
                    </td>
                    <td>
                      <div className="table-actions">
                        <Link to={`/edit/${p.id}`} className="btn btn-ghost btn-sm">✏️</Link>
                        <button className="btn btn-ghost btn-sm" title="Kopioi" onClick={() => handleDuplicate(p)}>📋</button>
                        <button className="btn btn-ghost btn-sm" title="Poista" onClick={() => setDeleteId(p.id)}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {deleteId && (
        <ConfirmDialog
          title="Poista tuote"
          message={`Haluatko varmasti poistaa tuotteen ${deleteId}? Tämä poistaa myös kuvat, SKU:t ja arvostelut.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </>
  )
}
