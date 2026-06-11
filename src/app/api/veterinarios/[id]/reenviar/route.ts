import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { sendVetInvite } from '@/lib/evolution'

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const cookie = _request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie || !(await parseSystemSession(cookie))) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

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
