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

// PATCH — atualiza nome, preço, código, ativo, ordem
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const { id } = await params
  const examId = parseInt(id)
  if (!examId) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })

  const body = await request.json().catch(() => null)
  const { nome, codigo, preco_pix, preco_cartao, ativo, ordem } = body ?? {}

  const updates: Record<string, unknown> = {}
  if (nome        !== undefined) updates.nome        = nome?.trim()
  if (codigo      !== undefined) updates.codigo      = codigo?.trim() || null
  if (preco_pix   !== undefined) updates.preco_pix   = Number(preco_pix)
  if (preco_cartao !== undefined) updates.preco_cartao = Number(preco_cartao)
  if (ativo       !== undefined) updates.ativo       = Boolean(ativo)
  if (ordem       !== undefined) updates.ordem       = Number(ordem)

  const { data, error } = await supabase
    .from('bioquimica_exames')
    .update(updates)
    .eq('id', examId)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE — soft delete (ativo = false)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const { id } = await params
  const examId = parseInt(id)
  if (!examId) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })

  const { error } = await supabase
    .from('bioquimica_exames')
    .update({ ativo: false })
    .eq('id', examId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
