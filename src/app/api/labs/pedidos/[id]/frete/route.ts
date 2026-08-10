import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

async function requireAuth(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return null
  return parseSystemSession(cookie)
}

// Lista os envios (frete) já comprados/cotados desse pedido, um por lab.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(request)
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { id } = await params
  const pedidoId = parseInt(id)
  if (isNaN(pedidoId)) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })

  const { data, error } = await supabase
    .from('pedido_lab_envio')
    .select('*, lab_laboratorios(nome)')
    .eq('pedido_id', pedidoId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
