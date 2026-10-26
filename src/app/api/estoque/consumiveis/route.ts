import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { vincularTestes, vincularPcrs } from './vincular'

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
  const { nome, unidade, categoria, codigo, extrator_pcr, estoque_minimo, testes_ids, pcrs_ids } = body ?? {}
  if (!nome?.trim()) return NextResponse.json({ error: 'Nome é obrigatório.' }, { status: 400 })

  // Só um extrator: marcar este desmarca o anterior
  if (extrator_pcr === true) {
    const { error: eExt } = await supabase.from('consumiveis').update({ extrator_pcr: false }).eq('extrator_pcr', true)
    if (eExt) return NextResponse.json({ error: eExt.message }, { status: 500 })
  }

  const { data, error } = await supabase
    .from('consumiveis')
    .insert({
      nome:           nome.trim(),
      unidade:        unidade?.trim() || 'un',
      categoria:      categoria?.trim() || 'outro',
      codigo:         codigo?.trim() || null,
      extrator_pcr:   extrator_pcr === true,
      estoque_minimo: Math.max(0, Math.floor(Number(estoque_minimo) || 0)),
    })
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (Array.isArray(testes_ids)) {
    const err = await vincularTestes(data.id, testes_ids)
    if (err) return NextResponse.json({ error: err }, { status: 500 })
  }
  if (Array.isArray(pcrs_ids)) {
    const err = await vincularPcrs(data.id, pcrs_ids)
    if (err) return NextResponse.json({ error: err }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}
