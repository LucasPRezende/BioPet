import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Lazy init: o Next.js 14 importa modules durante o build (collecting page data)
// mas process.env não está disponível nesse momento. O Proxy adia a criação do
// client para o primeiro acesso em runtime (dentro de um route handler).
let _client: SupabaseClient | null = null

function getClient(): SupabaseClient {
  if (!_client) {
    _client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
      {
        global: {
          fetch: (url, init) => fetch(url, { ...init, cache: 'no-store' }),
        },
      },
    )
  }
  return _client
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop: string | symbol) {
    return getClient()[prop as keyof SupabaseClient]
  },
})
