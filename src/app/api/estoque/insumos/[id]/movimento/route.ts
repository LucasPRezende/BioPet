import { NextRequest, NextResponse } from 'next/server'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { registrarMovimento } from '@/lib/estoque'

async function requireAdmin(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return null
  const session = await parseSystemSession(cookie)
  if (!session || session.role !== 'admin') return null
  return session
}

// Registro manual de movimento — entrada (compra de insumo) ou ajuste
// (correção de contagem). Saídas normais vêm automáticas da baixa de tubo/kit.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin(request)
  if (!session) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const { id } = await params
  const insumoId = parseInt(id)
  if (isNaN(insumoId)) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })

  const body = await request.json().catch(() => null)
  const tipo = body?.tipo
  const quantidade = Number(body?.quantidade)
  if (tipo !== 'entrada' && tipo !== 'ajuste') {
    return NextResponse.json({ error: 'Tipo deve ser entrada ou ajuste.' }, { status: 400 })
  }
  if (!quantidade || (tipo === 'entrada' && quantidade <= 0)) {
    return NextResponse.json({ error: 'Quantidade inválida.' }, { status: 400 })
  }

  try {
    await registrarMovimento({
      insumoId,
      tipo,
      quantidade,
      custoUnitario: body?.custo_unitario ?? null,
      motivo:        body?.motivo?.trim() || null,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro ao registrar movimento.' }, { status: 500 })
  }

  return NextResponse.json({ success: true }, { status: 201 })
}
