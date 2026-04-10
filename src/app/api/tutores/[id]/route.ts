import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

async function requireSession(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return null
  return parseSystemSession(cookie)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession(request)
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { id } = await params
  const tutorId = parseInt(id)
  if (isNaN(tutorId)) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })

  const body = await request.json()
  const updates: Record<string, string | null> = {}

  if (body.nome !== undefined) updates.nome = body.nome?.trim() || null
  if (body.telefone !== undefined) {
    const digits = body.telefone.replace(/\D/g, '')
    updates.telefone = digits.startsWith('55') ? digits : `55${digits}`
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nada para atualizar.' }, { status: 400 })
  }

  updates.atualizado_em = new Date().toISOString()

  const { data, error } = await supabase
    .from('tutores')
    .update(updates)
    .eq('id', tutorId)
    .select('*, pets(id, nome, especie, raca), agendamentos(id)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
