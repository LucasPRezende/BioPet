import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { montarItensPedido, tipoCobrancaFromOrigem, type OrigemPedido } from '@/lib/lab-pedidos'

async function requireAuth(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return null
  return parseSystemSession(cookie)
}

// Lista pedidos com joins básicos. Filtro por status via querystring.
export async function GET(request: NextRequest) {
  const session = await requireAuth(request)
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const status = request.nextUrl.searchParams.get('status')

  let query = supabase
    .from('pedido_lab')
    .select('*, tutores(nome), pets(nome), clinicas(nome), pedido_lab_item(id, laboratorio_id, nome, preco_snapshot, lab_laboratorios(nome))')
    .order('criado_em', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// Cria pedido com snapshot de preço. Backend recalcula tudo — nunca confia em
// valor vindo do front (ver montarItensPedido).
export async function POST(request: NextRequest) {
  const session = await requireAuth(request)
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  let body: {
    tutor_id?:    number
    pet_id?:      number
    origem?:      OrigemPedido
    clinica_id?:  number | null
    vet_id?:      number | null
    observacoes?: string | null
    itens?:       number[]
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })
  }

  const { tutor_id, pet_id, origem, itens } = body
  if (!tutor_id || !pet_id) return NextResponse.json({ error: 'Informe o responsável legal e o pet.' }, { status: 400 })
  if (origem !== 'vet' && origem !== 'clinica' && origem !== 'admin') {
    return NextResponse.json({ error: 'Origem inválida — use vet, clinica ou admin.' }, { status: 400 })
  }
  if (!Array.isArray(itens) || itens.length === 0) {
    return NextResponse.json({ error: 'Selecione ao menos um exame.' }, { status: 400 })
  }

  const { data: pet } = await supabase
    .from('pets').select('id').eq('id', pet_id).eq('tutor_id', tutor_id).maybeSingle()
  if (!pet) return NextResponse.json({ error: 'Pet não encontrado para esse responsável legal.' }, { status: 404 })

  const tipoCobranca = tipoCobrancaFromOrigem(origem)
  const resultado = await montarItensPedido(itens, tipoCobranca)
  if (resultado.error || !resultado.itens) {
    return NextResponse.json({ error: resultado.error ?? 'Erro ao montar os itens do pedido.' }, { status: 400 })
  }

  const { data: pedido, error: errPedido } = await supabase
    .from('pedido_lab')
    .insert({
      tutor_id,
      pet_id,
      origem,
      tipo_cobranca:     tipoCobranca,
      clinica_id:        origem === 'clinica' ? (body.clinica_id ?? null) : null,
      vet_id:            origem === 'vet'     ? (body.vet_id     ?? null) : null,
      status:            'rascunho',
      valor_total:       resultado.valorTotal,
      status_pagamento:  'pendente',
      observacoes:       body.observacoes?.trim() || null,
    })
    .select('id')
    .single()

  if (errPedido) return NextResponse.json({ error: errPedido.message }, { status: 500 })

  const itensPayload = resultado.itens.map(i => ({ ...i, pedido_id: pedido.id }))
  const { error: errItens } = await supabase.from('pedido_lab_item').insert(itensPayload)
  if (errItens) {
    // Sem itens o pedido fica órfão — desfaz o cabeçalho.
    await supabase.from('pedido_lab').delete().eq('id', pedido.id)
    return NextResponse.json({ error: errItens.message }, { status: 500 })
  }

  return NextResponse.json({ id: pedido.id }, { status: 201 })
}
