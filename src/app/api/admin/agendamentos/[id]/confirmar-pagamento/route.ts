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
    .select('id, status_pagamento, pagamento_responsavel, clinica_id, mp_preference_id')
    .eq('id', agId)
    .single()

  if (!ag) return NextResponse.json({ error: 'Agendamento não encontrado.' }, { status: 404 })
  if (ag.status_pagamento !== 'a_receber') {
    return NextResponse.json({ error: 'Pagamento já confirmado ou não aplicável.' }, { status: 400 })
  }

  const isRepasseClinica = ag.pagamento_responsavel === 'clinica'
  const novoStatus = isRepasseClinica ? 'pago_clinica' : 'pago'

  const now = new Date().toISOString()
  const updatePayload: Record<string, unknown> = {
    status_pagamento: novoStatus,
    ...(isRepasseClinica ? { repasse_confirmado: true, repasse_em: now } : {}),
  }

  // Expira preferência MP para que o link de cartão pare de funcionar
  if (ag.mp_preference_id) {
    try {
      await fetch(`https://api.mercadopago.com/checkout/preferences/${ag.mp_preference_id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${(process.env.MP_ACCESS_TOKEN ?? '').trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expires: true, expiration_date_to: new Date(Date.now() - 1000).toISOString() }),
      })
    } catch (err) {
      console.warn('[confirmar-pagamento] falha ao expirar preferência MP:', err)
    }
    updatePayload.mp_preference_id = null
    updatePayload.mp_init_point    = null
  }

  const { error } = await supabase
    .from('agendamentos')
    .update(updatePayload)
    .eq('id', agId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ sucesso: true, status_pagamento: novoStatus })
}
