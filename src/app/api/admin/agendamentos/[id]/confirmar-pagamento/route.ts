import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

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

  const { data: ag } = await supabase
    .from('agendamentos')
    .select('id, status_pagamento, pagamento_responsavel, clinica_id')
    .eq('id', agId)
    .single()

  if (!ag) return NextResponse.json({ error: 'Agendamento não encontrado.' }, { status: 404 })
  if (ag.status_pagamento !== 'a_receber') {
    return NextResponse.json({ error: 'Pagamento já confirmado ou não aplicável.' }, { status: 400 })
  }

  const novoStatus = (ag.pagamento_responsavel === 'clinica' || ag.clinica_id != null) ? 'pago_clinica' : 'pago'

  const { error } = await supabase
    .from('agendamentos')
    .update({ status_pagamento: novoStatus })
    .eq('id', agId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ sucesso: true, status_pagamento: novoStatus })
}
