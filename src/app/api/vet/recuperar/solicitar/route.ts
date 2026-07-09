import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '@/lib/supabase'
import { sendVetInvite } from '@/lib/evolution'
import { normalizeTelefone } from '@/lib/telefone'

export async function POST(request: NextRequest) {
  const { whatsapp } = await request.json()

  if (!whatsapp) {
    return NextResponse.json({ error: 'WhatsApp é obrigatório.' }, { status: 400 })
  }

  const digits = String(whatsapp).replace(/\D/g, '')
  const number = normalizeTelefone(digits)

  const { data: vet } = await supabase
    .from('veterinarios')
    .select('id, nome, whatsapp')
    .or(`whatsapp.eq.${digits},whatsapp.eq.${number}`)
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
