import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!

// Usa o service role key server-side. O publishable key (sb_publishable_*) novo formato
// do Supabase tem comportamento diferente do JWT anon key quando usado server-side.
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!

// Passa cache: 'no-store' para todos os fetches internos do Supabase client,
// evitando que o Next.js 14 App Router cache as respostas da API do Supabase.
export const supabase = createClient(supabaseUrl, supabaseKey, {
  global: {
    fetch: (url, init) => fetch(url, { ...init, cache: 'no-store' }),
  },
})
