import { NextRequest, NextResponse } from 'next/server'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { generateTesteRapidoPDF, type TesteRapidoPDFData } from '@/lib/generate-teste-rapido-pdf'

// Gera o PDF do laudo de teste rápido APENAS para pré-visualização:
// não salva arquivo, não insere em `laudos`, não envia nada. Devolve os bytes.
export async function POST(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const session = await parseSystemSession(cookie)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  let body: { pdfData: TesteRapidoPDFData }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const { pdfData } = body
  if (!pdfData?.nome_pet || !pdfData?.resultados?.length) {
    return NextResponse.json({ error: 'Dados insuficientes para a prévia.' }, { status: 400 })
  }

  try {
    const pdfBuffer = await generateTesteRapidoPDF(pdfData)
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type':  'application/pdf',
        'Content-Disposition': 'inline; filename="previa_teste_rapido.pdf"',
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (err) {
    console.error('[preview-teste-rapido] erro:', err)
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    return NextResponse.json({ error: `Falha ao gerar a prévia: ${msg}` }, { status: 500 })
  }
}
