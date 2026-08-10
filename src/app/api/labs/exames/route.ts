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

// Catálogo completo (labs + exames). O filtro fino é feito no front — o
// catálogo inteiro tem ~530 linhas, mesmo padrão de /api/comissoes.
export async function GET(request: NextRequest) {
  const session = await requireAuth(request)
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const [labs, exames] = await Promise.all([
    supabase.from('lab_laboratorios').select('*').order('nome'),
    supabase.from('lab_exames').select('*').order('categoria').order('nome'),
  ])
  if (labs.error) return NextResponse.json({ error: labs.error.message }, { status: 500 })
  if (exames.error) return NextResponse.json({ error: exames.error.message }, { status: 500 })

  return NextResponse.json({ laboratorios: labs.data, exames: exames.data })
}

// Salvar alterações em lote (preço parceiro, ativo etc.)
export async function PUT(request: NextRequest) {
  const adminSession = await requireAdmin(request)
  if (!adminSession) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  let body: {
    id: number
    preco_parceiro?: number | null
    custo?: number | null
    preco_cliente?: number | null
    prazo_dias_uteis?: number | null
    cor_tubo?: string | null
    material_tipo?: string | null
    ativo?: boolean
    sob_consulta?: boolean
    is_combo?: boolean
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
    const { error } = await supabase.from('lab_exames').update(campos).eq('id', id)
    if (error) errors.push(`#${id}: ${error.message}`)
  }
  if (errors.length > 0) return NextResponse.json({ error: errors.join('; ') }, { status: 500 })

  return NextResponse.json({ success: true })
}
