import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'
import { parseClinicaSession, CLINICA_COOKIE_NAME } from '@/lib/clinica-auth'
import { sendWhatsAppText } from '@/lib/evolution'

const DIAS_PT = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado']

function formatDataHora(isoStr: string): string {
  const [datePart, timePart = '00:00'] = isoStr.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute]     = timePart.split(':').map(Number)
  const d = new Date(year, month - 1, day, hour, minute)
  const dd = String(day).padStart(2, '0')
  const mm = String(month).padStart(2, '0')
  const hh = String(hour).padStart(2, '0')
  const minStr = minute > 0 ? `:${String(minute).padStart(2, '0')}` : ''
  return `${DIAS_PT[d.getDay()]}, ${dd}/${mm} às ${hh}h${minStr}`
}

async function getClinicaSession() {
  const token = (await cookies()).get(CLINICA_COOKIE_NAME)?.value
  if (!token) return null
  return parseClinicaSession(token)
}

// ── GET — lista agendamentos da clínica ───────────────────────────────────────
export async function GET(request: NextRequest) {
  const session = await getClinicaSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  const params = request.nextUrl.searchParams
  const status = params.get('status')

  let query = supabase
    .from('agendamentos')
    .select('id, tipo_exame, data_hora, status, observacoes, criado_em, tutores(id, nome, telefone), pets(id, nome, especie, raca), veterinarios(id, nome)')
    .eq('clinica_id', session.clinicaId)
    .order('data_hora', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ agendamentos: data ?? [] })
}

