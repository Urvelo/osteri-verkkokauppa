import { useState, useEffect } from 'react'
import { supabase } from '../supabase.js'

const fieldStyle = {
  width: '100%',
  padding: '9px 12px',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  fontSize: '0.95rem',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s, box-shadow 0.15s',
  background: '#f3f4f6',
}

const labelStyle = {
  display: 'block',
  fontWeight: '600',
  marginBottom: '5px',
  fontSize: '0.9rem',
  color: '#374151',
}

const helpStyle = {
  display: 'block',
  marginTop: '4px',
  fontSize: '0.8rem',
  color: '#6b7280',
}

const sectionStyle = {
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: '10px',
  padding: '24px',
  marginBottom: '20px',
}

const sectionHeadStyle = {
  marginTop: 0,
  marginBottom: '20px',
  fontSize: '1.05rem',
  fontWeight: '700',
  color: '#111827',
  borderBottom: '1px solid #f3f4f6',
  paddingBottom: '12px',
}

const rowStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
}

const narrowInput = { ...fieldStyle, maxWidth: '180px' }

export default function Settings() {
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState('success')

  useEffect(() => { fetchSettings() }, [])

  async function fetchSettings() {
    setLoading(true)
    const { data } = await supabase.from('store_settings').select('*').eq('id', 'default').single()
    setSettings(data || {
      id: 'default',
      shipping_fee: 0,
      free_shipping_threshold: 0,
      campaign_banner: '',
      campaign_active: false,
      global_discount_percentage: 0,
      global_discount_text: '',
    })
    setLoading(false)
  }

  function set(key, val) {
    setSettings(prev => ({ ...prev, [key]: val }))
  }

  async function handleSave() {
    try {
      setSaving(true)
      setToast('Tallennetaan...')
      setToastType('info')
      const { error } = await supabase.from('store_settings').upsert(settings)
      if (error) throw error
      setToast('✓ Asetukset tallennettu!')
      setToastType('success')
      setTimeout(() => setToast(''), 3500)
    } catch (err) {
      setToast('Virhe: ' + err.message)
      setToastType('error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{ padding: 40, color: '#6b7280' }}>Ladataan asetuksia...</div>

  const toastColors = {
    success: { background: '#d1fae5', color: '#065f46', border: '1px solid #6ee7b7' },
    error:   { background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' },
    info:    { background: '#eff6ff', color: '#1e40af', border: '1px solid #93c5fd' },
  }

  return (
    <div style={{ maxWidth: 700 }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>Verkkokaupan Asetukset</h1>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving}
          style={{ minWidth: 160 }}
        >
          {saving ? 'Tallennetaan...' : 'Tallenna muutokset'}
        </button>
      </div>

      {toast && (
        <div style={{
          ...toastColors[toastType],
          padding: '10px 16px',
          marginBottom: 20,
          borderRadius: 6,
          fontWeight: 600,
          fontSize: '0.9rem',
        }}>
          {toast}
        </div>
      )}

      {/* Shipping section */}
      <div style={sectionStyle}>
        <h2 style={sectionHeadStyle}>🚚 Toimitus ja hinnat</h2>
        <div style={rowStyle}>
          <div>
            <label style={labelStyle} htmlFor="shipping_fee">Yleinen toimituskulu (€)</label>
            <input
              id="shipping_fee"
              type="number"
              min="0"
              step="0.01"
              style={narrowInput}
              value={settings.shipping_fee ?? 0}
              onChange={e => set('shipping_fee', parseFloat(e.target.value) || 0)}
            />
            <small style={helpStyle}>Lisätään automaattisesti kassalla jokaiseen tilaukseen.</small>
          </div>
          <div>
            <label style={labelStyle} htmlFor="free_shipping">Ilmaisen toimituksen raja (€)</label>
            <input
              id="free_shipping"
              type="number"
              min="0"
              step="0.01"
              style={narrowInput}
              value={settings.free_shipping_threshold ?? 0}
              onChange={e => set('free_shipping_threshold', parseFloat(e.target.value) || 0)}
            />
            <small style={helpStyle}>Jos ostoskorin summa ylittää tämän, toimitus on ilmainen. Laita 0 poistaaksesi rajan.</small>
          </div>
        </div>
      </div>

      {/* Campaign banner section */}
      <div style={sectionStyle}>
        <h2 style={sectionHeadStyle}>📢 Kampanjabanneri</h2>
        <div style={rowStyle}>
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.campaign_active || false}
                onChange={e => set('campaign_active', e.target.checked)}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              <span style={{ fontWeight: '600', fontSize: '0.9rem', color: '#374151' }}>
                Näytä kampanjabanneri sivuston yläreunassa
              </span>
            </label>
          </div>
          <div>
            <label style={labelStyle} htmlFor="campaign_banner">Bannerin teksti</label>
            <textarea
              id="campaign_banner"
              rows={4}
              style={{ ...fieldStyle, resize: 'vertical', fontFamily: 'inherit' }}
              value={settings.campaign_banner || ''}
              onChange={e => set('campaign_banner', e.target.value)}
              placeholder={'Esim:\nKevätkampanja! Kaikki tuotteet -{discount}% alennuksessa!\nIlmainen toimitus yli 50€ tilauksiin|6000'}
            />
            <small style={helpStyle}>
              Yksi rivi = yksi viesti. Erottele viestit rivinvaihdolla. Lisää <code>|4000</code> rivin perään muuttaaksesi näyttöaikaa millisekunteina (oletus 4000 ms). Käytä <code>{'{ discount }'}</code> näyttääksesi alennusprosentin.
            </small>
          </div>
        </div>
      </div>

      {/* Global discount section */}
      <div style={sectionStyle}>
        <h2 style={sectionHeadStyle}>🏷️ Globaali automaattialennus</h2>
        <div style={rowStyle}>
          <div>
            <label style={labelStyle} htmlFor="global_disc_pct">Koko kaupan alennus (%)</label>
            <input
              id="global_disc_pct"
              type="number"
              min="0"
              max="100"
              step="1"
              style={narrowInput}
              value={settings.global_discount_percentage ?? 0}
              onChange={e => set('global_discount_percentage', parseFloat(e.target.value) || 0)}
            />
            <small style={helpStyle}>Kaikista tuotteista vähennetään automaattisesti tämä prosentti. Laita 0 poistaaksesi.</small>
          </div>
          <div>
            <label style={labelStyle} htmlFor="global_disc_text">Automaattinen banneri kun alennus on päällä</label>
            <input
              id="global_disc_text"
              type="text"
              style={fieldStyle}
              value={settings.global_discount_text || ''}
              onChange={e => set('global_discount_text', e.target.value)}
              placeholder="Esim. 🏷️ Kaikki tuotteet -{discount}% alennuksessa!"
            />
            <small style={helpStyle}>
              Jos alennus % on yli 0, tämä teksti näytetään automaattisesti yläreunan bannerissa. Käytä <code>{'{ discount }'}</code> näyttääksesi alennusprosentin. Jätä tyhjäksi jos et halua automaattista banneria.
            </small>
          </div>
        </div>
      </div>
    </div>
  )
}

