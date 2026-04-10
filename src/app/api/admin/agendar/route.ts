import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

export async function POST(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const {
    telefone, tutor_nome,
    pet_nome, pet_especie, pet_raca,
    tipo_exame, data_hora,
    duracao_minutos, valor, forma_pagamento, veterinario_id, observacoes,
  } = body ?? {}

  if (!telefone || !pet_nome || !tipo_exame || !data_hora) {
    return NextResponse.json(
      { error: 'Campos obrigatórios: telefone, pet_nome, tipo_exame, data_hora.' },
      { status: 400 },
    )
  }

  // Normaliza telefone: remove não-dígitos, adiciona 55 se necessário
  const digits   = String(telefone).replace(/\D/g, '')
  const telNorm  = digits.startsWith('55') ? digits : `55${digits}`

  // 1. Busca ou cria tutor
  let tutorId: number
  const { data: tutorExist } = await supabase
    .from('tutores')
    .select('id')
    .eq('telefone', telNorm)
    .maybeSingle()

  if (tutorExist) {
    tutorId = tutorExist.id
    // Atualiza nome se informado e ainda não tinha
    if (tutor_nome) {
      await supabase.from('tutores').update({ nome: tutor_nome }).eq('id', tutorId)
    }
  } else {
    const { data: novoTutor, error: errTutor } = await supabase
      .from('tutores')
      .insert({ telefone: telNorm, nome: tutor_nome ?? null })
      .select('id')
      .single()
    if (errTutor) return NextResponse.json({ error: errTutor.message }, { status: 500 })
    tutorId = novoTutor.id
  }

  // 2. Busca pet pelo nome + tutor, ou cria
  let petId: number | null = null
  const { data: petExist } = await supabase
    .from('pets')
    .select('id')
    .eq('tutor_id', tutorId)
    .ilike('nome', pet_nome)
    .maybeSingle()

  if (petExist) {
    petId = petExist.id
  } else {
    const { data: novoPet, error: errPet } = await supabase
      .from('pets')
      .insert({ tutor_id: tutorId, nome: pet_nome, especie: pet_especie ?? null, raca: pet_raca ?? null })
      .select('id')
      .single()
    if (errPet) return NextResponse.json({ error: errPet.message }, { status: 500 })
    petId = novoPet.id
  }

  // 3. Verifica conflito de horário
  const diaStr = (data_hora as string).split('T')[0]
  const novaInicio = new Date(data_hora)
  const novaFim    = new Date(novaInicio.getTime() + (duracao_minutos ?? 30) * 60_000)

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
      { error: 'Já existe um agendamento neste horário.' },
      { status: 409 },
    )
  }

  // 4. Cria agendamento
  const { data, error } = await supabase
    .from('agendamentos')
    .insert({
      tutor_id:          tutorId,
      pet_id:            petId,
      system_user_id:    session.userId,
      tipo_exame,
      data_hora,
      duracao_minutos:   duracao_minutos ?? null,
      valor:             valor ?? null,
      forma_pagamento:   forma_pagamento ?? 'a confirmar',
      veterinario_id:    veterinario_id ? Number(veterinario_id) : null,
      observacoes:       observacoes ?? null,
      status:            'agendado',
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ agendamento_id: data.id }, { status: 201 })
}
