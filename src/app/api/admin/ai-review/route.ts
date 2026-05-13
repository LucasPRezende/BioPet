import { NextRequest, NextResponse } from 'next/server'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { getContextFiles, invalidateCache } from '@/lib/gemini-files'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { supabase } from '@/lib/supabase'

async function getSystemKey(model: string): Promise<string> {
  const key = model === 'gemini' ? 'ai_gemini_key' : 'ai_claude_key'
  const { data } = await supabase.from('system_config').select('value').eq('key', key).maybeSingle()
  return data?.value?.trim() ?? ''
}

async function getSystemPrompt(model: string): Promise<string> {
  const key = model === 'gemini' ? 'ai_gemini_system' : 'ai_claude_system'
  const { data } = await supabase.from('system_config').select('value').eq('key', key).maybeSingle()
  return data?.value?.trim() ?? ''
}

async function getSystemEndpoint(): Promise<string> {
  const { data } = await supabase.from('system_config').select('value').eq('key', 'ai_claude_endpoint').maybeSingle()
  return data?.value?.trim() ?? ''
}

async function callGemini(apiKey: string, sys: string, texto: string, forceReupload = false) {
  const contextFiles = await getContextFiles(apiKey.trim(), forceReupload)

  const genAI       = new GoogleGenerativeAI(apiKey.trim())
  const geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const parts: Parameters<typeof geminiModel.generateContent>[0] = [
    ...contextFiles.map(f => ({
      fileData: { mimeType: f.mimeType as 'application/pdf', fileUri: f.fileUri },
    })),
    { text: `${sys}\n\nTexto do laudo a revisar:\n\n${texto}` },
  ]

  const result = await geminiModel.generateContent(parts)
  return { text: result.response.text(), contextFiles: contextFiles.length }
}

export async function POST(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  const { texto, apiKey: localKey, systemPrompt: localPrompt, endpoint: localEndpoint, model } = await request.json()

  if (!texto?.trim()) return NextResponse.json({ error: 'Texto vazio.' }, { status: 400 })

  // Usa chave local (override) ou busca a chave global configurada pelo admin
  const apiKey      = localKey?.trim()      || await getSystemKey(model ?? 'gemini')
  const systemPrompt = localPrompt?.trim()  || await getSystemPrompt(model ?? 'gemini')
  const endpoint    = localEndpoint?.trim() || await getSystemEndpoint()

  if (!apiKey) return NextResponse.json({ error: 'Chave de API não configurada. Peça ao administrador para configurar em Configurações → IA.' }, { status: 400 })

  // ── Gemini ────────────────────────────────────────────────────────────────
  if (model === 'gemini') {
    const sys = systemPrompt?.trim() ||
      'Você é um assistente médico veterinário especializado. Use os laudos de referência fornecidos como base de estilo e estrutura. Revise o laudo abaixo, corrija erros gramaticais, melhore a clareza e retorne apenas o texto revisado em formato limpo, sem comentários adicionais.'

    try {
      const { text: reviewed, contextFiles } = await callGemini(apiKey, sys, texto)
      if (!reviewed) return NextResponse.json({ error: 'Resposta vazia da IA.' }, { status: 500 })
      return NextResponse.json({ texto: reviewed, contextFiles })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''

      // Se o erro indica arquivo inválido/expirado, limpa cache e tenta de novo
      const isFileError = /file/i.test(msg) || /not found/i.test(msg) || /invalid/i.test(msg)
      if (isFileError) {
        console.warn('[Gemini] URI de arquivo inválida, forçando re-upload...')
        invalidateCache()
        try {
          const { text: reviewed, contextFiles } = await callGemini(apiKey, sys, texto, true)
          if (!reviewed) return NextResponse.json({ error: 'Resposta vazia da IA.' }, { status: 500 })
          return NextResponse.json({ texto: reviewed, contextFiles, reuploaded: true })
        } catch (err2: unknown) {
          const msg2 = err2 instanceof Error ? err2.message : 'Erro ao chamar Gemini após re-upload.'
          return NextResponse.json({ error: msg2 }, { status: 500 })
        }
      }

      return NextResponse.json({ error: msg || 'Erro ao chamar Gemini.' }, { status: 500 })
    }
  }

  // ── Anthropic (Claude) ────────────────────────────────────────────────────
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
