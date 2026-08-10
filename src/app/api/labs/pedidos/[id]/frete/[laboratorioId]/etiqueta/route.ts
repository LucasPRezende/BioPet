import { NextRequest, NextResponse } from 'next/server'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { lerEtiquetaFrete } from '@/lib/etiqueta-frete-storage'

async function requireAuth(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return null
  return parseSystemSession(cookie)
}

// Serve o PDF da etiqueta de postagem já reformatado pra 100x150mm — ver
// lab-frete.ts (a URL assinada da Melhor Envio expira em ~30min, por isso
// baixamos e guardamos o nosso próprio arquivo no momento da compra).
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

  const buffer = await lerEtiquetaFrete(pedidoId, labId)
  if (!buffer) return NextResponse.json({ error: 'Etiqueta não encontrada.' }, { status: 404 })

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `inline; filename="etiqueta-pedido-${pedidoId}-lab-${labId}.pdf"`,
      'Cache-Control':       'private, no-store',
    },
  })
}
