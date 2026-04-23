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

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const session = await getClinicaSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  const status = request.nextUrl.searchParams.get('status')

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

// ── POST ──────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const session = await getClinicaSession()
  if (!session) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const {
    telefone, tutor_nome,
    pet_id, pet_nome, pet_especie, pet_raca,
    exames,                     // [{ tipo_exame, duracao_minutos, valor, horario_especial }]
    tipo_exame,                 // fallback single-exam
    data_hora, duracao_minutos,
    veterinario_id, observacoes,
    sedacao_necessaria, pet_internado,
    pagamento_responsavel, forma_pagamento, entrega_pagamento,
    valor,
    bioquimica_selecionados,    // [{ bioquimica_exame_id, valor_pix, valor_cartao }]
  } = body ?? {}

  // Suporte a multi-exame (exames[]) e single (tipo_exame)
  const examesArr: { tipo_exame: string; duracao_minutos: number; valor: number; horario_especial: boolean }[] =
    Array.isArray(exames) && exames.length > 0
      ? exames
      : tipo_exame
      ? [{ tipo_exame, duracao_minutos: duracao_minutos ?? 30, valor: valor ?? 0, horario_especial: false }]
      : []

  if (!telefone || examesArr.length === 0 || !data_hora) {
    return NextResponse.json({ error: 'Campos obrigatórios: telefone, exames, data_hora.' }, { status: 400 })
  }
  if (!pet_id && !pet_nome) {
    return NextResponse.json({ error: 'Informe o pet (pet_id ou pet_nome).' }, { status: 400 })
  }

  // Verifica permissão de cada exame
  for (const ex of examesArr) {
    const { data: permCheck } = await supabase
      .from('clinica_exames_permitidos')
      .select('id')
      .eq('clinica_id', session.clinicaId)
      .eq('tipo_exame', ex.tipo_exame)
      .maybeSingle()
    if (!permCheck) {
      return NextResponse.json({ error: `Exame "${ex.tipo_exame}" não disponível para sua clínica.` }, { status: 403 })
    }
  }

  const { data: clinica } = await supabase
    .from('clinicas')
    .select('nome, telefone')
    .eq('id', session.clinicaId)
    .single()

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

  if (pet_id) {
    const { data: petExist } = await supabase
      .from('pets')
      .select('id, nome')
      .eq('id', pet_id)
      .eq('tutor_id', tutorId)
      .single()
    if (!petExist) return NextResponse.json({ error: 'Pet não encontrado.' }, { status: 404 })
    petIdFinal   = petExist.id
    petNomeFinal = petExist.nome
  } else {
    const { data: novoPet, error: errPet } = await supabase
      .from('pets')
      .insert({ tutor_id: tutorId, nome: pet_nome, especie: pet_especie ?? null, raca: pet_raca ?? null })
      .select('id, nome')
      .single()
    if (errPet) return NextResponse.json({ error: errPet.message }, { status: 500 })
    petIdFinal   = novoPet.id
    petNomeFinal = novoPet.nome
  }

  // 3. Verifica conflito de horário
  const totalDuracao = examesArr.reduce((sum, e) => sum + e.duracao_minutos, 0)
  const diaStr  = (data_hora as string).split('T')[0]
  const novaIni = new Date(data_hora)
  const novaFim = new Date(novaIni.getTime() + totalDuracao * 60_000)

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

  // 4. Cria agendamento
  const tipoExameLabel = examesArr.map(e => e.tipo_exame).join(', ')
  const valorTotal     = examesArr.reduce((sum, e) => sum + (e.valor ?? 0), 0)

  const { data: agendamento, error: errAg } = await supabase
    .from('agendamentos')
    .insert({
      tutor_id:              tutorId,
      pet_id:                petIdFinal,
      tipo_exame:            tipoExameLabel,
      data_hora,
      duracao_minutos:       totalDuracao,
      valor:                 valorTotal > 0 ? valorTotal : null,
      forma_pagamento:       forma_pagamento ?? 'a confirmar',
      entrega_pagamento:     entrega_pagamento ?? 'link',
      veterinario_id:        veterinario_id ? Number(veterinario_id) : null,
      observacoes:           observacoes ?? null,
      sedacao_necessaria:    sedacao_necessaria ?? false,
      pet_internado:         pet_internado ?? false,
      pagamento_responsavel: pagamento_responsavel ?? 'tutor',
      status:                'pendente',
      origem:                'clinica',
      clinica_id:            session.clinicaId,
      status_pagamento:      'pendente',
    })
    .select('id')
    .single()

  if (errAg) return NextResponse.json({ error: errAg.message }, { status: 500 })

  // 5. Insere exames na tabela agendamento_exames
  if (examesArr.length > 0) {
    await supabase.from('agendamento_exames').insert(
      examesArr.map(e => ({
        agendamento_id:   agendamento.id,
        tipo_exame:       e.tipo_exame,
        duracao_minutos:  e.duracao_minutos,
        valor:            e.valor,
        horario_especial: e.horario_especial ?? false,
      }))
    )
  }

  // 5b. Insere sub-exames de bioquímica (se houver)
  const bioArr = Array.isArray(bioquimica_selecionados) ? bioquimica_selecionados : []
  if (bioArr.length > 0) {
    await supabase.from('agendamento_bioquimica').insert(
      bioArr.map((b: { bioquimica_exame_id: number; valor_pix: number; valor_cartao: number }) => ({
        agendamento_id:      agendamento.id,
        bioquimica_exame_id: b.bioquimica_exame_id,
        valor_pix:           b.valor_pix,
        valor_cartao:        b.valor_cartao,
      }))
    )
  }

  // 6. Nome do vet
  let vetNome = 'Não informado'
  if (veterinario_id) {
    const { data: vet } = await supabase.from('veterinarios').select('nome').eq('id', veterinario_id).single()
    if (vet) vetNome = vet.nome
  }

  // 7. Notificação
  const mensagem = [
    `📋 Nova solicitação de agendamento`,
    `Clínica: ${clinica?.nome ?? 'Clínica parceira'}`,
    `Pet: ${petNomeFinal}`,
    `Resp. Legal: ${tutor_nome ?? tutorExist?.nome ?? 'Desconhecido'} — ${telNorm}`,
    `Exame(s): ${tipoExameLabel}`,
    `Data/Hora: ${formatDataHora(data_hora)}`,
    `Vet responsável: ${vetNome}`,
    sedacao_necessaria ? '⚠️ Sedação necessária' : null,
    pet_internado      ? '🏥 Pet internado na clínica' : null,
    `Pag. responsável: ${pagamento_responsavel === 'clinica' ? 'Clínica' : 'Tutor (link MP)'}`,
    `Acesse o painel para confirmar.`,
  ].filter(Boolean).join('\n')

  await supabase.from('notificacoes').insert({
    telefone:       telNorm,
    nome_tutor:     tutor_nome ?? tutorExist?.nome ?? null,
    motivo:         'agendamento_clinica',
    tipo_evento:    'agendamento_clinica',
    agendamento_id: agendamento.id,
  })

  const admins = [process.env.ADMIN_WHATSAPP_1, process.env.ADMIN_WHATSAPP_2].filter(Boolean) as string[]
  await Promise.all(admins.map(num => sendWhatsAppText(num, mensagem)))

  return NextResponse.json({ sucesso: true, agendamento_id: agendamento.id }, { status: 201 })
}
