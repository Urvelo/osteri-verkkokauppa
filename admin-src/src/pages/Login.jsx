import { useState } from 'react'
import { supabase } from '../supabase'

export default function Login({ session, isAdmin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // If user is logged in but not admin
  if (session && !isAdmin) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>ERÄT.FI</h1>
          <p className="subtitle">Admin</p>
          <div className="error">
            Sinulla ei ole admin-oikeuksia. Ota yhteyttä ylläpitäjään.
          </div>
          <p className="no-access">
            Kirjautunut: {session.user.email}
          </p>
          <div style={{ marginTop: 16 }}>
            <button
              className="btn btn-secondary"
              style={{ width: '100%' }}
              onClick={() => supabase.auth.signOut()}
            >
              Kirjaudu ulos
            </button>
          </div>
        </div>
      </div>
    )
  }

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (authError) {
        setError('Väärä sähköposti tai salasana.')
      }
    } catch (err) {
      setError('Verkkovirhe. Yritä uudelleen.')
    }

    setLoading(false)
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>ERÄT.FI</h1>
        <p className="subtitle">Admin-kirjautuminen</p>

        {error && <div className="error">{error}</div>}

        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label>Sähköposti</label>
            <input
              type="email"
              className="form-input"
              placeholder="admin@erat.fi"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>Salasana</label>
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Kirjaudutaan...' : 'Kirjaudu'}
          </button>
        </form>
      </div>
    </div>
  )
}
