import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

async function requireAuth(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return null
  return parseSystemSession(cookie)
}

// Ledger de movimentos — filtro opcional por insumo. Ordenado do mais recente.
export async function GET(request: NextRequest) {
  const session = await requireAuth(request)
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const insumoId = request.nextUrl.searchParams.get('insumo_id')

  let query = supabase
    .from('insumo_movimento')
    .select('*, insumos(nome)')
    .order('criado_em', { ascending: false })
    .limit(200)

  if (insumoId) query = query.eq('insumo_id', parseInt(insumoId))

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
