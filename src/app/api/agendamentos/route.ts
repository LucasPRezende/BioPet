import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const session = await parseSystemSession(cookie)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  const data = request.nextUrl.searchParams.get('data')
    ?? new Date().toLocaleDateString('en-CA')

  const start = `${data}T00:00:00`
  const end   = `${data}T23:59:59`

  let query = supabase
    .from('agendamentos')
    .select('*, tutores(id, nome, telefone), pets(id, nome, especie, raca), system_users(nome), laudos(id, token)')
    .gte('data_hora', start)
    .lte('data_hora', end)
    .order('data_hora')

  if (session.role !== 'admin') {
    query = query.eq('system_user_id', session.userId)
  }

  const { data: rows, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(rows ?? [])
}
