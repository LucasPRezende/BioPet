import { NextRequest, NextResponse } from 'next/server'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { cotarFretePedido } from '@/lib/lab-frete'

async function requireAuth(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return null
  return parseSystemSession(cookie)
}

// Cota o frete de cada lab presente no pedido (origem BioPet -> destino do lab).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(request)
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { id } = await params
  const pedidoId = parseInt(id)
  if (isNaN(pedidoId)) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })

  try {
    const cotacoes = await cotarFretePedido(pedidoId)
    return NextResponse.json(cotacoes)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro ao cotar frete.' }, { status: 500 })
  }
}
