import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

export async function GET(request: NextRequest) {
  const especie      = request.nextUrl.searchParams.get('especie') ?? ''
  const faixa_etaria = request.nextUrl.searchParams.get('faixa_etaria') ?? 'todos'

  // Busca referências para espécie + faixa etária específica; se não achar, tenta 'todos'
  const { data: refs } = await supabase
    .from('bioquimica_referencia')
    .select('id, bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade, observacao, bioquimica_exames(id, nome, codigo)')
    .eq('especie', especie)
    .in('faixa_etaria', faixa_etaria !== 'todos' ? [faixa_etaria, 'todos'] : ['todos'])
    .order('bioquimica_exame_id')

  // Para cada exame+método, preferir a faixa específica sobre 'todos'
  const byExameMetodo = new Map<string, typeof refs extends (infer T)[] | null ? T : never>()
  for (const r of refs ?? []) {
    const key = `${r.bioquimica_exame_id}:${r.metodo ?? ''}`
    const existing = byExameMetodo.get(key)
    if (!existing || (r.faixa_etaria === faixa_etaria && existing.faixa_etaria === 'todos')) {
      byExameMetodo.set(key, r)
    }
  }

  const referencias = Array.from(byExameMetodo.values()).map(r => ({
    id:           r.id,
    exame_id:     r.bioquimica_exame_id,
    codigo:       (r.bioquimica_exames as unknown as { codigo: string } | null)?.codigo ?? '',
    nome:         (r.bioquimica_exames as unknown as { nome: string } | null)?.nome ?? '',
    faixa_etaria: r.faixa_etaria,
    metodo:       r.metodo ?? '',
    valor_min:    r.valor_min,
    valor_max:    r.valor_max,
    unidade:      r.unidade,
    observacao:   r.observacao,
  }))

  return NextResponse.json({ especie, faixa_etaria, referencias })
}

export async function POST(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso restrito.' }, { status: 403 })
  }

  const body = await request.json()
  const { bioquimica_exame_id, especie, faixa_etaria, metodo, valor_min, valor_max, unidade, observacao } = body

  if (!bioquimica_exame_id || !especie || !faixa_etaria) {
    return NextResponse.json({ error: 'exame_id, especie e faixa_etaria são obrigatórios.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('bioquimica_referencia')
    .insert({ bioquimica_exame_id, especie, faixa_etaria, metodo: metodo ?? '', valor_min, valor_max, unidade, observacao })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
