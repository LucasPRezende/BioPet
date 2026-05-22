import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { isPixTokenValido } from '@/lib/pix-token'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: token } = await params

  if (!isPixTokenValido(token)) return NextResponse.json({ pago: false })

  const { data } = await supabase
    .from('agendamentos')
    .select('status_pagamento')
    .eq('pix_token', token)
    .single()

  return NextResponse.json({ pago: data?.status_pagamento === 'pago' })
}
