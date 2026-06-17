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

// GET — resumo das comissões de laudo por pessoa no período (a pagar e pago)
export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const inicio = request.nextUrl.searchParams.get('inicio')
  const fim    = request.nextUrl.searchParams.get('fim')
  if (!inicio || !fim) {
    return NextResponse.json({ error: 'inicio e fim são obrigatórios.' }, { status: 400 })
  }

  const { data: laudos, error } = await supabase
    .from('laudos')
    .select('system_user_id, valor_comissao, comissao_paga, system_users(nome, recebe_comissao)')
    .gte('criado_em', `${inicio}T00:00:00`)
    .lte('criado_em', `${fim}T23:59:59`)
    .not('system_user_id', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const map = new Map<number, { usuario_id: number; nome: string; a_pagar: number; pago: number; qtd_a_pagar: number }>()
  for (const l of laudos ?? []) {
    const uid = l.system_user_id as number
    const suRaw = l.system_users as unknown
    const su = (Array.isArray(suRaw) ? suRaw[0] : suRaw) as { nome: string; recebe_comissao: boolean } | null
    if (!su || su.recebe_comissao === false) continue // só quem recebe comissão
    const com = Number(l.valor_comissao ?? 0)
    if (com <= 0) continue
    if (!map.has(uid)) map.set(uid, { usuario_id: uid, nome: su.nome, a_pagar: 0, pago: 0, qtd_a_pagar: 0 })
    const e = map.get(uid)!
    if (l.comissao_paga) e.pago += com
    else { e.a_pagar += com; e.qtd_a_pagar++ }
  }

  const laudo_por_usuario = Array.from(map.values()).sort((a, b) => b.a_pagar - a.a_pagar)

  return NextResponse.json({ laudo_por_usuario })
}

// PATCH — marca como paga a comissão de laudo de um usuário no período (lote)
export async function PATCH(request: NextRequest) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const usuarioId = Number(body?.usuario_id)
  const inicio = body?.inicio as string
  const fim    = body?.fim as string
  const pago   = body?.pago !== false // default true; permite desmarcar com pago:false

  if (!usuarioId || !inicio || !fim) {
    return NextResponse.json({ error: 'usuario_id, inicio e fim são obrigatórios.' }, { status: 400 })
  }

  const { error } = await supabase
    .from('laudos')
    .update({ comissao_paga: pago, comissao_paga_em: pago ? new Date().toISOString() : null })
    .eq('system_user_id', usuarioId)
    .eq('comissao_paga', !pago)
    .gte('criado_em', `${inicio}T00:00:00`)
    .lte('criado_em', `${fim}T23:59:59`)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
