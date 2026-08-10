import { NextRequest, NextResponse } from 'next/server'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { comprarFretePedido } from '@/lib/lab-frete'

async function requireAuth(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return null
  return parseSystemSession(cookie)
}

// Compra o frete escolhido pra um lab do pedido: carrinho -> checkout ->
// gera etiqueta -> imprime. Debita saldo real da conta Melhor Envio (sandbox
// usa saldo fake). Admin only -- é dinheiro saindo da conta da BioPet.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(request)
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const { id } = await params
  const pedidoId = parseInt(id)
  if (isNaN(pedidoId)) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })

  const body = await request.json().catch(() => null)
  const laboratorioId = Number(body?.laboratorio_id)
  const serviceId     = Number(body?.service_id)
  if (!laboratorioId || !serviceId) {
    return NextResponse.json({ error: 'Informe laboratorio_id e service_id.' }, { status: 400 })
  }

  try {
    await comprarFretePedido(pedidoId, laboratorioId, serviceId)
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro ao comprar frete.' }, { status: 500 })
  }
}
