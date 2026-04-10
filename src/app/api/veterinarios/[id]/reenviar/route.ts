import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { sendVetInvite } from '@/lib/evolution'

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { data: vet, error } = await supabase
    .from('veterinarios')
    .select('id, nome, whatsapp, token_convite, convite_aceito')
    .eq('id', params.id)
    .single()

  if (error || !vet) {
    return NextResponse.json({ error: 'Veterinário não encontrado.' }, { status: 404 })
  }

  if (vet.convite_aceito) {
    return NextResponse.json({ error: 'Veterinário já aceitou o convite.' }, { status: 400 })
  }

  if (!vet.whatsapp) {
    return NextResponse.json({ error: 'Veterinário não possui WhatsApp cadastrado.' }, { status: 400 })
  }

  await sendVetInvite(vet.whatsapp, vet.nome, vet.token_convite)

  return NextResponse.json({ success: true })
}
