import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyAgentKey } from '@/lib/agent-auth'
import { gerarFeriadosPorAno, isHorarioEspecial } from '@/lib/feriados'
import { calcularElegibilidadeRevisao } from '@/lib/revisao-elegibilidade'
import { normalizeTelefone } from '@/lib/telefone'

/** Separa uma data_hora "YYYY-MM-DDTHH:MM:00" em data ("YYYY-MM-DD") e hora ("HH:MM"). */
function splitDataHora(dataHora: string): { data: string; hora: string } {
  const [data, horaCompleta = '00:00'] = dataHora.split('T')
  return { data, hora: horaCompleta.slice(0, 5) }
}

/**
 * Cria uma REVISÃO (reavaliação de um exame já feito, pedida pelo veterinário)
 * vinculada ao agendamento original — espelha `/api/revisoes` (painel admin),
 * mas autenticado por AGENT_API_KEY em vez de sessão de login. Gratuita por
 * padrão; só cobra se o tipo de exame gera laudo obrigatório ou o cliente
 * pedir um laudo extra (`laudo_solicitado`).
 */
export async function POST(request: NextRequest) {
  if (!verifyAgentKey(request)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const {
    agendamento_original_id, data_hora, laudo_solicitado,
    forma_pagamento, veterinario_id, observacoes, telefone,
  } = body ?? {}
  const laudoSolicitado = !!laudo_solicitado

  if (!agendamento_original_id || !data_hora || !telefone) {
    return NextResponse.json(
      { error: 'agendamento_original_id, data_hora e telefone são obrigatórios.' },
      { status: 400 },
    )
  }

  const { data: original, error: errOrig } = await supabase
    .from('agendamentos')
    .select('id, tipo_exame, data_hora, tutor_id, pet_id, veterinario_id, duracao_minutos, tutores(nome, telefone)')
    .eq('id', agendamento_original_id)
    .eq('is_revisao', false)
    .maybeSingle()

  if (errOrig || !original) {
    return NextResponse.json({ error: 'Agendamento original não encontrado.' }, { status: 404 })
  }

  // Posse: o agendamento original tem que ser do tutor desta conversa. O
  // telefone vem injetado pelo servidor (nunca do modelo), então isso impede
  // criar revisão em cima do exame de outro cliente.
  const tutorOriginal = Array.isArray(original.tutores)
    ? (original.tutores as { nome: string | null; telefone: string }[])[0]
    : (original.tutores as { nome: string | null; telefone: string } | null)
  const telConversa = normalizeTelefone(String(telefone).replace(/\D/g, ''))
  const telDono = normalizeTelefone((tutorOriginal?.telefone ?? '').replace(/\D/g, ''))
  if (!telDono || telDono !== telConversa) {
    return NextResponse.json(
      { error: 'Este agendamento não pertence ao tutor desta conversa.', precisa_atendente: true },
      { status: 403 },
    )
  }

  const tiposNoAgendamento = original.tipo_exame.split(',').map((t: string) => t.trim())
  const { data: configs } = await supabase
    .from('revisao_config')
    .select('*')
    .in('tipo_exame', tiposNoAgendamento)
    .eq('permite_revisao', true)
  const config = tiposNoAgendamento
    .map((t: string) => (configs ?? []).find(c => c.tipo_exame === t))
    .find(Boolean) ?? null

  if (!config) {
    return NextResponse.json(
      { error: `O exame "${original.tipo_exame}" não permite revisão.`, precisa_atendente: true },
      { status: 422 },
    )
  }

  const { count: revisoesAtivas } = await supabase
    .from('agendamentos')
    .select('id', { count: 'exact', head: true })
    .eq('agendamento_original_id', agendamento_original_id)
    .eq('is_revisao', true)
    .in('status', ['agendado', 'em atendimento', 'concluído'])

  const eleg = calcularElegibilidadeRevisao(original.data_hora, config, revisoesAtivas ?? 0)
  if (!eleg.prazo_ok) {
    return NextResponse.json({
      error: `Prazo de revisão expirado em ${eleg.prazo_limite.toLocaleDateString('pt-BR')}.`,
      precisa_atendente: true,
    }, { status: 422 })
  }
  if (!eleg.limite_ok) {
    return NextResponse.json({
      error: `Limite de revisões já atingido para este agendamento (máx. ${config.max_revisoes}).`,
      precisa_atendente: true,
    }, { status: 422 })
  }

  // A revisão precisa ACONTECER dentro do prazo, não só ser pedida dentro dele.
  // Dia do prazo-limite conta por inteiro (até 23:59).
  const fimPrazo = new Date(eleg.prazo_limite)
  fimPrazo.setHours(23, 59, 59, 999)
  if (new Date(data_hora) > fimPrazo) {
    return NextResponse.json({
      error: `A revisão precisa ser realizada até ${eleg.prazo_limite.toLocaleDateString('pt-BR')} (${config.prazo_dias} dias após o exame original). Escolha uma data até lá.`,
    }, { status: 422 })
  }

  const [{ data: feriadosRows }, { data: horarioRows }] = await Promise.all([
    supabase.from('feriados').select('data'),
    supabase.from('system_config').select('key, value').in('key', ['horario_especial_inicio', 'horario_especial_fim']),
  ])
  const dbFeriados = (feriadosRows ?? []).map((f: { data: string }) => f.data)
  const y = new Date().getFullYear()
  const gerados = [y - 1, y, y + 1, y + 2].flatMap(gerarFeriadosPorAno).map(f => f.data)
  const feriados = Array.from(new Set([...dbFeriados, ...gerados]))
  const horarioMap = Object.fromEntries((horarioRows ?? []).map(r => [r.key, r.value]))
  const horarioInicio = horarioMap['horario_especial_inicio'] ?? '08:00'
  const horarioFim = horarioMap['horario_especial_fim'] ?? '17:00'
  const duracao = original.duracao_minutos ?? 30

  const original_ = splitDataHora(original.data_hora)
  const revisao_ = splitDataHora(data_hora)
  const originalEspecial = isHorarioEspecial(original_.hora, duracao, original_.data, feriados, horarioFim, horarioInicio)
  const revisaoEspecial = isHorarioEspecial(revisao_.hora, duracao, revisao_.data, feriados, horarioFim, horarioInicio)

  if (!originalEspecial && revisaoEspecial) {
    return NextResponse.json({
      error: `Revisões de exames feitos em horário comercial só podem ser agendadas em horário comercial (${horarioInicio}–${horarioFim}, seg–sex).`,
      precisa_atendente: true,
    }, { status: 422 })
  }

  let valorTotal = 0
  if (config.gera_laudo) {
    valorTotal = revisaoEspecial ? Number(config.valor_fora_comercial) : Number(config.valor_horario_comercial)
  } else if (laudoSolicitado) {
    valorTotal = Number(config.valor_laudo_extra)
  }

  const { data: revisao, error: errRev } = await supabase
    .from('agendamentos')
    .insert({
      tutor_id: original.tutor_id,
      pet_id: original.pet_id,
      tipo_exame: original.tipo_exame,
      data_hora,
      duracao_minutos: duracao,
      valor: valorTotal > 0 ? valorTotal : null,
      forma_pagamento: valorTotal > 0 ? (forma_pagamento || 'a confirmar') : 'gratuito',
      status: 'pendente',
      status_pagamento: valorTotal > 0 ? 'pendente' : 'gratuito',
      system_user_id: process.env.AGENT_USER_ID ? Number(process.env.AGENT_USER_ID) : null,
      veterinario_id: veterinario_id ? Number(veterinario_id) : (original.veterinario_id ?? null),
      observacoes: observacoes ?? null,
      is_revisao: true,
      agendamento_original_id,
      laudo_revisao_solicitado: config.gera_laudo || laudoSolicitado,
      origem: 'agente',
    })
    .select('id')
    .single()

  if (errRev) return NextResponse.json({ error: errRev.message }, { status: 500 })

  try {
    await supabase.from('notificacoes').insert({
      telefone: telDono,
      nome_tutor: tutorOriginal?.nome ?? null,
      motivo: 'agendamento',
      tipo_evento: 'agendamento',
      mensagem_cliente: `Revisão de ${original.tipo_exame}${valorTotal === 0 ? ' (gratuita)' : ''} • via assistente (WhatsApp)`,
      agendamento_id: revisao.id,
    })
  } catch {
    /* notificação é best-effort — não derruba a revisão criada */
  }

  return NextResponse.json({
    agendamento_id: revisao.id,
    valor_total: valorTotal,
    gratuito: valorTotal === 0,
    laudo_incluido: config.gera_laudo || laudoSolicitado,
  }, { status: 201 })
}