// ── POST — solicita novo agendamento ─────────────────────────────────────────
export async function POST(request: NextRequest) {
  const session = await getClinicaSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const {
    telefone, tutor_nome,
    pet_id, pet_nome, pet_especie, pet_raca,
    tipo_exame, data_hora, duracao_minutos,
    veterinario_id, observacoes,
  } = body ?? {}

  if (!telefone || !tipo_exame || !data_hora) {
    return NextResponse.json({ error: 'Campos obrigatórios: telefone, tipo_exame, data_hora.' }, { status: 400 })
  }
  if (!pet_id && !pet_nome) {
    return NextResponse.json({ error: 'Informe o pet (pet_id ou pet_nome).' }, { status: 400 })
  }

  // Verifica se o exame é permitido para esta clínica
  const { data: permCheck } = await supabase
    .from('clinica_exames_permitidos')
    .select('id')
    .eq('clinica_id', session.clinicaId)
    .eq('tipo_exame', tipo_exame)
    .maybeSingle()

  if (!permCheck) {
    return NextResponse.json({ error: 'Este exame não está disponível para sua clínica.' }, { status: 403 })
  }

  // Busca dados da clínica (nome + telefone para notificação)
  const { data: clinica } = await supabase
    .from('clinicas')
    .select('nome, telefone')
    .eq('id', session.clinicaId)
    .single()

  // Normaliza telefone do tutor
  const digits  = String(telefone).replace(/\D/g, '')
  const telNorm = digits.startsWith('55') ? digits : `55${digits}`

  // 1. Busca ou cria tutor
  let tutorId: number
  const { data: tutorExist } = await supabase
    .from('tutores')
    .select('id, nome')
    .eq('telefone', telNorm)
    .maybeSingle()

  if (tutorExist) {
    tutorId = tutorExist.id
    if (tutor_nome && !tutorExist.nome) {
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

  // 2. Busca ou cria pet
  let petIdFinal: number
  let petNomeFinal: string
  let petEspecieFinal: string | null = null
  let petRacaFinal: string | null = null

  if (pet_id) {
    const { data: petExist } = await supabase
      .from('pets')
      .select('id, nome, especie, raca')
      .eq('id', pet_id)
      .eq('tutor_id', tutorId)
      .single()
    if (!petExist) return NextResponse.json({ error: 'Pet não encontrado.' }, { status: 404 })
    petIdFinal     = petExist.id
    petNomeFinal   = petExist.nome
    petEspecieFinal = petExist.especie
    petRacaFinal   = petExist.raca
  } else {
    const { data: novoPet, error: errPet } = await supabase
      .from('pets')
      .insert({ tutor_id: tutorId, nome: pet_nome, especie: pet_especie ?? null, raca: pet_raca ?? null })
      .select('id, nome, especie, raca')
      .single()
    if (errPet) return NextResponse.json({ error: errPet.message }, { status: 500 })
    petIdFinal      = novoPet.id
    petNomeFinal    = novoPet.nome
    petEspecieFinal = novoPet.especie
    petRacaFinal    = novoPet.raca
  }

  // 3. Verifica conflito de horário
  const diaStr  = (data_hora as string).split('T')[0]
  const novaIni = new Date(data_hora)
  const novaFim = new Date(novaIni.getTime() + (duracao_minutos ?? 30) * 60_000)

  const { data: existentes } = await supabase
    .from('agendamentos')
    .select('id, data_hora, duracao_minutos')
    .gte('data_hora', `${diaStr}T00:00:00`)
    .lte('data_hora', `${diaStr}T23:59:59`)
    .neq('status', 'cancelado')

  const conflito = (existentes ?? []).find(ag => {
    const agIni = new Date(ag.data_hora)
    const agFim = new Date(agIni.getTime() + (ag.duracao_minutos ?? 30) * 60_000)
    return novaIni < agFim && novaFim > agIni
  })

  if (conflito) {
    return NextResponse.json({ error: 'Já existe um agendamento neste horário.' }, { status: 409 })
  }

  // 4. Cria agendamento (status pendente)
  const { data: agendamento, error: errAg } = await supabase
    .from('agendamentos')
    .insert({
      tutor_id:        tutorId,
      pet_id:          petIdFinal,
      tipo_exame,
      data_hora,
      duracao_minutos: duracao_minutos ?? null,
      forma_pagamento: 'a confirmar',
      veterinario_id:  veterinario_id ? Number(veterinario_id) : null,
      observacoes:     observacoes ?? null,
      status:          'pendente',
      origem:          'clinica',
      clinica_id:      session.clinicaId,
    })
    .select('id')
    .single()

  if (errAg) return NextResponse.json({ error: errAg.message }, { status: 500 })

  // 5. Busca nome do vet
  let vetNome = 'Não informado'
  if (veterinario_id) {
    const { data: vet } = await supabase.from('veterinarios').select('nome').eq('id', veterinario_id).single()
    if (vet) vetNome = vet.nome
  }

  // 6. Monta mensagem para admins
  const petDesc = [petNomeFinal, petEspecieFinal, petRacaFinal].filter(Boolean).join(' / ')
  const mensagem = [
    `📋 Nova solicitação de agendamento`,
    `Clínica: ${clinica?.nome ?? 'Clínica parceira'}`,
    `Pet: ${petDesc}`,
    `Tutor: ${tutor_nome ?? tutorExist?.nome ?? 'Desconhecido'} — ${telNorm}`,
    `Exame: ${tipo_exame}`,
    `Data/Hora: ${formatDataHora(data_hora)}`,
    `Vet responsável: ${vetNome}`,
    `Acesse o painel para confirmar.`,
  ].join('\n')

  // 7. Salva notificação
  await supabase.from('notificacoes').insert({
    telefone:       telNorm,
    nome_tutor:     tutor_nome ?? tutorExist?.nome ?? null,
    motivo:         'agendamento_clinica',
    tipo_evento:    'agendamento_clinica',
    agendamento_id: agendamento.id,
  })

  // 8. Envia WhatsApp para admins
  const admins = [
    process.env.ADMIN_WHATSAPP_1,
    process.env.ADMIN_WHATSAPP_2,
  ].filter(Boolean) as string[]
  await Promise.all(admins.map(num => sendWhatsAppText(num, mensagem)))

  return NextResponse.json({ sucesso: true, agendamento_id: agendamento.id }, { status: 201 })
}
