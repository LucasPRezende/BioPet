import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { PARAMETROS_URINA } from '@/lib/urinalise'

// Referências da parte química da urinálise de uma espécie (formato de
// referência: "cao", "gato"...). Tela de edição: /admin/urinalise/referencias.
export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  const especie = request.nextUrl.searchParams.get('especie') ?? ''
  const { data, error } = await supabase
    .from('urinalise_referencia')
    .select('parametro, valor_min, valor_max')
    .eq('especie', especie)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ especie, referencias: data ?? [] })
}

// Grava o conjunto de referências de uma espécie. Parâmetro sem mínimo e sem
// máximo é removido (o laudo mostra "—" e não marca alterado).
export async function PUT(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso restrito.' }, { status: 403 })
  }

  let body: {
    especie:     string
    referencias: { parametro: string; valor_min: number | null; valor_max: number | null }[]
  }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const { especie } = body
  if (!especie || !Array.isArray(body.referencias)) {
    return NextResponse.json({ error: 'especie e referencias são obrigatórios.' }, { status: 400 })
  }

  const validos = new Set(PARAMETROS_URINA.map(p => p.codigo))
  const num = (v: unknown) => (v === null || v === undefined || v === '' || isNaN(Number(v))) ? null : Number(v)
  const linhas = body.referencias
    .filter(r => validos.has(r.parametro))
    .map(r => ({ parametro: r.parametro, especie, valor_min: num(r.valor_min), valor_max: num(r.valor_max) }))

  const preenchidas = linhas.filter(r => r.valor_min !== null || r.valor_max !== null)
  const vazias      = linhas.filter(r => r.valor_min === null && r.valor_max === null).map(r => r.parametro)

  if (preenchidas.length) {
    const { error } = await supabase
      .from('urinalise_referencia')
      .upsert(preenchidas, { onConflict: 'parametro,especie' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (vazias.length) {
    const { error } = await supabase
      .from('urinalise_referencia')
      .delete()
      .eq('especie', especie)
      .in('parametro', vazias)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
