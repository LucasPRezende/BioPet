import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { aplicarAutoResolucao, contarPendentes } from '@/lib/notificacoes'

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('notificacoes')
    .select('*')
    .order('criado_em', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notificação com mais de 7 dias vira "resolvida automaticamente" e sai dos
  // contadores (badge "Requer atenção" + agendamentos novos).
  const agora = Date.now()
  const notificacoes = aplicarAutoResolucao(data ?? [], agora)
  const { nao_visualizadas, agendamentos_novos } = contarPendentes(data ?? [], agora)

  return NextResponse.json({ notificacoes, nao_visualizadas, agendamentos_novos })
}
