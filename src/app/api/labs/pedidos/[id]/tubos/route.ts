import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { consolidarTubos, resumoTubos } from '@/lib/lab-tubos'

async function requireAuth(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return null
  return parseSystemSession(cookie)
}

// Consolidação de tubos/recipientes do pedido — instrução de coleta (Fase 3).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(request)
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { id } = await params
  const pedidoId = parseInt(id)
  if (isNaN(pedidoId)) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })

  const { data: itens, error } = await supabase
    .from('pedido_lab_item')
    .select('nome, cor_tubo, material_tipo, material_volume_ml')
    .eq('pedido_id', pedidoId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!itens || itens.length === 0) return NextResponse.json({ error: 'Pedido não encontrado ou sem itens.' }, { status: 404 })

  const grupos = consolidarTubos(itens)
  return NextResponse.json({ grupos, resumo: resumoTubos(grupos) })
}
