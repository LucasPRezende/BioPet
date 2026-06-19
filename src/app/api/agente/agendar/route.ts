import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyAgentKey } from '@/lib/agent-auth'
import { verificarConflito } from '@/lib/agendamento-helpers'

const DIAS = [
  'domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado',
]

function formatDataHora(isoStr: string): string {
  const [datePart, timePart = '00:00'] = isoStr.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute]     = timePart.split(':').map(Number)
  const d  = new Date(year, month - 1, day, hour, minute)
  const dd = String(day).padStart(2, '0')
  const mm = String(month).padStart(2, '0')
  const hh = String(hour).padStart(2, '0')
  const mi = String(minute).padStart(2, '0')
  return `${DIAS[d.getDay()]} ${dd}/${mm} às ${hh}:${mi}`
}

/**
 * Registra uma notificação de "Novo agendamento" no submenu /admin/notificacoes
 * (tipo_evento 'agendamento' — já tem ícone/filtro/rótulo na UI). Best-effort:
 * nunca derruba o agendamento se a notificação falhar.
 */
async function registrarNotificacaoAgendamento(
  agendamentoId: number,
  tutorId: number,
  petId: number | null,
  tipoExame: string,
  dataHora: string,
  valor: number | null,
  origemLabel: string,
): Promise<void> {
  try {
    const [{ data: tutor }, petRes] = await Promise.all([
      supabase.from('tutores').select('nome, telefone').eq('id', tutorId).maybeSingle(),
      petId
        ? supabase.from('pets').select('nome').eq('id', petId).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    const petNome = (petRes as { data: { nome: string } | null }).data?.nome
    const resumo = [
      tipoExame,
      petNome ? `pet ${petNome}` : null,
      formatDataHora(dataHora),
      valor != null ? `R$ ${valor}` : null,
      `via ${origemLabel}`,
    ].filter(Boolean).join(' • ')

    await supabase.from('notificacoes').insert({
      telefone:         tutor?.telefone ?? 'desconhecido',
      nome_tutor:       tutor?.nome ?? null,
      motivo:           'agendamento',
      tipo_evento:      'agendamento',
      mensagem_cliente: resumo,
      agendamento_id:   agendamentoId,
    })
  } catch (e) {
    console.error('[agente/agendar] falha ao registrar notificação:', e)
  }
}

export async function POST(request: NextRequest) {
  if (!verifyAgentKey(request)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const {
    tutor_id, pet_id, tipo_exame, data_hora,
    duracao_minutos, valor, forma_pagamento,
    google_calendar_id, observacoes, status, origem,
  } = body ?? {}

  if (!tutor_id || !tipo_exame || !data_hora) {
    return NextResponse.json(
      { error: 'Campos "tutor_id", "tipo_exame" e "data_hora" são obrigatórios.' },
      { status: 400 },
    )
  }

  // Verifica conflito de horário
  const conflito = await verificarConflito(data_hora, duracao_minutos ?? 30)
  if (conflito) {
    return NextResponse.json(
      { error: 'Já existe um agendamento neste horário.', conflito_id: conflito },
      { status: 409 },
    )
  }

  const { data, error } = await supabase
    .from('agendamentos')
    .insert({
      tutor_id:           Number(tutor_id),
      pet_id:             pet_id ? Number(pet_id) : null,
      tipo_exame,
      data_hora,
      duracao_minutos:    duracao_minutos ?? null,
      valor:              valor ?? null,
      forma_pagamento:    forma_pagamento ?? 'a confirmar',
      google_calendar_id: google_calendar_id ?? null,
      observacoes:        observacoes ?? null,
      status:             status ?? 'agendado',
      origem:             origem ?? 'agente',
      system_user_id:     process.env.AGENT_USER_ID ? Number(process.env.AGENT_USER_ID) : null,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notifica o submenu /admin/notificacoes (agendamentos do agente/clínica).
  await registrarNotificacaoAgendamento(
    data.id,
    Number(tutor_id),
    pet_id ? Number(pet_id) : null,
    tipo_exame,
    data_hora,
    valor ?? null,
    origem === 'agente' ? 'assistente (WhatsApp)' : (origem ?? 'sistema'),
  )

  return NextResponse.json({ agendamento_id: data.id }, { status: 201 })
}
