import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { sendWhatsAppText } from '@/lib/evolution'
import { gerarPreferenciaMp } from '@/lib/mp-preference'

const DIAS_PT = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado']

function formatDataHora(isoStr: string, somenteData = false): string {
  const [datePart, timePart = '00:00'] = isoStr.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute]     = timePart.split(':').map(Number)
  const d = new Date(year, month - 1, day, hour, minute)
  const dd = String(day).padStart(2, '0')
  const mm = String(month).padStart(2, '0')
  if (somenteData) return `${DIAS_PT[d.getDay()]}, ${dd}/${mm}`
  const hh = String(hour).padStart(2, '0')
  const minStr = minute > 0 ? `:${String(minute).padStart(2, '0')}` : ''
  return `${DIAS_PT[d.getDay()]}, ${dd}/${mm} às ${hh}h${minStr}`
}

function horaFimStr(isoStr: string, duracaoMin: number): string {
  const timePart = isoStr.split('T')[1] ?? '00:00'
  const [h, m]   = timePart.split(':').map(Number)
  const fimMin   = h * 60 + m + duracaoMin
  return `${String(Math.floor(fimMin / 60)).padStart(2, '0')}:${String(fimMin % 60).padStart(2, '0')}`
}

export async function POST(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const {
    telefone, tutor_nome,
    pet_id, pet_nome, pet_especie, pet_raca,
    exames,
    tipo_exame,
    data_hora, duracao_minutos,
    valor, forma_pagamento, entrega_pagamento,
    veterinario_id, observacoes,
    sedacao_necessaria, pet_internado,
    pagamento_responsavel,
    bioquimica_selecionados,
    encaixe,
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

  const digits  = String(telefone).replace(/\D/g, '')
  const telNorm = digits.startsWith('55') ? digits : `55${digits}`

  // 1. Busca ou cria tutor
  let tutorId: number
  const { data: tutorExist } = await supabase
    .from('tutores').select('id, nome').eq('telefone', telNorm).maybeSingle()

  if (tutorExist) {
    tutorId = tutorExist.id
    if (tutor_nome && !tutorExist.nome) {
      await supabase.from('tutores').update({ nome: tutor_nome }).eq('id', tutorId)
    }
  } else {
    const { data: novoTutor, error: errTutor } = await supabase
      .from('tutores').insert({ telefone: telNorm, nome: tutor_nome ?? null }).select('id').single()
    if (errTutor) return NextResponse.json({ error: errTutor.message }, { status: 500 })
    tutorId = novoTutor.id
  }

  // 2. Busca ou cria pet
  let petIdFinal: number
  let petNomeFinal: string
  if (pet_id) {
    const { data: petExist } = await supabase
      .from('pets').select('id, nome').eq('id', pet_id).eq('tutor_id', tutorId).single()
    if (!petExist) return NextResponse.json({ error: 'Pet não encontrado.' }, { status: 404 })
    petIdFinal   = petExist.id
    petNomeFinal = petExist.nome
  } else {
    const { data: petExist } = await supabase
      .from('pets').select('id, nome').eq('tutor_id', tutorId).ilike('nome', pet_nome).maybeSingle()
    if (petExist) {
      petIdFinal   = petExist.id
      petNomeFinal = petExist.nome
    } else {
      const { data: novoPet, error: errPet } = await supabase
        .from('pets').insert({ tutor_id: tutorId, nome: pet_nome, especie: pet_especie ?? null, raca: pet_raca ?? null }).select('id, nome').single()
      if (errPet) return NextResponse.json({ error: errPet.message }, { status: 500 })
      petIdFinal   = novoPet.id
      petNomeFinal = novoPet.nome
    }
  }

  // 3. Verifica conflito de horário (apenas se não for encaixe)
  if (!encaixe) {
    const totalDuracao = examesArr.reduce((s, e) => s + e.duracao_minutos, 0)
    const diaStr  = (data_hora as string).split('T')[0]
    const novaIni = new Date(data_hora)
    const novaFim = new Date(novaIni.getTime() + totalDuracao * 60_000)

    const { data: existentes } = await supabase
      .from('agendamentos').select('id, data_hora, duracao_minutos, encaixe')
      .gte('data_hora', `${diaStr}T00:00:00`).lte('data_hora', `${diaStr}T23:59:59`).neq('status', 'cancelado')

    const conflito = (existentes ?? []).find(ag => {
      if (ag.encaixe) return false
      const agIni = new Date(ag.data_hora)
      const agFim = new Date(agIni.getTime() + (ag.duracao_minutos ?? 30) * 60_000)
      return novaIni < agFim && novaFim > agIni
    })

    if (conflito) return NextResponse.json({ error: 'Já existe um agendamento neste horário.' }, { status: 409 })
  }

  // 4. Cria agendamento
  const tipoExameLabel  = examesArr.map(e => e.tipo_exame).join(', ')
  const valorTotal      = examesArr.reduce((s, e) => s + (e.valor ?? 0), 0)
  const totalDuracaoMin = examesArr.reduce((s, e) => s + e.duracao_minutos, 0)

  const pagResp        = pagamento_responsavel ?? 'tutor'
  const entrega        = entrega_pagamento ?? 'link'
  const pagarClinica   = pagResp === 'clinica' || forma_pagamento === 'pix_presencial'
  const pagarPresencial = !pagarClinica && entrega === 'presencial'
  const statusPag      = pagarClinica || pagarPresencial ? 'a_receber' : 'pendente'

  const { data: agendamento, error: errAg } = await supabase
    .from('agendamentos')
    .insert({
      tutor_id:              tutorId,
      pet_id:                petIdFinal,
      system_user_id:        session.userId,
      tipo_exame:            tipoExameLabel,
      data_hora,
      duracao_minutos:       totalDuracaoMin,
      valor:                 valorTotal > 0 ? valorTotal : null,
      forma_pagamento:       forma_pagamento ?? 'a confirmar',
      entrega_pagamento:     entrega,
      veterinario_id:        veterinario_id ? Number(veterinario_id) : null,
      observacoes:           observacoes ?? null,
      sedacao_necessaria:    sedacao_necessaria ?? false,
      pet_internado:         pet_internado ?? false,
      pagamento_responsavel: pagResp,
      status:                'agendado',
      status_pagamento:      statusPag,
      encaixe:               encaixe ?? false,
    })
    .select('id')
    .single()

  if (errAg) return NextResponse.json({ error: errAg.message }, { status: 500 })

  // 5. Insere exames
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

  // 5b. Insere sub-exames de bioquímica
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

  // 6. Notificação WhatsApp para o tutor
  const isEncaixe  = encaixe ?? false
  const dataFmt    = formatDataHora(data_hora, isEncaixe)
  const horaInicio = (data_hora.split('T')[1] ?? '').substring(0, 5)
  const horaFim    = horaFimStr(data_hora, totalDuracaoMin)
  const valorFmt   = valorTotal > 0
    ? valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : null

  const avisos: string[] = []
  if (sedacao_necessaria) avisos.push(`⚠️ *Sedação:* cobrada diretamente pela clínica, não inclusa no valor acima.`)
  if (pet_internado)      avisos.push(`🏥 *Internação:* cobrada diretamente pela clínica, não inclusa no valor acima.`)

  if (pagarClinica) {
    const msgTutor = [
      `✅ Seu agendamento foi confirmado!`,
      ``,
      `🐾 Pet: ${petNomeFinal}`,
      `  💉 ${tipoExameLabel}`,
      isEncaixe ? `📅 ${dataFmt}` : `📅 ${dataFmt}`,
      isEncaixe ? `📍 BioPet Vet — Volta Redonda (horário a confirmar)` : `📍 BioPet Vet — Volta Redonda`,
      ...(avisos.length > 0 ? [``, ...avisos] : []),
      ``,
      `Qualquer dúvida é só chamar! 🐾`,
    ].join('\n')
    await sendWhatsAppText(telNorm, msgTutor)

  } else if (pagarPresencial) {
    const msgTutor = [
      `✅ Seu agendamento foi confirmado!`,
      ``,
      `🐾 Pet: ${petNomeFinal}`,
      `  💉 ${tipoExameLabel}`,
      isEncaixe ? `📅 ${dataFmt} (horário a confirmar)` : `📅 ${dataFmt} das ${horaInicio} às ${horaFim}`,
      valorFmt ? `💰 Total a pagar: ${valorFmt}` : null,
      ``,
      `💵 O pagamento será realizado presencialmente na BioPet no dia do exame.`,
      ...(avisos.length > 0 ? [``, ...avisos] : []),
      ``,
      `Dúvidas? É só chamar! 🐾`,
    ].filter(v => v !== null).join('\n')
    await sendWhatsAppText(telNorm, msgTutor)

  } else {
    // Link MP
    let initPoint = ''
    try {
      const mp = await gerarPreferenciaMp(agendamento.id)
      initPoint = mp.init_point
    } catch {
      // Se MP falhar, agendamento já está criado — admin pode reenviar depois
    }

    const msgTutor = [
      `✅ Seu agendamento foi confirmado!`,
      ``,
      `🐾 Pet: ${petNomeFinal}`,
      `  💉 ${tipoExameLabel}`,
      isEncaixe ? `📅 ${dataFmt} (horário a confirmar)` : `📅 ${dataFmt} das ${horaInicio} às ${horaFim}`,
      valorFmt ? `💰 Total: ${valorFmt}` : null,
      ``,
      initPoint ? `Para garantir seu horário, efetue o pagamento:\n👉 ${initPoint}` : null,
      ...(avisos.length > 0 ? [``, ...avisos] : []),
      ``,
      `Dúvidas? É só chamar! 🐾`,
    ].filter(v => v !== null).join('\n')
    await sendWhatsAppText(telNorm, msgTutor)
  }

  return NextResponse.json({ agendamento_id: agendamento.id }, { status: 201 })
}
