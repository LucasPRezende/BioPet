import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

// Retorna { 'YYYY-MM-DD': count } para o range informado
export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  const inicio = request.nextUrl.searchParams.get('inicio')
  const fim    = request.nextUrl.searchParams.get('fim')
  if (!inicio || !fim) return NextResponse.json({})

  let query = supabase
    .from('agendamentos')
    .select('data_hora')
    .gte('data_hora', `${inicio}T00:00:00`)
    .lte('data_hora', `${fim}T23:59:59`)
    .neq('status', 'cancelado')

  if (session.role !== 'admin') {
    query = query.eq('system_user_id', session.userId)
  }

  const { data } = await query
  const counts: Record<string, number> = {}
  for (const row of data ?? []) {
    const d = (row.data_hora as string).split('T')[0]
    counts[d] = (counts[d] ?? 0) + 1
  }

  return NextResponse.json(counts)
}
