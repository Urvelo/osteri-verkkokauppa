import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase URL tai anon key puuttuu! Luo admin/.env tiedosto.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export const MARKUP = 2.4
