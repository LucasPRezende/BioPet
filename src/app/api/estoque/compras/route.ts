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

// GET — compras (lotes), mais recentes primeiro. ?consumivel_id= filtra.
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const consumivelId = Number(new URL(request.url).searchParams.get('consumivel_id')) || null
  let query = supabase
    .from('consumivel_compras')
    .select('*, consumiveis(nome, unidade), system_users(nome)')
    .order('data_compra', { ascending: false })
    .order('id', { ascending: false })
    .limit(300)
  if (consumivelId) query = query.eq('consumivel_id', consumivelId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST — lança uma compra (novo lote). Quita saídas pendentes com o custo dela.
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const { consumivel_id, data_compra, quantidade, valor_total, fornecedor, validade, observacao } = body ?? {}

  const qtd   = Number(quantidade)
  const valor = Number(valor_total)
  if (!Number(consumivel_id))               return NextResponse.json({ error: 'Selecione o consumível.' }, { status: 400 })
  if (!Number.isInteger(qtd) || qtd <= 0)   return NextResponse.json({ error: 'Quantidade deve ser um número inteiro maior que zero.' }, { status: 400 })
  if (!Number.isFinite(valor) || valor < 0) return NextResponse.json({ error: 'Valor total inválido.' }, { status: 400 })

  const { data, error } = await supabase.rpc('registrar_compra_consumivel', {
    p_consumivel_id: Number(consumivel_id),
    p_data_compra:   data_compra || null,
    p_quantidade:    qtd,
    p_valor_total:   Math.round(valor * 100) / 100,
    p_fornecedor:    fornecedor?.trim() || null,
    p_validade:      validade || null,
    p_observacao:    observacao?.trim() || null,
    p_user_id:       admin.userId,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id: data }, { status: 201 })
}
