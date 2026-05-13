import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

const CONFIG_KEYS = ['ai_model', 'ai_gemini_key', 'ai_gemini_system', 'ai_claude_key', 'ai_claude_endpoint', 'ai_claude_system']

async function getSession(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return null
  return parseSystemSession(cookie)
}

// GET — qualquer usuário autenticado
// Admin recebe os valores completos; outros recebem apenas { configured, model }
export async function GET(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: rows } = await supabase
    .from('system_config')
    .select('key, value')
    .in('key', CONFIG_KEYS)

  const map: Record<string, string> = {}
  for (const row of rows ?? []) map[row.key] = row.value

  const configured = !!(map.ai_gemini_key || map.ai_claude_key)
  const model = (map.ai_model as 'gemini' | 'anthropic') ?? 'gemini'

  if (session.role !== 'admin') {
    return NextResponse.json({ configured, model })
  }

  return NextResponse.json({
    configured,
    model,
    gemini_key:      map.ai_gemini_key      ?? '',
    gemini_system:   map.ai_gemini_system   ?? '',
    claude_key:      map.ai_claude_key      ?? '',
    claude_endpoint: map.ai_claude_endpoint ?? '',
    claude_system:   map.ai_claude_system   ?? '',
  })
}

// POST — somente admin
export async function POST(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const body: {
    model?:           string
    gemini_key?:      string
    gemini_system?:   string
    claude_key?:      string
    claude_endpoint?: string
    claude_system?:   string
  } = await request.json().catch(() => ({}))

  const upserts: { key: string; value: string; updated_at: string }[] = []
  const now = new Date().toISOString()

  const add = (key: string, val: string | undefined) => {
    if (val !== undefined) upserts.push({ key, value: val.trim(), updated_at: now })
  }

  add('ai_model',           body.model)
  add('ai_gemini_key',      body.gemini_key)
  add('ai_gemini_system',   body.gemini_system)
  add('ai_claude_key',      body.claude_key)
  add('ai_claude_endpoint', body.claude_endpoint)
  add('ai_claude_system',   body.claude_system)

  if (upserts.length === 0) return NextResponse.json({ error: 'Nenhum campo enviado.' }, { status: 400 })

  const { error } = await supabase.from('system_config').upsert(upserts, { onConflict: 'key' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
