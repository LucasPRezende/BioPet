import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

const KEY_FIM    = 'horario_especial_fim'
const KEY_INICIO = 'horario_especial_inicio'

export async function GET() {
  const { data } = await supabase
    .from('system_config')
    .select('key, value')
    .in('key', [KEY_FIM, KEY_INICIO])

  const map = Object.fromEntries((data ?? []).map(r => [r.key, r.value]))
  return NextResponse.json({
    horario_fim:    map[KEY_FIM]    ?? '17:00',
    horario_inicio: map[KEY_INICIO] ?? '08:00',
  })
}

export async function PUT(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const { horario_fim, horario_inicio } = body
  const re = /^\d{2}:\d{2}$/

  const upserts: { key: string; value: string; updated_at: string }[] = []
  const now = new Date().toISOString()

  if (horario_fim !== undefined) {
    if (!re.test(horario_fim)) return NextResponse.json({ error: 'horario_fim inválido (HH:MM).' }, { status: 400 })
    upserts.push({ key: KEY_FIM, value: horario_fim, updated_at: now })
  }
  if (horario_inicio !== undefined) {
    if (!re.test(horario_inicio)) return NextResponse.json({ error: 'horario_inicio inválido (HH:MM).' }, { status: 400 })
    upserts.push({ key: KEY_INICIO, value: horario_inicio, updated_at: now })
  }

  if (upserts.length === 0) return NextResponse.json({ error: 'Nenhum campo enviado.' }, { status: 400 })

  const { error } = await supabase.from('system_config').upsert(upserts, { onConflict: 'key' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
