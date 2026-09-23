import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

async function requireAdmin(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return null
  const session = await parseSystemSession(cookie)
  if (!session || session.role !== 'admin') return null
  return session
}

// GET — saídas de estoque, mais recentes primeiro. ?consumivel_id= filtra.
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const consumivelId = Number(new URL(request.url).searchParams.get('consumivel_id')) || null
  let query = supabase
    .from('consumivel_movimentos')
    .select('*, consumiveis(nome, unidade), laudos(nome_pet, tutor), system_users(nome), consumivel_compras(data_compra)')
    .order('criado_em', { ascending: false })
    .order('id', { ascending: false })
    .limit(300)
  if (consumivelId) query = query.eq('consumivel_id', consumivelId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST — baixa manual (perda, vencido, teste repetido, uso interno...)
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const { consumivel_id, quantidade, observacao } = body ?? {}

  const qtd = Number(quantidade)
  if (!Number(consumivel_id))             return NextResponse.json({ error: 'Selecione o consumível.' }, { status: 400 })
  if (!Number.isInteger(qtd) || qtd <= 0) return NextResponse.json({ error: 'Quantidade deve ser um número inteiro maior que zero.' }, { status: 400 })
  if (!observacao?.trim())                return NextResponse.json({ error: 'Informe o motivo da baixa.' }, { status: 400 })

  const { data, error } = await supabase.rpc('consumir_estoque', {
    p_consumivel_id: Number(consumivel_id),
    p_quantidade:    qtd,
    p_tipo:          'perda',
    p_laudo_id:      null,
    p_observacao:    observacao.trim(),
    p_user_id:       admin.userId,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ custo: data }, { status: 201 })
}
