import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyAgentKey } from '@/lib/agent-auth'
import { verificarConflito } from '@/lib/agendamento-helpers'

export async function POST(request: NextRequest) {
  if (!verifyAgentKey(request)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const {
    tutor_id, pet_id, tipo_exame, data_hora,
    duracao_minutos, valor, forma_pagamento,
    google_calendar_id, observacoes,
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
      status:             'agendado',
      system_user_id:     process.env.AGENT_USER_ID ? Number(process.env.AGENT_USER_ID) : null,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ agendamento_id: data.id }, { status: 201 })
}
