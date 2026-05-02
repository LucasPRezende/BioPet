import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  const { data, error } = await supabase
    .from('revisao_config')
    .select('*')
    .order('tipo_exame')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const { id, ...fields } = body ?? {}
  if (!id) return NextResponse.json({ error: 'ID obrigatório.' }, { status: 400 })

  const allowed = ['permite_revisao','prazo_dias','max_revisoes','valor_horario_comercial','valor_fora_comercial','gera_laudo','valor_laudo_extra','horario_inicio','horario_fim']
  const update: Record<string, unknown> = {}
  for (const k of allowed) {
    if (fields[k] !== undefined) update[k] = fields[k]
  }

  const { data, error } = await supabase
    .from('revisao_config')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
