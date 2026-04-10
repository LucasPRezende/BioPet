import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '@/lib/supabase'
import { sendVetInvite } from '@/lib/evolution'

export async function POST(request: NextRequest) {
  const { email } = await request.json()

  if (!email) {
    return NextResponse.json({ error: 'E-mail é obrigatório.' }, { status: 400 })
  }

  const { data: vet } = await supabase
    .from('veterinarios')
    .select('id, nome, whatsapp')
    .eq('email', email.toLowerCase().trim())
    .single()

  // Resposta genérica mesmo se não encontrar (segurança)
  if (!vet) {
    return NextResponse.json({ success: true })
  }

  if (!vet.whatsapp) {
    return NextResponse.json(
      { error: 'Este veterinário não possui WhatsApp cadastrado. Entre em contato com a clínica.' },
      { status: 400 },
    )
  }

  const novoToken = uuidv4()

  await supabase
    .from('veterinarios')
    .update({ token_convite: novoToken, atualizado_em: new Date().toISOString() })
    .eq('id', vet.id)

  await sendVetInvite(vet.whatsapp, vet.nome, novoToken, 'recuperacao')

  return NextResponse.json({ success: true })
}
