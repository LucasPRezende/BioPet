import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// Endpoint público usado pelo polling da página de pagamento PIX.
// Retorna apenas se está 'pago' ou não — sem outros dados sensíveis.
// O ID por si só não é sensível; só confirma se o pagamento foi recebido.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const agId = Number(id)

  if (isNaN(agId) || agId <= 0) {
    return NextResponse.json({ pago: false })
  }

  const { data } = await supabase
    .from('agendamentos')
    .select('status_pagamento')
    .eq('id', agId)
    .single()

  // Retorna apenas booleano — não expõe outros estados internos
  return NextResponse.json({ pago: data?.status_pagamento === 'pago' })
}
