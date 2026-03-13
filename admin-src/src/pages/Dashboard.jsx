import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'

export default function Dashboard() {
  const [stats, setStats] = useState({ total: 0, active: 0, draft: 0, archived: 0 })
  const [recent, setRecent] = useState([])

  useEffect(() => {
    loadStats()
    loadRecent()
  }, [])

  async function loadStats() {
    const { data } = await supabase.from('products').select('id, status')
    if (!data) return
    setStats({
      total: data.length,
      active: data.filter(p => p.status === 'active').length,
      draft: data.filter(p => p.status === 'draft' || !p.status).length,
      archived: data.filter(p => p.status === 'archived').length,
    })
  }

  async function loadRecent() {
    const { data } = await supabase
      .from('products')
      .select('id, title, title_fi, image, status, updated_at')
      .order('updated_at', { ascending: false })
      .limit(5)
    setRecent(data || [])
  }

  return (
    <>
      <div className="page-header">
        <h1>Dashboard</h1>
        <Link to="/import" className="btn btn-primary">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8m-4-4h8"/></svg>
          Lisää tuote
        </Link>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="label">Tuotteita yhteensä</div>
          <div className="value accent">{stats.total}</div>
        </div>
        <div className="stat-card">
          <div className="label">Aktiivisia</div>
          <div className="value success">{stats.active}</div>
        </div>
        <div className="stat-card">
          <div className="label">Luonnoksia</div>
          <div className="value">{stats.draft}</div>
        </div>
        <div className="stat-card">
          <div className="label">Arkistoitu</div>
          <div className="value">{stats.archived}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Viimeksi muokatut</h2>
          <Link to="/products" className="btn btn-ghost btn-sm">Kaikki tuotteet →</Link>
        </div>

        {recent.length === 0 ? (
          <div className="empty-state">
            <h3>Ei tuotteita vielä</h3>
            <p>Aloita lisäämällä ensimmäinen tuote AliExpressistä.</p>
            <Link to="/import" className="btn btn-primary">Lisää tuote</Link>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Tuote</th>
                  <th>Tila</th>
                  <th>Päivitetty</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {recent.map(p => (
                  <tr key={p.id}>
                    <td>
                      {p.image && <img src={p.image} alt="" className="table-thumb" loading="lazy" />}
                    </td>
                    <td>
                      <strong>{p.title_fi || p.title || p.id}</strong>
                      <br />
                      <span style={{ color: 'var(--fg-dim)', fontSize: '.8rem' }}>{p.id}</span>
                    </td>
                    <td>
                      <span className={`badge badge-${p.status || 'draft'}`}>
                        {p.status || 'draft'}
                      </span>
                    </td>
                    <td style={{ color: 'var(--fg-muted)', fontSize: '.85rem' }}>
                      {p.updated_at ? new Date(p.updated_at).toLocaleDateString('fi-FI') : '–'}
                    </td>
                    <td>
                      <Link to={`/edit/${p.id}`} className="btn btn-ghost btn-sm">Muokkaa</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
