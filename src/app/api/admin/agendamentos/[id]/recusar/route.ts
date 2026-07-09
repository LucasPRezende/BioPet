import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { sendWhatsAppText } from '@/lib/evolution'
import { normalizeTelefone } from '@/lib/telefone'

const DIAS_PT = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado']

function formatDataHora(isoStr: string): string {
  const [datePart, timePart = '00:00'] = isoStr.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute]     = timePart.split(':').map(Number)
  const d      = new Date(year, month - 1, day, hour, minute)
  const dd     = String(day).padStart(2, '0')
  const mm     = String(month).padStart(2, '0')
  const hh     = String(hour).padStart(2, '0')
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

  const body = await request.json().catch(() => null)
  const motivo: string | null = body?.motivo ?? null

  const { data: ag } = await supabase
    .from('agendamentos')
    .select('id, status, tipo_exame, data_hora, clinicas(nome, telefone), tutores(telefone), pets(nome)')
    .eq('id', agId)
    .single()

  if (!ag) return NextResponse.json({ error: 'Agendamento não encontrado.' }, { status: 404 })
  if (ag.status !== 'pendente') {
    return NextResponse.json({ error: 'Apenas agendamentos pendentes podem ser recusados.' }, { status: 400 })
  }

  const obs = motivo ? `Recusado: ${motivo}` : 'Recusado pelo administrador'

  const { error } = await supabase
    .from('agendamentos')
    .update({ status: 'cancelado', observacoes: obs })
    .eq('id', agId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // WhatsApp para a clínica
  const clinicaObj = Array.isArray(ag.clinicas) ? ag.clinicas[0] : ag.clinicas as { nome: string; telefone: string | null } | null
  if (clinicaObj?.telefone) {
    const digits  = clinicaObj.telefone.replace(/\D/g, '')
    const telClin = normalizeTelefone(digits)
    const msg = [
      `❌ Agendamento recusado`,
      `Exame: ${ag.tipo_exame}`,
      motivo ? `Motivo: ${motivo}` : null,
      `Entre em contato para remarcar ou mais informações.`,
    ].filter(Boolean).join('\n')
    await sendWhatsAppText(telClin, msg)
  }

  // WhatsApp para o tutor
  const tutorObj = Array.isArray(ag.tutores) ? ag.tutores[0] : ag.tutores as { telefone: string | null } | null
  const petObj   = Array.isArray(ag.pets)    ? ag.pets[0]    : ag.pets    as { nome: string } | null
  if (tutorObj?.telefone) {
    const digits   = tutorObj.telefone.replace(/\D/g, '')
    const telTutor = normalizeTelefone(digits)
    const dataFmt  = ag.data_hora ? formatDataHora(ag.data_hora) : null
    const msg = [
      `❌ Infelizmente seu agendamento para *${petObj?.nome ?? 'seu pet'}* (${ag.tipo_exame})`,
      dataFmt ? `em *${dataFmt}*` : null,
      `não pôde ser confirmado.`,
      `Responda esta mensagem para reagendar ou tirar dúvidas.`,
    ].filter(Boolean).join(' ')
    await sendWhatsAppText(telTutor, msg)
  }

  return NextResponse.json({ sucesso: true })
}
