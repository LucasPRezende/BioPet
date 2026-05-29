import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const session = await parseSystemSession(cookie)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  const { data, error } = await supabase
    .from('agendamentos')
    .select('*, tutores(id, nome, telefone), pets(id, nome, especie, raca), laudos(id, token, tipo_exame), agendamento_exames(tipo_exame, descricao)')
    .eq('id', Number(params.id))
    .single()

  if (error || !data) return NextResponse.json({ error: 'Não encontrado.' }, { status: 404 })

  return NextResponse.json(data)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const session = await parseSystemSession(cookie)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const {
    status, observacoes, valor, forma_pagamento,
    data_hora, entrega_pagamento, pagamento_responsavel,
    sedacao_necessaria, pet_internado, veterinario_id,
    status_pagamento, agendamento_exames_update,
    exames_remover, exames_adicionar, laudo_dispensado,
  } = body ?? {}

  const STATUSES = ['pendente', 'agendado', 'em atendimento', 'concluído', 'cancelado']

  const update: Record<string, unknown> = {}
  if (status !== undefined) {
    if (!STATUSES.includes(status)) return NextResponse.json({ error: 'Status inválido.' }, { status: 400 })
    update.status = status
  }
  if (observacoes          !== undefined) update.observacoes          = observacoes
  if (valor                !== undefined) update.valor                = valor
  if (forma_pagamento      !== undefined) update.forma_pagamento      = forma_pagamento
  if (data_hora            !== undefined) update.data_hora            = data_hora
  if (entrega_pagamento    !== undefined) update.entrega_pagamento    = entrega_pagamento
  if (pagamento_responsavel !== undefined) update.pagamento_responsavel = pagamento_responsavel
  if (sedacao_necessaria   !== undefined) update.sedacao_necessaria   = sedacao_necessaria
  if (pet_internado        !== undefined) update.pet_internado        = pet_internado
  if (veterinario_id       !== undefined) update.veterinario_id       = veterinario_id === '' ? null : Number(veterinario_id)
  if (status_pagamento     !== undefined) update.status_pagamento     = status_pagamento
  if (laudo_dispensado     !== undefined) update.laudo_dispensado     = laudo_dispensado

  const hasExameChanges =
    (Array.isArray(exames_remover)  && exames_remover.length  > 0) ||
    (Array.isArray(exames_adicionar) && exames_adicionar.length > 0)

  if (Object.keys(update).length === 0 && !agendamento_exames_update && !hasExameChanges) {
    return NextResponse.json({ error: 'Nenhum campo para atualizar.' }, { status: 400 })
  }

  if (Object.keys(update).length > 0) {
    const { data, error } = await supabase
      .from('agendamentos')
      .update(update)
      .eq('id', Number(params.id))
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (Array.isArray(agendamento_exames_update) && agendamento_exames_update.length > 0) {
    for (const ex of agendamento_exames_update as { tipo_exame: string; valor: number | null }[]) {
      await supabase
        .from('agendamento_exames')
        .update({ valor: ex.valor })
        .eq('agendamento_id', Number(params.id))
        .eq('tipo_exame', ex.tipo_exame)
    }
  }

  if (Array.isArray(exames_remover) && exames_remover.length > 0) {
    await supabase
      .from('agendamento_exames')
      .delete()
      .eq('agendamento_id', Number(params.id))
      .in('tipo_exame', exames_remover as string[])
  }

  if (Array.isArray(exames_adicionar) && exames_adicionar.length > 0) {
    const novos = exames_adicionar as { tipo_exame: string; duracao_minutos: number; valor: number | null }[]
    await supabase
      .from('agendamento_exames')
      .insert(novos.map(e => ({
        agendamento_id:   Number(params.id),
        tipo_exame:       e.tipo_exame,
        duracao_minutos:  e.duracao_minutos,
        valor:            e.valor,
        horario_especial: false,
      })))
  }

  if (hasExameChanges) {
    const { data: restantes } = await supabase
      .from('agendamento_exames')
      .select('tipo_exame, duracao_minutos')
      .eq('agendamento_id', Number(params.id))

    const novaDuracao   = (restantes ?? []).reduce((s, e) => s + (e.duracao_minutos ?? 0), 0)
    const novoTipoExame = (restantes ?? []).map(e => e.tipo_exame).join(', ')

    await supabase
      .from('agendamentos')
      .update({ duracao_minutos: novaDuracao, tipo_exame: novoTipoExame })
      .eq('id', Number(params.id))
  }

  return NextResponse.json({ ok: true })
}
