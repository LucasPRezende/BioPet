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
  if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const { id } = await params
  const vetId = parseInt(id)
  if (isNaN(vetId)) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })

  const body = await request.json()
  const updates: Record<string, string | null> = {}

  if (body.nome !== undefined)     updates.nome     = body.nome?.trim() || null
  if (body.whatsapp !== undefined) {
    const digits = String(body.whatsapp ?? '').replace(/\D/g, '')
    updates.whatsapp = digits ? (digits.startsWith('55') ? digits : `55${digits}`) : null
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nenhum campo para atualizar.' }, { status: 400 })
  }

  // Checa unicidade de whatsapp
  if (updates.whatsapp) {
    const { data: exist } = await supabase
      .from('veterinarios')
      .select('id')
      .eq('whatsapp', updates.whatsapp)
      .neq('id', vetId)
      .maybeSingle()
    if (exist) return NextResponse.json({ error: 'Este WhatsApp já está em uso por outro veterinário.' }, { status: 409 })
  }

  updates.atualizado_em = new Date().toISOString()

  const { data, error } = await supabase
    .from('veterinarios')
    .update(updates)
    .eq('id', vetId)
    .select('id, nome, email, whatsapp, convite_aceito, criado_em')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
