import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const id = parseInt(params.id)
  if (!id) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })

  const body = await request.json().catch(() => ({}))
  const { resetar_atendimento } = body

  // Marca como visualizado
  const { data: notif, error } = await supabase
    .from('notificacoes')
    .update({ visualizado: true })
    .eq('id', id)
    .select('telefone')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Reseta atendimento_humano do tutor se solicitado
  if (resetar_atendimento && notif?.telefone) {
    const digits  = notif.telefone.replace(/\D/g, '')
    const telNorm = digits.startsWith('55') ? digits : `55${digits}`
    await supabase
      .from('tutores')
      .update({ atendimento_humano: false, atendimento_humano_ate: null })
      .or(`telefone.eq.${telNorm},telefone.eq.${digits}`)
  }

  return NextResponse.json({ sucesso: true })
}
