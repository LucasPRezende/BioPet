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

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const adminSession = await requireAdmin(request)
  if (!adminSession) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const id = parseInt(params.id)
  if (!id) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })

  let body: {
    nome?: string
    email?: string
    role?: string
    ativo?: boolean
    recebe_comissao?: boolean
    reset_senha?: string
    permissoes?: Record<string, unknown>
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = {}

  if (body.nome !== undefined) updates.nome = body.nome.trim()
  if (body.email !== undefined) updates.email = body.email.toLowerCase().trim()
  if (body.role !== undefined) {
    if (body.role !== 'admin' && body.role !== 'user') {
      return NextResponse.json({ error: 'Role inválido.' }, { status: 400 })
    }
    updates.role = body.role
  }
  if (body.ativo !== undefined) updates.ativo = body.ativo
  if (body.recebe_comissao !== undefined) updates.recebe_comissao = body.recebe_comissao
  if (body.permissoes !== undefined) updates.permissoes = body.permissoes

  // Reset de senha pelo admin
  if (body.reset_senha !== undefined) {
    if (body.reset_senha.length < 6) {
      return NextResponse.json({ error: 'Senha deve ter ao menos 6 caracteres.' }, { status: 400 })
    }
    updates.senha_hash = await hashPassword(body.reset_senha)
    updates.primeira_senha = true
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nenhum campo para atualizar.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('system_users')
    .update(updates)
    .eq('id', id)
    .select('id, nome, email, role, ativo, primeira_senha, recebe_comissao, permissoes, criado_em')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'E-mail já cadastrado.' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
