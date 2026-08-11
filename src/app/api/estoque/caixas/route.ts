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

  const { data, error } = await supabase.from('caixa_preset').select('*').order('nome')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const adminSession = await requireAdmin(request)
  if (!adminSession) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  let body: {
    nome?: string; altura_cm?: number; largura_cm?: number; comprimento_cm?: number
    peso_kg?: number; kit_json?: { insumo_id: number; quantidade: number }[]
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })
  }

  const nome = body.nome?.trim()
  if (!nome) return NextResponse.json({ error: 'Nome é obrigatório.' }, { status: 400 })

  const { data, error } = await supabase
    .from('caixa_preset')
    .insert({
      nome,
      altura_cm:      body.altura_cm      ?? 0,
      largura_cm:     body.largura_cm     ?? 0,
      comprimento_cm: body.comprimento_cm ?? 0,
      peso_kg:        body.peso_kg        ?? 0,
      kit_json:       body.kit_json       ?? [],
    })
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Já existe uma caixa com esse nome.' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}

export async function PUT(request: NextRequest) {
  const adminSession = await requireAdmin(request)
  if (!adminSession) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  let body: {
    id: number
    nome?: string; altura_cm?: number; largura_cm?: number; comprimento_cm?: number
    peso_kg?: number; kit_json?: { insumo_id: number; quantidade: number }[]; ativo?: boolean
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
    const { error } = await supabase.from('caixa_preset').update(campos).eq('id', id)
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

  const { error } = await supabase.from('caixa_preset').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
