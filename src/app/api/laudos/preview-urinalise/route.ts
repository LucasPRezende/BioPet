import { NextRequest, NextResponse } from 'next/server'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { gerarLaudoUrinalise, type UrinaliseEntrada } from '@/lib/generate-urinalise-pdf'

// Gera o PDF da urinálise APENAS para pré-visualização: não salva arquivo nem
// insere em `laudos`.
export async function POST(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const session = await parseSystemSession(cookie)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  let body: { laudo: UrinaliseEntrada }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const { laudo } = body
  if (!laudo?.nome_pet || !laudo?.especie || !laudo?.valores) {
    return NextResponse.json({ error: 'Dados insuficientes para a prévia.' }, { status: 400 })
  }

  try {
    const { pdf } = await gerarLaudoUrinalise({ ...laudo, fisico: laudo.fisico ?? {}, sedimento: laudo.sedimento ?? {}, observacoes: laudo.observacoes ?? '' })
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': 'inline; filename="previa_urinalise.pdf"',
        'Cache-Control':       'private, no-store',
      },
    })
  } catch (err) {
    console.error('[preview-urinalise] erro:', err)
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    return NextResponse.json({ error: `Falha ao gerar a prévia: ${msg}` }, { status: 500 })
  }
}
