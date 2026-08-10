import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { transicaoValida, DURACAO_COLETA_PADRAO_MIN } from '@/lib/lab-pedidos'

async function requireAuth(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return null
  return parseSystemSession(cookie)
}

// Cria o compromisso de coleta na agenda interna existente (decisão travada:
// não é um calendário paralelo) e vincula ao pedido. Não insere em
// agendamento_exames — a coleta labs não é um exame do catálogo interno; o
// vínculo financeiro fica inteiramente em pedido_lab/pedido_lab_item.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(request)
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { id } = await params
  const pedidoId = parseInt(id)
  if (isNaN(pedidoId)) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })

  const body = await request.json().catch(() => null)
  const dataHora = body?.data_hora
  if (!dataHora) return NextResponse.json({ error: 'Informe data_hora.' }, { status: 400 })

  const { data: pedido, error: errPedido } = await supabase
    .from('pedido_lab')
    .select('*, pedido_lab_item(nome)')
    .eq('id', pedidoId)
    .single()
  if (errPedido || !pedido) return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 })

  if (!transicaoValida(pedido.status, 'coleta_agendada')) {
    return NextResponse.json({ error: `Pedido em status "${pedido.status}" não pode ir para coleta agendada.` }, { status: 400 })
  }

  const duracao      = Number(body.duracao_minutos) > 0 ? Number(body.duracao_minutos) : DURACAO_COLETA_PADRAO_MIN
  const nomesExames  = (pedido.pedido_lab_item as { nome: string }[]).map(i => i.nome).join(', ')

  const { data: agendamento, error: errAg } = await supabase
    .from('agendamentos')
    .insert({
      tutor_id:         pedido.tutor_id,
      pet_id:           pedido.pet_id,
      system_user_id:   session.userId,
      tipo_exame:       `Coleta Labs Parceiros: ${nomesExames}`,
      data_hora:        dataHora,
      duracao_minutos:  duracao,
      valor:            pedido.valor_total,
      forma_pagamento:  'a confirmar',
      status:           'agendado',
      status_pagamento: pedido.status_pagamento,
      origem:           'manual',
      clinica_id:       pedido.clinica_id,
      observacoes:      pedido.observacoes,
    })
    .select('id')
    .single()

  if (errAg) return NextResponse.json({ error: errAg.message }, { status: 500 })

  const { data: atualizado, error: errUpd } = await supabase
    .from('pedido_lab')
    .update({ agendamento_id: agendamento.id, status: 'coleta_agendada' })
    .eq('id', pedidoId)
    .select('*')
    .single()

  if (errUpd) return NextResponse.json({ error: errUpd.message }, { status: 500 })
  return NextResponse.json(atualizado)
}
