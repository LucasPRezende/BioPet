import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

const TIPOS_AGENDAMENTO = [
  'agendamento', 'remarcacao', 'cancelamento', 'agendamento_clinica',
]

/**
 * Marca como visualizadas todas as notificações de agendamento ainda não vistas.
 * Usado quando o admin abre a aba "Agendamentos" — limpa o badge sem exigir
 * ação por item (são informativas, não "requer atenção").
 */
export async function POST(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const { error } = await supabase
    .from('notificacoes')
    .update({ visualizado: true })
    .eq('visualizado', false)
    .in('tipo_evento', TIPOS_AGENDAMENTO)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ sucesso: true })
}
