import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'
import { parseClinicaSession, CLINICA_COOKIE_NAME } from '@/lib/clinica-auth'

export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = (await cookies()).get(CLINICA_COOKIE_NAME)?.value
  if (!token) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  const session = await parseClinicaSession(token)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  const { id } = await params
  const agId = parseInt(id)
  if (isNaN(agId)) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })

  // Verifica se o agendamento pertence a esta clínica
  const { data: ag } = await supabase
    .from('agendamentos')
    .select('id, status, clinica_id')
    .eq('id', agId)
    .eq('clinica_id', session.clinicaId)
    .single()

  if (!ag) return NextResponse.json({ error: 'Agendamento não encontrado.' }, { status: 404 })
  if (!['pendente', 'agendado'].includes(ag.status)) {
    return NextResponse.json({ error: 'Apenas agendamentos pendentes ou confirmados podem ser cancelados.' }, { status: 400 })
  }

  const { error } = await supabase
    .from('agendamentos')
    .update({ status: 'cancelado' })
    .eq('id', agId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ sucesso: true })
}
