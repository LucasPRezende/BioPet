import { NextRequest, NextResponse } from 'next/server'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { custoRealPedido } from '@/lib/lab-estoque'

async function requireAuth(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return null
  return parseSystemSession(cookie)
}

// Custo real = custo_lab dos itens + valor_frete + insumos consumidos (tubo + kit de caixa).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(request)
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { id } = await params
  const pedidoId = parseInt(id)
  if (isNaN(pedidoId)) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })

  try {
    const custo = await custoRealPedido(pedidoId)
    return NextResponse.json(custo)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro ao calcular custo real.' }, { status: 500 })
  }
}
