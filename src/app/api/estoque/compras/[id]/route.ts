import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

async function requireAdmin(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return null
  const session = await parseSystemSession(cookie)
  if (!session || session.role !== 'admin') return null
  return session
}

// PATCH — corrige dados que não mexem no custo (fornecedor, validade, observação)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const { id } = await params
  const compraId = parseInt(id)
  if (!compraId) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })

  const body = await request.json().catch(() => null)
  const { fornecedor, validade, observacao } = body ?? {}
  const updates: Record<string, unknown> = {}
  if (fornecedor !== undefined) updates.fornecedor = fornecedor?.trim() || null
  if (validade   !== undefined) updates.validade   = validade || null
  if (observacao !== undefined) updates.observacao = observacao?.trim() || null

  const { error } = await supabase.from('consumivel_compras').update(updates).eq('id', compraId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// DELETE — só apaga compra lançada errado que ainda não foi usada (saldo cheio).
// Depois que alguma unidade saiu dela, o custo já foi para laudos.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const { id } = await params
  const compraId = parseInt(id)
  if (!compraId) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })

  const { data: compra } = await supabase
    .from('consumivel_compras').select('quantidade, saldo').eq('id', compraId).maybeSingle()
  if (!compra) return NextResponse.json({ error: 'Compra não encontrada.' }, { status: 404 })
  if (compra.saldo !== compra.quantidade) {
    return NextResponse.json({ error: 'Esta compra já foi usada em laudos/baixas e não pode ser excluída.' }, { status: 409 })
  }

  // Condição repetida no DELETE: se uma emissão tirou do lote entre a leitura e
  // aqui, nada é apagado.
  const { data: apagadas, error } = await supabase
    .from('consumivel_compras').delete().eq('id', compraId).eq('saldo', compra.quantidade).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!apagadas?.length) {
    return NextResponse.json({ error: 'Esta compra acabou de ser usada e não pode mais ser excluída.' }, { status: 409 })
  }
  return NextResponse.json({ success: true })
}
