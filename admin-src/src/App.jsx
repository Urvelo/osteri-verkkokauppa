import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './supabase'
import { ToastProvider } from './components/Toast'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Products from './pages/Products'
import ImportProduct from './pages/ImportProduct'
import EditProduct from './pages/EditProduct'
import Settings from './pages/Settings'
import Discounts from './pages/Discounts'

export default function App() {
  const [session, setSession] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) checkAdmin()
      else setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) checkAdmin()
      else {
        setIsAdmin(false)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function checkAdmin() {
    try {
      const { data, error } = await supabase.rpc('is_admin')
      setIsAdmin(data === true)
    } catch {
      setIsAdmin(false)
    }
    setLoading(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    setSession(null)
    setIsAdmin(false)
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Ladataan...</p>
      </div>
    )
  }

  if (!session || !isAdmin) {
    return <Login session={session} isAdmin={isAdmin} />
  }

  return (
    <ToastProvider>
      <Layout user={session.user} onLogout={handleLogout}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/products" element={<Products />} />
          <Route path="/import" element={<ImportProduct />} />
          <Route path="/edit/:id" element={<EditProduct />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/discounts" element={<Discounts />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </ToastProvider>
  )
}
