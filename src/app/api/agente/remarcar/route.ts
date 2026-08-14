import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyAgentKey } from '@/lib/agent-auth'
import { normalizeTelefone } from '@/lib/telefone'
import { precificarExames, recalcularTotal, reconciliarLinkPagamento, type ExameInput, type EstadoPagamento } from '@/lib/agendamento-helpers'

const DIAS = [
  'domingo', 'segunda-feira', 'terça-feira', 'quarta-feira',
  'quinta-feira', 'sexta-feira', 'sábado',
]

function formatDataHora(isoStr: string): string {
  const [datePart, timePart = '00:00'] = isoStr.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute]     = timePart.split(':').map(Number)
  const d = new Date(year, month - 1, day, hour, minute)
  const dd = String(day).padStart(2, '0')
  const mm = String(month).padStart(2, '0')
  const hh = String(hour).padStart(2, '0')
  const minStr = minute > 0 ? `:${String(minute).padStart(2, '0')}` : ''
  return `${DIAS[d.getDay()]}, ${dd}/${mm} às ${hh}h${minStr}`
}

export async function PATCH(request: NextRequest) {
  if (!verifyAgentKey(request)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const idParam = request.nextUrl.searchParams.get('id')
  const id      = Number(idParam)
  if (!id) {
    return NextResponse.json({ error: 'Parâmetro "id" é obrigatório.' }, { status: 400 })
  }

  const body = await request.json().catch(() => null)
  const { nova_data_hora, nova_forma_pagamento, telefone } = body ?? {}

  if (!nova_data_hora && !nova_forma_pagamento) {
    return NextResponse.json(
      { error: 'Informe "nova_data_hora" e/ou "nova_forma_pagamento".' },
      { status: 400 },
    )
  }
  if (nova_forma_pagamento && !['pix', 'cartao'].includes(nova_forma_pagamento)) {
    return NextResponse.json({ error: '"nova_forma_pagamento" deve ser "pix" ou "cartao".' }, { status: 400 })
  }
  if (!telefone) {
    return NextResponse.json({ error: '"telefone" é obrigatório.' }, { status: 400 })
  }

  // Busca agendamento atual + dados do tutor
  const { data: atual, error: fetchError } = await supabase
    .from('agendamentos')
    .select('id, data_hora, duracao_minutos, status, forma_pagamento, encaixe, valor, entrega_pagamento, pagamento_responsavel, status_pagamento, mp_preference_id, mp_init_point, pix_token, tutores(telefone, nome)')
    .eq('id', id)
    .single()

  if (fetchError || !atual) {
    return NextResponse.json({ error: 'Agendamento não encontrado.' }, { status: 404 })
  }

  // Posse: só remarca agendamento do tutor desta conversa (telefone injetado
  // pelo servidor). Impede remarcar o agendamento de outro cliente por id chutado.
  const tutorDono = Array.isArray(atual.tutores) ? atual.tutores[0] : atual.tutores as { telefone: string; nome: string } | null
  const telConversa = normalizeTelefone(String(telefone).replace(/\D/g, ''))
  const telDono = normalizeTelefone((tutorDono?.telefone ?? '').replace(/\D/g, ''))
  if (!telDono || telDono !== telConversa) {
    return NextResponse.json(
      { error: 'Este agendamento não pertence ao tutor desta conversa.', precisa_atendente: true },
      { status: 403 },
    )
  }

  if (atual.status === 'cancelado') {
    return NextResponse.json({ error: 'Não é possível remarcar um agendamento cancelado.' }, { status: 400 })
  }

  const dataHoraEfetiva: string = nova_data_hora ?? atual.data_hora

  // Verifica conflito de horário só quando a data/hora está de fato mudando
  // (excluindo o próprio agendamento).
  if (nova_data_hora) {
    const novaInicio = new Date(nova_data_hora)
    const novaFim    = new Date(novaInicio.getTime() + (atual.duracao_minutos ?? 30) * 60_000)
    const diaStr     = (nova_data_hora as string).split('T')[0]

    const { data: existentes } = await supabase
      .from('agendamentos')
      .select('id, data_hora, duracao_minutos')
      .gte('data_hora', `${diaStr}T00:00:00`)
      .lte('data_hora', `${diaStr}T23:59:59`)
      .neq('status', 'cancelado')
      .neq('id', id)

    const conflito = (existentes ?? []).find(ag => {
      const agInicio = new Date(ag.data_hora)
      const agFim    = new Date(agInicio.getTime() + (ag.duracao_minutos ?? 30) * 60_000)
      return novaInicio < agFim && novaFim > agInicio
    })

    if (conflito) {
      return NextResponse.json(
        { error: 'Já existe um agendamento neste horário.', conflito_id: conflito.id },
        { status: 409 },
      )
    }
  }

  // Atualiza data_hora e/ou forma_pagamento
  const updateFields: Record<string, string> = {}
  if (nova_data_hora) updateFields.data_hora = nova_data_hora
  if (nova_forma_pagamento) updateFields.forma_pagamento = nova_forma_pagamento

  const { error: updateError } = await supabase
    .from('agendamentos')
    .update(updateFields)
    .eq('id', id)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  // Recalcula o valor: mudar de horário pode cruzar a fronteira comercial/
  // especial (ex.: remarcar de 8h pra 9h muda o preço de R$240 pra R$180),
  // e trocar cartão↔pix muda o preço em si. Sem isso, o valor gravado ficava
  // desatualizado em relação ao que a IA informa ao cliente.
  const { data: exames } = await supabase
    .from('agendamento_exames')
    .select('tipo_exame, duracao_minutos, valor, desconto, descricao')
    .eq('agendamento_id', id)

  let valorTotal: number | null = null
  if (exames && exames.length > 0) {
    const formaPagamento = (nova_forma_pagamento ?? atual.forma_pagamento ?? '').toLowerCase()
    const gratuito = formaPagamento === 'gratuito'
    const forma = formaPagamento === 'cartao' ? 'cartao' : 'pix'

    const precificados = await precificarExames(exames as ExameInput[], {
      forma,
      gratuito,
      bio: [],
      dataHora: dataHoraEfetiva,
      encaixe: atual.encaixe ?? false,
    })

    await Promise.all(
      precificados.map(e =>
        supabase
          .from('agendamento_exames')
          .update({ valor: e.valor, horario_especial: e.horario_especial })
          .eq('agendamento_id', id)
          .eq('tipo_exame', e.tipo_exame),
      ),
    )

    valorTotal = await recalcularTotal(id)
  }

  // Reconcilia o link de pagamento (MP/pix) se forma de pagamento ou valor
  // mudaram — sem isso o link ficava apontando pro preço/forma antigos.
  // Mesma função usada na edição pelo admin (api/agendamentos/[id]).
  const antesPag = atual as unknown as EstadoPagamento
  if (nova_forma_pagamento || valorTotal !== null) {
    const { data: depoisRow } = await supabase
      .from('agendamentos')
      .select('forma_pagamento, entrega_pagamento, pagamento_responsavel, valor, status_pagamento, mp_preference_id, mp_init_point, pix_token')
      .eq('id', id)
      .single()

    const depoisPag = (depoisRow ?? antesPag) as EstadoPagamento
    const mudouPagamento =
      (antesPag.forma_pagamento ?? '') !== (depoisPag.forma_pagamento ?? '') ||
      Math.abs(Number(antesPag.valor ?? 0) - Number(depoisPag.valor ?? 0)) > 0.01

    if (mudouPagamento) await reconciliarLinkPagamento(id, antesPag, depoisPag)
  }

  // Pega dados do tutor do agendamento
  const tutor = Array.isArray(atual.tutores) ? atual.tutores[0] : atual.tutores as { telefone: string; nome: string } | null

  // Salva log de remarcação (sem WhatsApp)
  await supabase.from('notificacoes').insert({
    telefone:       tutor?.telefone ?? 'desconhecido',
    nome_tutor:     tutor?.nome ?? null,
    motivo:         'remarcacao',
    tipo_evento:    'remarcacao',
    agendamento_id: id,
  })

  return NextResponse.json({
    sucesso: true,
    data_formatada: formatDataHora(dataHoraEfetiva),
    ...(valorTotal !== null ? { valor_total: valorTotal } : {}),
  })
}
