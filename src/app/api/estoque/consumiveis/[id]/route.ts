import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { vincularTestes, vincularPcrs } from '../vincular'

async function requireAdmin(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return null
  const session = await parseSystemSession(cookie)
  if (!session || session.role !== 'admin') return null
  return session
}

// PATCH — edita nome/unidade/estoque mínimo/ativo e o vínculo com os testes
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const { id } = await params
  const consumivelId = parseInt(id)
  if (!consumivelId) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })

  const body = await request.json().catch(() => null)
  const { nome, unidade, categoria, codigo, extrator_pcr, estoque_minimo, ativo, testes_ids, pcrs_ids } = body ?? {}

  const updates: Record<string, unknown> = {}
  if (nome !== undefined) {
    if (!String(nome).trim()) return NextResponse.json({ error: 'Nome é obrigatório.' }, { status: 400 })
    updates.nome = String(nome).trim()
  }
  if (unidade        !== undefined) updates.unidade        = String(unidade).trim() || 'un'
  if (categoria      !== undefined) updates.categoria      = String(categoria).trim() || 'outro'
  if (codigo         !== undefined) updates.codigo         = String(codigo ?? '').trim() || null
  if (estoque_minimo !== undefined) updates.estoque_minimo = Math.max(0, Math.floor(Number(estoque_minimo) || 0))
  if (ativo          !== undefined) updates.ativo          = Boolean(ativo)

  if (extrator_pcr   !== undefined) updates.extrator_pcr   = extrator_pcr === true

  // Só um extrator: marcar este desmarca o anterior
  if (updates.extrator_pcr === true) {
    const { error: eExt } = await supabase
      .from('consumiveis').update({ extrator_pcr: false }).eq('extrator_pcr', true).neq('id', consumivelId)
    if (eExt) return NextResponse.json({ error: eExt.message }, { status: 500 })
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase.from('consumiveis').update(updates).eq('id', consumivelId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Consumível desativado não pode continuar dando baixa pelos exames
  const vinculoTestes = ativo === false ? [] : testes_ids
  if (Array.isArray(vinculoTestes)) {
    const err = await vincularTestes(consumivelId, vinculoTestes)
    if (err) return NextResponse.json({ error: err }, { status: 500 })
  }
  const vinculoPcrs = ativo === false ? [] : pcrs_ids
  if (Array.isArray(vinculoPcrs)) {
    const err = await vincularPcrs(consumivelId, vinculoPcrs)
    if (err) return NextResponse.json({ error: err }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
