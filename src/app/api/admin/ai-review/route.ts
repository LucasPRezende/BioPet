import { NextRequest, NextResponse } from 'next/server'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

export async function POST(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  const { texto, apiKey, systemPrompt, endpoint } = await request.json()

  if (!texto?.trim()) return NextResponse.json({ error: 'Texto vazio.' }, { status: 400 })
  if (!apiKey?.trim()) return NextResponse.json({ error: 'Chave de API não configurada.' }, { status: 400 })

  const url = endpoint?.trim() || 'https://api.anthropic.com/v1/messages'
  const sys = systemPrompt?.trim() ||
    'Você é um assistente médico veterinário. Revise o laudo abaixo, corrija erros gramaticais, melhore a clareza e retorne apenas o texto revisado, sem comentários adicionais.'

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey.trim(),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system:     sys,
      messages:   [{ role: 'user', content: texto }],
    }),
  })

  const data = await res.json()

  if (!res.ok) {
    const msg = data?.error?.message ?? `Erro ${res.status} da API Anthropic.`
    return NextResponse.json({ error: msg }, { status: res.status })
  }

  const reviewed = data?.content?.[0]?.text
  if (!reviewed) return NextResponse.json({ error: 'Resposta inesperada da IA.' }, { status: 500 })

  return NextResponse.json({ texto: reviewed })
}
