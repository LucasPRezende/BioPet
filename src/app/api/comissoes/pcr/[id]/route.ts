import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { registrarHistorico } from '@/lib/historico-precos'

async function requireAdmin(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return null
  const session = await parseSystemSession(cookie)
  if (!session || session.role !== 'admin') return null
  return session
}

// PATCH — atualiza campos do exame de PCR
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const { id } = await params
  const pcrId = parseInt(id)
  if (!pcrId) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })

  const body = await request.json().catch(() => null)
  const { nome, codigo, descricao, material_padrao, metodo_padrao, observacao_padrao,
          analitos, preco_pix, preco_cartao, comissao, ativo, ordem } = body ?? {}

  const updates: Record<string, unknown> = {}
  if (nome              !== undefined) updates.nome              = nome?.trim()
  if (codigo            !== undefined) updates.codigo            = codigo?.trim() || null
  if (descricao         !== undefined) updates.descricao         = descricao?.trim() || null
  if (material_padrao   !== undefined) updates.material_padrao   = material_padrao?.trim() || null
  if (metodo_padrao     !== undefined) updates.metodo_padrao     = metodo_padrao?.trim() || null
  if (observacao_padrao !== undefined) updates.observacao_padrao = observacao_padrao?.trim() || null
  if (analitos          !== undefined) {
    const norm = Array.isArray(analitos) ? analitos.map((a: string) => String(a).trim()).filter(Boolean) : null
    updates.analitos = norm && norm.length > 0 ? norm : null
  }
  if (preco_pix         !== undefined) updates.preco_pix         = Number(preco_pix)
  if (preco_cartao      !== undefined) updates.preco_cartao      = Number(preco_cartao)
  if (comissao          !== undefined) updates.comissao          = Number(comissao)
  if (ativo             !== undefined) updates.ativo             = Boolean(ativo)
  if (ordem             !== undefined) updates.ordem             = Number(ordem)

  const { data, error } = await supabase
    .from('exames_pcr')
    .update(updates)
    .eq('id', pcrId)
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
  const pcrId = parseInt(id)
  if (!pcrId) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })

  const { error } = await supabase
    .from('exames_pcr')
    .update({ ativo: false })
    .eq('id', pcrId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await registrarHistorico([{ tabela: 'exames_pcr', registro_id: pcrId, campo: 'ativo', antes: true, depois: false }], admin.userId)
  return NextResponse.json({ success: true })
}
