import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { normalizarCorTubo } from '@/lib/lab-tubos'

// Configuração de como Labs Parceiros gasta o estoque de consumíveis:
// qual consumível (categoria 'tubo') é o tubo de cada cor, e o kit de cada
// caixa de envio (caixa_preset.kit_json). O estoque em si (compras, saldo,
// custo) fica em /admin/estoque.

async function requireAdmin(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return null
  const session = await parseSystemSession(cookie)
  if (!session || session.role !== 'admin') return null
  return session
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const [cons, caixas, exames] = await Promise.all([
    supabase.from('consumiveis').select('id, nome, categoria, unidade, cor_tubo').eq('ativo', true).order('nome'),
    supabase.from('caixa_preset').select('*').order('nome'),
    supabase.from('lab_exames').select('cor_tubo').not('cor_tubo', 'is', null),
  ])
  for (const r of [cons, caixas, exames]) {
    if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 })
  }

  // Cores de tubo que aparecem no catálogo, já normalizadas como na consolidação
  const cores = Array.from(new Set((exames.data ?? [])
    .map(e => normalizarCorTubo(e.cor_tubo as string))
    .filter((c): c is string => !!c)))
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))

  return NextResponse.json({ consumiveis: cons.data ?? [], caixas: caixas.data ?? [], cores })
}

// PATCH — [{ id, cor_tubo }]: define a cor de cada consumível de tubo
export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const body = await request.json().catch(() => null)
  if (!Array.isArray(body)) return NextResponse.json({ error: 'Esperado array.' }, { status: 400 })

  for (const item of body as { id: number; cor_tubo: string | null }[]) {
    if (!Number(item.id)) continue
    const { error } = await supabase
      .from('consumiveis')
      .update({ cor_tubo: item.cor_tubo?.trim() || null })
      .eq('id', Number(item.id))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
