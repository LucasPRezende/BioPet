import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { hashPassword } from '@/lib/vet-auth'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

async function requireAdmin(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return null
  const session = await parseSystemSession(cookie)
  if (!session || session.role !== 'admin') return null
  return session
}

export async function GET(request: NextRequest) {
  const session = await requireAdmin(request)
  if (!session) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const { data, error } = await supabase
    .from('system_users')
    .select('id, nome, email, role, ativo, primeira_senha, recebe_comissao, criado_em')
    .order('criado_em', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin(request)
  if (!session) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  let body: { nome?: string; email?: string; senha?: string; role?: string; recebe_comissao?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })
  }

  const nome            = body.nome?.trim()
  const email           = body.email?.toLowerCase().trim()
  const senha           = body.senha
  const role            = body.role ?? 'user'
  const recebeComissao  = body.recebe_comissao ?? true

  if (!nome || !email || !senha) {
    return NextResponse.json({ error: 'Nome, e-mail e senha são obrigatórios.' }, { status: 400 })
  }

  if (senha.length < 6) {
    return NextResponse.json({ error: 'Senha deve ter ao menos 6 caracteres.' }, { status: 400 })
  }

  if (role !== 'admin' && role !== 'user') {
    return NextResponse.json({ error: 'Role inválido.' }, { status: 400 })
  }

  const senhaHash = await hashPassword(senha)

  const { data, error } = await supabase
    .from('system_users')
    .insert({ nome, email, senha_hash: senhaHash, role, ativo: true, primeira_senha: true, recebe_comissao: recebeComissao })
    .select('id, nome, email, role, ativo, primeira_senha, recebe_comissao, criado_em')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'E-mail já cadastrado.' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
