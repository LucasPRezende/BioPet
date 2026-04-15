import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

const TIPOS_REQUER_ATENCAO = new Set([
  'ia_travou', 'pergunta_laudo', 'pergunta_tecnica', 'erro_tecnico',
])

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

  // Badge conta apenas "Requer atenção" não visualizadas
  // (tipo_evento nulo = notificação antiga, também conta)
  const naoVisualizadas = (data ?? []).filter(n =>
    !n.visualizado &&
    (n.tipo_evento === null || n.tipo_evento === undefined || TIPOS_REQUER_ATENCAO.has(n.tipo_evento))
  ).length

  return NextResponse.json({ notificacoes: data ?? [], nao_visualizadas: naoVisualizadas })
}
