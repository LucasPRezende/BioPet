import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyAgentKey } from '@/lib/agent-auth'

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
  const novaInicio = new Date(data_hora)
  const novaFim    = new Date(novaInicio.getTime() + (duracao_minutos ?? 30) * 60_000)
  const diaStr     = (data_hora as string).split('T')[0]

  const { data: existentes } = await supabase
    .from('agendamentos')
    .select('id, data_hora, duracao_minutos')
    .gte('data_hora', `${diaStr}T00:00:00`)
    .lte('data_hora', `${diaStr}T23:59:59`)
    .neq('status', 'cancelado')

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
