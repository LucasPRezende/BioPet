import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { verifyAgentKey } from '@/lib/agent-auth'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const isAgent = verifyAgentKey(request)
  if (!isAgent) {
    const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
    if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    const session = await parseSystemSession(cookie)
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Acesso restrito.' }, { status: 403 })
    }
  }

  const { id } = await params
  const petId = parseInt(id)
  if (isNaN(petId)) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })

  const body = await request.json()
  const { falecido, falecido_em, registrado_por } = body

  if (!falecido) return NextResponse.json({ error: 'falecido deve ser true.' }, { status: 400 })
  if (!falecido_em) return NextResponse.json({ error: 'falecido_em é obrigatório.' }, { status: 400 })

  const { error } = await supabase
    .from('pets')
    .update({
      falecido:               true,
      falecido_em:            falecido_em,
      falecido_registrado_por: registrado_por ?? 'admin',
    })
    .eq('id', petId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ sucesso: true })
}
