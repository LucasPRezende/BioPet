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

  const { data, error } = await supabase
    .from('comissoes_exame')
    .select('*')
    .order('tipo_exame', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// Criar novo tipo de exame
export async function POST(request: NextRequest) {
  const adminSession = await requireAdmin(request)
  if (!adminSession) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  let body: { tipo_exame?: string; preco_exame?: number; custo_exame?: number; valor_comissao?: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })
  }

  const tipo = body.tipo_exame?.trim()
  if (!tipo) return NextResponse.json({ error: 'Nome do tipo é obrigatório.' }, { status: 400 })

  const { data, error } = await supabase
    .from('comissoes_exame')
    .insert({
      tipo_exame:     tipo,
      preco_exame:    body.preco_exame    ?? 0,
      custo_exame:    body.custo_exame    ?? 0,
      valor_comissao: body.valor_comissao ?? 0,
    })
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Tipo já existe.' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}

// Salvar alterações em lote
export async function PUT(request: NextRequest) {
  const adminSession = await requireAdmin(request)
  if (!adminSession) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  let body: {
    id: number
    preco_exame: number; custo_exame: number; valor_comissao: number
    varia_por_horario?: boolean
    preco_pix_comercial?: number | null; preco_cartao_comercial?: number | null
    preco_pix_fora_horario?: number | null; preco_cartao_fora_horario?: number | null
    duracao_minutos?: number | null; observacao?: string | null
  }[]
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })
  }

  if (!Array.isArray(body)) return NextResponse.json({ error: 'Esperado array.' }, { status: 400 })

  const errors: string[] = []
  for (const item of body) {
    const { error } = await supabase
      .from('comissoes_exame')
      .update({
        preco_exame:               item.preco_exame,
        custo_exame:               item.custo_exame,
        valor_comissao:            item.valor_comissao,
        varia_por_horario:         item.varia_por_horario         ?? false,
        preco_pix_comercial:       item.preco_pix_comercial       ?? null,
        preco_cartao_comercial:    item.preco_cartao_comercial    ?? null,
        preco_pix_fora_horario:    item.preco_pix_fora_horario    ?? null,
        preco_cartao_fora_horario: item.preco_cartao_fora_horario ?? null,
        duracao_minutos:           item.duracao_minutos           ?? null,
        observacao:                item.observacao                ?? null,
      })
      .eq('id', item.id)
    if (error) errors.push(error.message)
  }

  if (errors.length > 0) return NextResponse.json({ error: errors.join('; ') }, { status: 500 })

  const { data } = await supabase
    .from('comissoes_exame')
    .select('*')
    .order('tipo_exame', { ascending: true })

  return NextResponse.json(data)
}

// Deletar tipo de exame
export async function DELETE(request: NextRequest) {
  const adminSession = await requireAdmin(request)
  if (!adminSession) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const id = parseInt(searchParams.get('id') ?? '')
  if (!id) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })

  const { error } = await supabase.from('comissoes_exame').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
