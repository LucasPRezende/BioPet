import { NextRequest, NextResponse } from 'next/server'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { GoogleGenerativeAI } from '@google/generative-ai'

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  const apiKey = request.nextUrl.searchParams.get('key')
  if (!apiKey) return NextResponse.json({ error: 'Parâmetro key obrigatório.' }, { status: 400 })

  const genAI = new GoogleGenerativeAI(apiKey)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list = await (genAI as any).listModels()
  const models = []
  for await (const model of list) {
    models.push({ name: model.name, supportedMethods: model.supportedGenerationMethods })
  }

  const generateContent = models
    .filter((m: { supportedMethods?: string[] }) => m.supportedMethods?.includes('generateContent'))
    .map((m: { name: string }) => m.name)

  return NextResponse.json({ total: models.length, generateContent })
}
