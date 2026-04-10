import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  // Auto-limpa bloqueios expirados
  await supabase
    .from('tutores')
    .update({ atendimento_humano: false, atendimento_humano_ate: null })
    .eq('atendimento_humano', true)
    .lt('atendimento_humano_ate', new Date().toISOString())

  const { data, error } = await supabase
    .from('tutores')
    .select('id, nome, telefone, atendimento_humano_ate')
    .eq('atendimento_humano', true)
    .order('atendimento_humano_ate', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
