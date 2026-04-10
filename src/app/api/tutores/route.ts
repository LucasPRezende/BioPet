import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  const { data, error } = await supabase
    .from('tutores')
    .select('*, pets(id, nome, especie, raca, sexo), agendamentos(id)')
    .order('criado_em', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}

export async function POST(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  const body = await request.json()
  const telefone = body.telefone?.replace(/\D/g, '')
  const nome = body.nome?.trim() || null

  if (!telefone || telefone.length < 10) {
    return NextResponse.json({ error: 'Telefone inválido.' }, { status: 400 })
  }

  const telNorm = telefone.startsWith('55') ? telefone : `55${telefone}`

  const { data, error } = await supabase
    .from('tutores')
    .insert({ telefone: telNorm, nome })
    .select('*, pets(id, nome, especie, raca, sexo), agendamentos(id)')
    .single()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Telefone já cadastrado.' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
