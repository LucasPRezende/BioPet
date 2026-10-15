import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { PARAMETROS_HEMOGRAMA } from '@/lib/hemograma'

// Referências do hemograma de uma espécie + faixa etária exata (sem fallback:
// é a tela de edição). Espécie no formato de referência ("cao", "gato"...).
export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  const especie      = request.nextUrl.searchParams.get('especie') ?? ''
  const faixa_etaria = request.nextUrl.searchParams.get('faixa_etaria') ?? 'todos'

  const { data, error } = await supabase
    .from('hemograma_referencia')
    .select('parametro, valor_min, valor_max')
    .eq('especie', especie)
    .eq('faixa_etaria', faixa_etaria)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ especie, faixa_etaria, referencias: data ?? [] })
}

// Grava o conjunto de referências de uma espécie + faixa. Parâmetro sem mínimo
// e sem máximo é removido (o laudo mostra "—").
export async function PUT(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso restrito.' }, { status: 403 })
  }

  let body: {
    especie:      string
    faixa_etaria: string
    referencias:  { parametro: string; valor_min: number | null; valor_max: number | null }[]
  }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const { especie, faixa_etaria } = body
  if (!especie || !faixa_etaria || !Array.isArray(body.referencias)) {
    return NextResponse.json({ error: 'especie, faixa_etaria e referencias são obrigatórios.' }, { status: 400 })
  }

  const validos = new Set(PARAMETROS_HEMOGRAMA.map(p => p.codigo))
  const num = (v: unknown) => (v === null || v === undefined || v === '' || isNaN(Number(v))) ? null : Number(v)
  const linhas = body.referencias
    .filter(r => validos.has(r.parametro))
    .map(r => ({ parametro: r.parametro, especie, faixa_etaria, valor_min: num(r.valor_min), valor_max: num(r.valor_max) }))

  const preenchidas = linhas.filter(r => r.valor_min !== null || r.valor_max !== null)
  const vazias      = linhas.filter(r => r.valor_min === null && r.valor_max === null).map(r => r.parametro)

  if (preenchidas.length) {
    const { error } = await supabase
      .from('hemograma_referencia')
      .upsert(preenchidas, { onConflict: 'parametro,especie,faixa_etaria' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (vazias.length) {
    const { error } = await supabase
      .from('hemograma_referencia')
      .delete()
      .eq('especie', especie)
      .eq('faixa_etaria', faixa_etaria)
      .in('parametro', vazias)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
