import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { sendWhatsAppText } from '@/lib/evolution'
import { gerarPreferenciaMp } from '@/lib/mp-preference'

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

function horaFimStr(isoStr: string, duracaoMin: number | null): string {
  const timePart = isoStr.split('T')[1] ?? '00:00'
  const [h, m]   = timePart.split(':').map(Number)
  const fimMin   = h * 60 + m + (duracaoMin ?? 0)
  return `${String(Math.floor(fimMin / 60)).padStart(2, '0')}:${String(fimMin % 60).padStart(2, '0')}`
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const { id } = await params
  const agId   = parseInt(id)

  const { data: ag } = await supabase
    .from('agendamentos')
    .select(`
      id, status, tipo_exame, data_hora, duracao_minutos, valor,
      pagamento_responsavel, forma_pagamento, entrega_pagamento,
      sedacao_necessaria, pet_internado,
      clinica_id,
      tutores(nome, telefone),
      pets(nome, especie, raca),
      clinicas(nome, telefone)
    `)
    .eq('id', agId)
    .single()

  if (!ag) return NextResponse.json({ error: 'Agendamento não encontrado.' }, { status: 404 })
  if (ag.status !== 'pendente') {
    return NextResponse.json({ error: 'Apenas agendamentos pendentes podem ser confirmados.' }, { status: 400 })
  }

  const tutor      = Array.isArray(ag.tutores) ? ag.tutores[0] : ag.tutores as { nome: string | null; telefone: string } | null
  const pet        = Array.isArray(ag.pets)    ? ag.pets[0]    : ag.pets    as { nome: string; especie: string | null; raca: string | null } | null
  const clinicaObj = Array.isArray(ag.clinicas) ? ag.clinicas[0] : ag.clinicas as { nome: string; telefone: string | null } | null

  const pagResp        = ag.pagamento_responsavel ?? 'tutor'
  const formaPag       = ag.forma_pagamento ?? ''
  const entrega        = (ag as Record<string, unknown>).entrega_pagamento as string ?? 'link'
  const sedacao        = (ag as Record<string, unknown>).sedacao_necessaria as boolean ?? false
  const internado      = (ag as Record<string, unknown>).pet_internado as boolean ?? false
  const pagarClinica   = pagResp === 'clinica' || formaPag === 'pix_presencial' || ag.clinica_id != null
  const pagarPresencial = !pagarClinica && entrega === 'presencial'
  const dataFmt        = formatDataHora(ag.data_hora)
  const horaInicio    = (ag.data_hora.split('T')[1] ?? '').substring(0, 5)
  const horaFim       = horaFimStr(ag.data_hora, ag.duracao_minutos)
  const valorFmt      = ag.valor != null
    ? Number(ag.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : null

  // Busca exames da tabela agendamento_exames (para listar no WhatsApp)
  const { data: examesRows } = await supabase
    .from('agendamento_exames')
    .select('tipo_exame')
    .eq('agendamento_id', agId)

  // Busca sub-exames de bioquímica (se houver)
  const { data: bioRows } = await supabase
    .from('agendamento_bioquimica')
    .select('valor_pix, valor_cartao, bioquimica_exames(nome)')
    .eq('agendamento_id', agId)

  function brl(n: number) {
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  const isPix = !formaPag.includes('cartao')

  // Monta lista de exames — expande Bioquímica com sub-exames se houver
  let listaExames: string
  if (examesRows && examesRows.length > 0) {
    const partes: string[] = []
    for (const e of examesRows) {
      if (e.tipo_exame === 'Bioquímica' && bioRows && bioRows.length > 0) {
        const bioTotal = bioRows.reduce((sum, b) => sum + Number(isPix ? b.valor_pix : b.valor_cartao), 0)
        const bioLinhas = bioRows.map(b => {
          const nome = Array.isArray(b.bioquimica_exames)
            ? b.bioquimica_exames[0]?.nome
            : (b.bioquimica_exames as { nome: string } | null)?.nome ?? '—'
          const val = Number(isPix ? b.valor_pix : b.valor_cartao)
          return `  • ${nome} — ${brl(val)}`
        }).join('\n')
        partes.push(`Bioquímica:\n${bioLinhas}\n  Total: ${brl(bioTotal)}`)
      } else {
        partes.push(e.tipo_exame)
      }
    }
    listaExames = partes.join('\n  💉 ')
  } else {
    listaExames = ag.tipo_exame
  }

  // Avisos de serviços cobrados pela clínica
  const avisos: string[] = []
  if (sedacao)   avisos.push(`⚠️ *Sedação:* cobrada diretamente pela clínica, não inclusa no valor acima.`)
  if (internado) avisos.push(`🏥 *Internação:* cobrada diretamente pela clínica, não inclusa no valor acima.`)

  if (pagarClinica) {
    // ── CLÍNICA PAGA ──────────────────────────────────────────────────────────
    const { error } = await supabase
      .from('agendamentos')
      .update({ status: 'agendado', status_pagamento: 'a_receber' })
      .eq('id', agId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (tutor?.telefone) {
      const digits  = tutor.telefone.replace(/\D/g, '')
      const tel     = digits.startsWith('55') ? digits : `55${digits}`
      const msgTutor = [
        `✅ Seu agendamento foi confirmado!`,
        ``,
        `🐾 Pet: ${pet?.nome ?? '—'}`,
        `  💉 ${listaExames}`,
        `📅 ${dataFmt}`,
        `📍 BioPet Vet — Volta Redonda`,
        ...(avisos.length > 0 ? [``, ...avisos] : []),
        ``,
        `Qualquer dúvida é só chamar! 🐾`,
      ].join('\n')
      await sendWhatsAppText(tel, msgTutor)
    }

    if (clinicaObj?.telefone) {
      const digits  = clinicaObj.telefone.replace(/\D/g, '')
      const telClin = digits.startsWith('55') ? digits : `55${digits}`
      await sendWhatsAppText(telClin, [
        `✅ Agendamento confirmado!`,
        `Pet: ${pet?.nome ?? '—'} — ${ag.tipo_exame}`,
        `📅 ${dataFmt}`,
      ].join('\n'))
    }

  } else if (pagarPresencial) {
    // ── TUTOR PAGA PRESENCIALMENTE ────────────────────────────────────────────
    const { error } = await supabase
      .from('agendamentos')
      .update({ status: 'agendado', status_pagamento: 'a_receber' })
      .eq('id', agId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (tutor?.telefone) {
      const digits  = tutor.telefone.replace(/\D/g, '')
      const tel     = digits.startsWith('55') ? digits : `55${digits}`
      const msgTutor = [
        `✅ Seu agendamento foi confirmado!`,
        ``,
        `🐾 Pet: ${pet?.nome ?? '—'}`,
        `  💉 ${listaExames}`,
        `📅 ${dataFmt} das ${horaInicio} às ${horaFim}`,
        valorFmt ? `💰 Total a pagar: ${valorFmt}` : null,
        ``,
        `💵 O pagamento será realizado presencialmente na BioPet no dia do exame.`,
        ...(avisos.length > 0 ? [``, ...avisos] : []),
        ``,
        `Dúvidas? É só chamar! 🐾`,
      ].filter(v => v !== null).join('\n')
      await sendWhatsAppText(tel, msgTutor)
    }

    if (clinicaObj?.telefone) {
      const digits  = clinicaObj.telefone.replace(/\D/g, '')
      const telClin = digits.startsWith('55') ? digits : `55${digits}`
      await sendWhatsAppText(telClin, [
        `✅ Agendamento confirmado!`,
        `Pet: ${pet?.nome ?? '—'} — ${ag.tipo_exame}`,
        `📅 ${dataFmt}`,
        `💵 Pagamento presencial na BioPet`,
      ].join('\n'))
    }

  } else {
    // ── TUTOR PAGA VIA LINK MP ────────────────────────────────────────────────
    const { error } = await supabase
      .from('agendamentos')
      .update({ status: 'agendado' })
      .eq('id', agId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    let initPoint = ''
    try {
      const mp = await gerarPreferenciaMp(agId)
      initPoint = mp.init_point
    } catch {
      // Se MP falhar, confirma mesmo assim — admin pode reenviar depois
    }

    if (tutor?.telefone) {
      const digits  = tutor.telefone.replace(/\D/g, '')
      const tel     = digits.startsWith('55') ? digits : `55${digits}`
      const msgTutor = [
        `✅ Seu agendamento foi confirmado!`,
        ``,
        `🐾 Pet: ${pet?.nome ?? '—'}`,
        `  💉 ${listaExames}`,
        `📅 ${dataFmt} das ${horaInicio} às ${horaFim}`,
        valorFmt ? `💰 Total: ${valorFmt}` : null,
        ``,
        initPoint ? `Para garantir seu horário, efetue o pagamento:\n👉 ${initPoint}` : null,
        ...(avisos.length > 0 ? [``, ...avisos] : []),
        ``,
        `Dúvidas? É só chamar! 🐾`,
      ].filter(v => v !== null).join('\n')
      await sendWhatsAppText(tel, msgTutor)
    }

    if (clinicaObj?.telefone) {
      const digits  = clinicaObj.telefone.replace(/\D/g, '')
      const telClin = digits.startsWith('55') ? digits : `55${digits}`
      await sendWhatsAppText(telClin, [
        `✅ Agendamento confirmado!`,
        `Pet: ${pet?.nome ?? '—'} — ${ag.tipo_exame}`,
        `📅 ${dataFmt}`,
      ].join('\n'))
    }
  }

  return NextResponse.json({ sucesso: true })
}
