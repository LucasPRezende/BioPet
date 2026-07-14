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

// GET — público para clínicas/agente; admin vê todos (incluindo inativos)
export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  let isAdmin = false
  if (cookie) {
    const session = await parseSystemSession(cookie)
    isAdmin = session?.role === 'admin'
  }

  let query = supabase
    .from('testes_rapidos')
    .select('id, nome, descricao, material_padrao, metodo_padrao, observacao_padrao, preco_pix, preco_cartao, comissao, ativo, ordem')
    .order('ordem', { ascending: true })

  if (!isAdmin) {
    query = query.eq('ativo', true)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST — autenticado admin, cria novo teste rápido
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const { nome, descricao, material_padrao, metodo_padrao, observacao_padrao,
          preco_pix, preco_cartao, comissao, ordem } = body ?? {}

  if (!nome?.trim()) return NextResponse.json({ error: 'Nome é obrigatório.' }, { status: 400 })

  const { data, error } = await supabase
    .from('testes_rapidos')
    .insert({
      nome:              nome.trim(),
      descricao:         descricao?.trim() || null,
      material_padrao:   material_padrao?.trim() || null,
      metodo_padrao:     metodo_padrao?.trim() || null,
      observacao_padrao: observacao_padrao?.trim() || null,
      preco_pix:         Number(preco_pix)    || 0,
      preco_cartao:      Number(preco_cartao) || 0,
      comissao:          Number(comissao)     || 0,
      ordem:             Number(ordem)        || 0,
      ativo:             true,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
