import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
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
  const agId = parseInt(id)

  // Busca agendamento com todos os dados necessários
  const { data: ag } = await supabase
    .from('agendamentos')
    .select('id, status, tipo_exame, data_hora, clinica_id, tutores(nome, telefone), pets(nome, especie, raca), clinicas(nome, telefone)')
    .eq('id', agId)
    .single()

  if (!ag) return NextResponse.json({ error: 'Agendamento não encontrado.' }, { status: 404 })
  if (ag.status !== 'pendente') {
    return NextResponse.json({ error: 'Apenas agendamentos pendentes podem ser confirmados.' }, { status: 400 })
  }

  // Confirma o agendamento
  const { error } = await supabase
    .from('agendamentos')
    .update({ status: 'agendado' })
    .eq('id', agId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const dataFmt    = formatDataHora(ag.data_hora)
  const tutor      = Array.isArray(ag.tutores) ? ag.tutores[0] : ag.tutores as { nome: string | null; telefone: string } | null
  const pet        = Array.isArray(ag.pets)    ? ag.pets[0]    : ag.pets    as { nome: string; especie: string | null; raca: string | null } | null
  const clinicaObj = Array.isArray(ag.clinicas) ? ag.clinicas[0] : ag.clinicas as { nome: string; telefone: string | null } | null

  // WhatsApp para o tutor
  if (tutor?.telefone) {
    const digits    = tutor.telefone.replace(/\D/g, '')
    const telNorm   = digits.startsWith('55') ? digits : `55${digits}`
    const msgTutor  = [
      `Olá${tutor.nome ? ` ${tutor.nome}` : ''}! Seu agendamento foi confirmado:`,
      `🐾 Pet: ${pet?.nome ?? '—'}`,
      `💉 Exame: ${ag.tipo_exame}`,
      `📅 ${dataFmt}`,
      `📍 BioPet Vet — Volta Redonda`,
    ].join('\n')
    await sendWhatsAppText(telNorm, msgTutor)
  }

  // WhatsApp para a clínica
  if (clinicaObj?.telefone) {
    const digits   = clinicaObj.telefone.replace(/\D/g, '')
    const telClin  = digits.startsWith('55') ? digits : `55${digits}`
    const msgClin  = [
      `✅ Agendamento confirmado!`,
      `Pet: ${pet?.nome ?? '—'} — ${ag.tipo_exame}`,
      `📅 ${dataFmt}`,
    ].join('\n')
    await sendWhatsAppText(telClin, msgClin)
  }

  return NextResponse.json({ sucesso: true })
}
