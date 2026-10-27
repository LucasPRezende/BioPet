import { NextRequest, NextResponse } from 'next/server'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { lerFotosUrina } from '@/lib/ler-urina-foto'

// Leitura pode levar ~30s no modelo Pro.
export const maxDuration = 120

const MAX_BYTES = 15 * 1024 * 1024
const MAX_FOTOS = 4

// POST (multipart, campo "fotos", até 4) — lê as fotos da tela ou da impressão
// do analisador de urina e devolve os valores para a tela conferir. Não salva nada.
export async function POST(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  const form  = await request.formData().catch(() => null)
  const fotos = (form?.getAll('fotos') ?? []).filter((f): f is File => f instanceof File)
  if (fotos.length === 0)       return NextResponse.json({ error: 'Envie a foto do resultado.' }, { status: 400 })
  if (fotos.length > MAX_FOTOS) return NextResponse.json({ error: `No máximo ${MAX_FOTOS} fotos por amostra.` }, { status: 400 })
  for (const f of fotos) {
    if (f.size > MAX_BYTES)          return NextResponse.json({ error: 'Foto muito grande (máx. 15 MB).' }, { status: 400 })
    if (!f.type.startsWith('image/')) return NextResponse.json({ error: 'Envie fotos (JPG, PNG ou HEIC).' }, { status: 400 })
  }

  try {
    const lida = await lerFotosUrina(await Promise.all(
      fotos.map(async f => ({ dados: Buffer.from(await f.arrayBuffer()), mimeType: f.type })),
    ))
    if (Object.keys(lida.valores).length === 0) {
      return NextResponse.json({ error: 'Não encontrei nenhum resultado na foto. Tire outra, mais de perto e sem reflexo, ou preencha à mão.' }, { status: 422 })
    }
    return NextResponse.json(lida)
  } catch (err) {
    console.error('[ler-urina] erro:', err)
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    return NextResponse.json({ error: `Não consegui ler a foto: ${msg}` }, { status: 500 })
  }
}
