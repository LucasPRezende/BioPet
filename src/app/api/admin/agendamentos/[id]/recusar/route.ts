import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { sendWhatsAppText } from '@/lib/evolution'

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
    const telClin = digits.startsWith('55') ? digits : `55${digits}`
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
    const telTutor = digits.startsWith('55') ? digits : `55${digits}`
    const dataFmt  = ag.data_hora
      ? new Date(ag.data_hora).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })
      : null
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
