import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

async function requireAuth(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return null
  return parseSystemSession(cookie)
}

async function requireAdmin(request: NextRequest) {
  const session = await requireAuth(request)
  if (!session || session.role !== 'admin') return null
  return session
}

export async function GET(request: NextRequest) {
  const session = await requireAuth(request)
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data, error } = await supabase.from('insumos').select('*').order('tipo').order('nome')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// Cria novo insumo
export async function POST(request: NextRequest) {
  const adminSession = await requireAdmin(request)
  if (!adminSession) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  let body: {
    nome?: string; tipo?: string; cor_tubo?: string | null; unidade?: string
    custo_unitario?: number; estoque_atual?: number; estoque_minimo?: number
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })
  }

  const nome = body.nome?.trim()
  const tipo = body.tipo?.trim()
  if (!nome) return NextResponse.json({ error: 'Nome é obrigatório.' }, { status: 400 })
  if (tipo !== 'tubo' && tipo !== 'caixa' && tipo !== 'outro') {
    return NextResponse.json({ error: 'Tipo deve ser tubo, caixa ou outro.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('insumos')
    .insert({
      nome,
      tipo,
      cor_tubo:       tipo === 'tubo' ? (body.cor_tubo?.trim() || null) : null,
      unidade:        body.unidade?.trim() || 'un',
      custo_unitario: body.custo_unitario ?? 0,
      estoque_atual:  body.estoque_atual  ?? 0,
      estoque_minimo: body.estoque_minimo ?? 0,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

// Salvar alterações em lote (custo, mínimo, ativo etc — não estoque_atual, que
// só muda via movimento pra manter o ledger consistente)
export async function PUT(request: NextRequest) {
  const adminSession = await requireAdmin(request)
  if (!adminSession) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  let body: {
    id: number
    nome?: string; cor_tubo?: string | null; unidade?: string
    custo_unitario?: number; estoque_minimo?: number; ativo?: boolean
  }[]
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })
  }
  if (!Array.isArray(body)) return NextResponse.json({ error: 'Esperado array.' }, { status: 400 })

  const errors: string[] = []
  for (const item of body) {
    const { id, ...campos } = item
    if (!id || Object.keys(campos).length === 0) continue
    const { error } = await supabase.from('insumos').update(campos).eq('id', id)
    if (error) errors.push(`#${id}: ${error.message}`)
  }
  if (errors.length > 0) return NextResponse.json({ error: errors.join('; ') }, { status: 500 })

  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest) {
  const adminSession = await requireAdmin(request)
  if (!adminSession) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const id = parseInt(searchParams.get('id') ?? '')
  if (!id) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })

  const { error } = await supabase.from('insumos').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
