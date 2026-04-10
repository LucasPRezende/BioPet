import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { sendVetInvite } from '@/lib/evolution'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const cookie = _request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const { id } = await params
  const vetId = parseInt(id)
  if (isNaN(vetId)) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })

  const { data: vet, error } = await supabase
    .from('veterinarios')
    .select('id, nome, whatsapp')
    .eq('id', vetId)
    .single()

  if (error || !vet) return NextResponse.json({ error: 'Veterinário não encontrado.' }, { status: 404 })

  const novo_token = uuidv4()

  await supabase
    .from('veterinarios')
    .update({ token_convite: novo_token, convite_aceito: false, senha_hash: null })
    .eq('id', vetId)

  let whatsappEnviado = false
  if (vet.whatsapp) {
    whatsappEnviado = await sendVetInvite(vet.whatsapp, vet.nome, novo_token)
  }

  return NextResponse.json({ success: true, whatsappEnviado, token: novo_token })
}
