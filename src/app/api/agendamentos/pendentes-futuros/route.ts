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

  const inicioHoje = `${new Date().toLocaleDateString('en-CA')}T00:00:00`

  const { data, error } = await supabase
    .from('agendamentos')
    .select('id, data_hora, tipo_exame, tutores(nome), pets(nome), clinicas(nome)')
    .eq('status', 'pendente')
    .gte('data_hora', inicioHoje)
    .order('data_hora')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}
