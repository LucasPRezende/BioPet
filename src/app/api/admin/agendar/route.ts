import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { sendWhatsAppText } from '@/lib/evolution'
import { gerarPreferenciaMp } from '@/lib/mp-preference'
import { gerarPixToken } from '@/lib/pix-token'
import {
  normalizeTelefone,
  verificarConflito,
  upsertTutor,
  insertExames,
  insertBioquimica,
  type ExameInput,
  type BioquimicaInput,
} from '@/lib/agendamento-helpers'

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
    telefone, tutor_nome, cpf,
    pet_id, pet_nome, pet_especie, pet_raca,
    pet_pelagem, pet_nascimento, pet_sexo, pet_castrado, pet_temperamento,
    exames,
    tipo_exame,
    data_hora, duracao_minutos,
    valor, forma_pagamento, entrega_pagamento,
    veterinario_id, observacoes,
    sedacao_necessaria, pet_internado,
    pagamento_responsavel,
    bioquimica_selecionados,
    encaixe,
    notificar,
    clinica_id,
  } = body ?? {}

  const deveNotificar = notificar !== false

  // Suporte a multi-exame (exames[]) e single (tipo_exame)
  const examesArr: ExameInput[] =
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

  // Desconto é exclusivo de admin
  const temDesconto = examesArr.some(e => Number(e.desconto ?? 0) > 0)
  if (temDesconto && session.role !== 'admin') {
    return NextResponse.json({ error: 'Apenas administradores podem aplicar desconto.' }, { status: 403 })
  }

  const telNorm = normalizeTelefone(telefone)

  // 1. Busca ou cria tutor
  let tutorId: number
  try {
    tutorId = await upsertTutor(telNorm, tutor_nome, cpf ?? undefined)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro ao processar tutor.' }, { status: 500 })
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
        .from('pets').insert({
          tutor_id:      tutorId,
          nome:          pet_nome,
          especie:       pet_especie       ?? null,
          raca:          pet_raca          ?? null,
          pelagem:       pet_pelagem       ?? null,
          data_nascimento: pet_nascimento  ?? null,
          sexo:          pet_sexo          ?? null,
          castrado:      pet_castrado      ?? false,
          temperamento:  pet_temperamento  ?? null,
        }).select('id, nome').single()
      if (errPet) return NextResponse.json({ error: errPet.message }, { status: 500 })
      petIdFinal   = novoPet.id
      petNomeFinal = novoPet.nome
    }
  }

  // 3. Verifica conflito de horário (ignora encaixes se não for encaixe)
  if (!encaixe) {
    const totalDuracao = examesArr.reduce((s, e) => s + e.duracao_minutos, 0)
    const conflito = await verificarConflito(data_hora, totalDuracao, { ignorarEncaixe: true })
    if (conflito) return NextResponse.json({ error: 'Já existe um agendamento neste horário.' }, { status: 409 })
  }

  // 4. Cria agendamento
  const tipoExameLabel  = examesArr.map(e => e.tipo_exame).join(', ')
  const valorTotal      = examesArr.reduce((s, e) => s + (e.valor ?? 0), 0)
  const totalDuracaoMin = examesArr.reduce((s, e) => s + e.duracao_minutos, 0)

  const pagResp         = pagamento_responsavel ?? 'tutor'
  const entrega         = entrega_pagamento ?? 'link'
  const pagarGratuito   = (forma_pagamento ?? '').toLowerCase() === 'gratuito'
  const pagarClinica    = !pagarGratuito && (pagResp === 'clinica' || forma_pagamento === 'pix_presencial')
  const pagarPresencial = !pagarGratuito && !pagarClinica && entrega === 'presencial'
  const statusPag       = pagarGratuito ? 'pago' : (pagarClinica || pagarPresencial ? 'a_receber' : 'pendente')

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
      clinica_id:            clinica_id ? Number(clinica_id) : null,
      origem:                'manual',
    })
    .select('id')
    .single()

  if (errAg) return NextResponse.json({ error: errAg.message }, { status: 500 })

  // 5. Insere exames e sub-exames de bioquímica
  await insertExames(agendamento.id, examesArr)
  await insertBioquimica(agendamento.id, Array.isArray(bioquimica_selecionados) ? bioquimica_selecionados as BioquimicaInput[] : [])

  // 6. Notificação WhatsApp para o tutor
  const isEncaixe  = encaixe ?? false
  const dataFmt    = formatDataHora(data_hora, isEncaixe)
  const dataFmtData = formatDataHora(data_hora, true)
  const horaInicio = (data_hora.split('T')[1] ?? '').substring(0, 5).replace(':', 'h').replace(/h00$/, 'h')
  const horaFim    = horaFimStr(data_hora, totalDuracaoMin).replace(':', 'h').replace(/h00$/, 'h')
  const fmtBRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const descontoTotal = examesArr.reduce((s, e) => s + Number(e.desconto ?? 0), 0)
  const subtotalBruto = valorTotal + descontoTotal
  // Linhas de valor da mensagem: mostra Subtotal/Desconto/Total quando há desconto
  const linhasValor = (labelTotal: string): string[] => {
    if (valorTotal <= 0) return []
    if (descontoTotal > 0) {
      return [
        `💰 Subtotal: ${fmtBRL(subtotalBruto)}`,
        `🏷️ Desconto: -${fmtBRL(descontoTotal)}`,
        `💰 ${labelTotal}: ${fmtBRL(valorTotal)}`,
      ]
    }
    return [`💰 ${labelTotal}: ${fmtBRL(valorTotal)}`]
  }

  const avisos: string[] = []
  if (sedacao_necessaria) avisos.push(`⚠️ *Sedação:* cobrada diretamente pela clínica, não inclusa no valor acima.`)
  if (pet_internado)      avisos.push(`🏥 *Internação:* cobrada diretamente pela clínica, não inclusa no valor acima.`)

  if (pagarGratuito) {
    if (deveNotificar) {
      const msgTutor = [
        `✅ Seu agendamento foi confirmado!`,
        ``,
        `🐾 Pet: ${petNomeFinal}`,
        `  💉 ${tipoExameLabel}`,
        isEncaixe ? `📅 ${dataFmt} (horário a confirmar)` : `📅 ${dataFmtData} das ${horaInicio} às ${horaFim}`,
        ``,
        `Este atendimento é *cortesia* — não é necessário nenhum pagamento. 🎁`,
        ...(avisos.length > 0 ? [``, ...avisos] : []),
        ``,
        `Dúvidas? É só chamar! 🐾`,
      ].join('\n')
      await sendWhatsAppText(telNorm, msgTutor)
    }

  } else if (pagarClinica) {
    if (deveNotificar) {
      const msgTutor = [
        `✅ Seu agendamento foi confirmado!`,
        ``,
        `🐾 Pet: ${petNomeFinal}`,
        `  💉 ${tipoExameLabel}`,
        isEncaixe ? `📅 ${dataFmt} (horário a confirmar)` : `📅 ${dataFmt}`,
        isEncaixe ? `📍 BioPet Vet — Volta Redonda (horário a confirmar)` : `📍 BioPet Vet — Volta Redonda`,
        ...(avisos.length > 0 ? [``, ...avisos] : []),
        ``,
        `Qualquer dúvida é só chamar! 🐾`,
      ].join('\n')
      await sendWhatsAppText(telNorm, msgTutor)
    }

  } else if (pagarPresencial) {
    if (deveNotificar) {
      const msgTutor = [
        `✅ Seu agendamento foi confirmado!`,
        ``,
        `🐾 Pet: ${petNomeFinal}`,
        `  💉 ${tipoExameLabel}`,
        isEncaixe ? `📅 ${dataFmt} (horário a confirmar)` : `📅 ${dataFmtData} das ${horaInicio} às ${horaFim}`,
        ...linhasValor('Total a pagar'),
        ``,
        `💵 O pagamento será realizado presencialmente na BioPet no dia do exame.`,
        ...(avisos.length > 0 ? [``, ...avisos] : []),
        ``,
        `Dúvidas? É só chamar! 🐾`,
      ].filter(v => v !== null).join('\n')
      await sendWhatsAppText(telNorm, msgTutor)
    }

  } else {
    const formaPagNorm = (forma_pagamento ?? '').toLowerCase()
    let initPoint = ''
    if (formaPagNorm.includes('cartao')) {
      try {
        const mp = await gerarPreferenciaMp(agendamento.id)
        initPoint = mp.init_point
      } catch (err) {
        console.error('[agendar] erro ao gerar link MP:', err instanceof Error ? err.message : err)
      }
    } else {
      // PIX: link para nossa página de pagamento
      const pixToken = gerarPixToken()
      initPoint = `${process.env.NEXT_PUBLIC_URL}/pagamento/pix/${pixToken}`
      await supabase
        .from('agendamentos')
        .update({ pix_token: pixToken, mp_init_point: initPoint, status_pagamento: 'a_receber' })
        .eq('id', agendamento.id)
    }

    if (deveNotificar) {
      const msgTutor = [
        `✅ Seu agendamento foi confirmado!`,
        ``,
        `🐾 Pet: ${petNomeFinal}`,
        `  💉 ${tipoExameLabel}`,
        isEncaixe ? `📅 ${dataFmt} (horário a confirmar)` : `📅 ${dataFmtData} das ${horaInicio} às ${horaFim}`,
        ...linhasValor('Total'),
        ``,
        initPoint ? `Para garantir seu horário, efetue o pagamento:\n👉 ${initPoint}` : null,
        ...(avisos.length > 0 ? [``, ...avisos] : []),
        ``,
        `Dúvidas? É só chamar! 🐾`,
      ].filter(v => v !== null).join('\n')
      await sendWhatsAppText(telNorm, msgTutor)
    }
  }

  return NextResponse.json({ agendamento_id: agendamento.id }, { status: 201 })
}
