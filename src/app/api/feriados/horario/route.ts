import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

const KEY = 'horario_especial_fim'

export async function GET() {
  const { data } = await supabase.from('system_config').select('value').eq('key', KEY).single()
  return NextResponse.json({ horario_fim: data?.value ?? '17:00' })
}

export async function PUT(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const { horario_fim } = body
  if (!horario_fim || !/^\d{2}:\d{2}$/.test(horario_fim)) {
    return NextResponse.json({ error: 'horario_fim inválido (formato HH:MM).' }, { status: 400 })
  }

  const { error } = await supabase
    .from('system_config')
    .upsert({ key: KEY, value: horario_fim, updated_at: new Date().toISOString() }, { onConflict: 'key' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
