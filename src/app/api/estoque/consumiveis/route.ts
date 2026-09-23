import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { vincularTestes } from './vincular'

async function requireAdmin(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return null
  const session = await parseSystemSession(cookie)
  if (!session || session.role !== 'admin') return null
  return session
}

// POST — cadastra um consumível (e opcionalmente os testes que o usam)
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const { nome, unidade, estoque_minimo, testes_ids } = body ?? {}
  if (!nome?.trim()) return NextResponse.json({ error: 'Nome é obrigatório.' }, { status: 400 })

  const { data, error } = await supabase
    .from('consumiveis')
    .insert({
      nome:           nome.trim(),
      unidade:        unidade?.trim() || 'un',
      estoque_minimo: Math.max(0, Math.floor(Number(estoque_minimo) || 0)),
    })
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (Array.isArray(testes_ids)) {
    const err = await vincularTestes(data.id, testes_ids)
    if (err) return NextResponse.json({ error: err }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}
