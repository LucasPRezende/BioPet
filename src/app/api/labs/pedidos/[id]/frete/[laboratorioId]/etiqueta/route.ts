import { NextRequest, NextResponse } from 'next/server'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { obterEtiquetaFrete } from '@/lib/lab-frete'

async function requireAuth(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return null
  return parseSystemSession(cookie)
}

// Serve o PDF da etiqueta de postagem já reformatado pra 100x150mm — ver
// lab-frete.ts. Se a Melhor Envio ainda não terminou de gerar (assíncrono,
// pode demorar bem mais que alguns segundos no sandbox), devolve 202 em vez
// de travar a resposta — quem abriu o link tenta de novo em instantes.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; laboratorioId: string }> },
) {
  const session = await requireAuth(request)
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { id, laboratorioId } = await params
  const pedidoId = parseInt(id)
  const labId    = parseInt(laboratorioId)
  if (isNaN(pedidoId) || isNaN(labId)) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })

  let buffer: Buffer | null
  try {
    buffer = await obterEtiquetaFrete(pedidoId, labId)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro ao buscar etiqueta.' }, { status: 500 })
  }
  if (!buffer) {
    return NextResponse.json(
      { error: 'A etiqueta ainda está sendo gerada pela Melhor Envio — tente abrir de novo em alguns segundos.' },
      { status: 202 },
    )
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `inline; filename="etiqueta-pedido-${pedidoId}-lab-${labId}.pdf"`,
      'Cache-Control':       'private, no-store',
    },
  })
}
