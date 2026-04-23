import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso restrito.' }, { status: 403 })
  }

  const { id } = await params
  const refId = parseInt(id)
  if (isNaN(refId)) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })

  const body = await request.json()
  const updates: Record<string, unknown> = {}
  if (body.metodo     !== undefined) updates.metodo     = body.metodo
  if (body.valor_min  !== undefined) updates.valor_min  = body.valor_min
  if (body.valor_max  !== undefined) updates.valor_max  = body.valor_max
  if (body.unidade    !== undefined) updates.unidade    = body.unidade
  if (body.observacao !== undefined) updates.observacao = body.observacao

  const { data, error } = await supabase
    .from('bioquimica_referencia')
    .update(updates)
    .eq('id', refId)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso restrito.' }, { status: 403 })
  }

  const { id } = await params
  const refId = parseInt(id)
  if (isNaN(refId)) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })

  const { error } = await supabase.from('bioquimica_referencia').delete().eq('id', refId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ sucesso: true })
}
