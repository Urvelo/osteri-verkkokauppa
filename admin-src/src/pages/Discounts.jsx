import { useState, useEffect } from 'react'
import { supabase } from '../supabase.js'

export default function Discounts() {
  const [codes, setCodes] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchCodes()
  }, [])

  async function fetchCodes() {
    setLoading(true)
    const { data } = await supabase.from('discount_codes').select('*').order('created_at', { ascending: false })
    setCodes(data || [])
    setLoading(false)
  }

  async function handleAdd() {
    const code = prompt('Anna uusi alennuskoodi (esim. KESÄ20):')
    if (!code) return
    const perc = prompt('Anna alennusprosentti (esim. 20) TAI jätä tyhjäksi, jos käytät euron määräistä alennusta.')
    const amount = !perc ? prompt('Anna euron määräinen alennus (esim. 5):') : null

    const newCode = {
      code: code.toUpperCase(),
      discount_percentage: perc ? parseFloat(perc) : null,
      discount_amount: amount ? parseFloat(amount) : null,
      is_active: true
    }

    const { error } = await supabase.from('discount_codes').insert(newCode)
    if (error) alert(error.message)
    else fetchCodes()
  }

  async function handleDelete(id) {
    if (!confirm('Poistetaanko koodi varmasti?')) return
    await supabase.from('discount_codes').delete().eq('id', id)
    fetchCodes()
  }

  async function toggleActive(codeObj) {
    await supabase.from('discount_codes').update({ is_active: !codeObj.is_active }).eq('id', codeObj.id)
    fetchCodes()
  }

  if (loading) return <div>Ladataan alennuskoodeja...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Alennuskoodit</h1>
        <button className="btn btn-primary" onClick={handleAdd}>+ Uusi alennuskoodi</button>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Koodi</th>
              <th>Alennus</th>
              <th>Aktiivinen?</th>
              <th>Toiminnot</th>
            </tr>
          </thead>
          <tbody>
            {codes.length === 0 ? (
              <tr><td colSpan="4">Ei koodeja.</td></tr>
            ) : (
              codes.map(c => (
                <tr key={c.id}>
                  <td><strong>{c.code}</strong></td>
                  <td>
                    {c.discount_percentage ? c.discount_percentage + '%' : c.discount_amount + '€'}
                  </td>
                  <td>
                    <button 
                      className={c.is_active ? "btn btn-success btn-sm" : "btn btn-secondary btn-sm"}
                      onClick={() => toggleActive(c)}
                    >
                      {c.is_active ? 'Kyllä' : 'Ei'}
                    </button>
                  </td>
                  <td>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(c.id)}>Poista</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
