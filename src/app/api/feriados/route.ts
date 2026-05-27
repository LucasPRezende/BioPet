import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

export async function GET(request: NextRequest) {
  const todos = request.nextUrl.searchParams.get('todos') === '1'
  const today = new Date().toLocaleDateString('en-CA')

  let query = supabase.from('feriados').select('id, data, nome, tipo').order('data')
  if (!todos) query = query.gte('data', today)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const { data, nome, tipo } = body ?? {}
  if (!data || !nome) return NextResponse.json({ error: 'data e nome obrigatórios.' }, { status: 400 })

  const { error } = await supabase.from('feriados').insert({ data, nome, tipo: tipo ?? 'nacional' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
