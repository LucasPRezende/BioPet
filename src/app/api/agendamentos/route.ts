import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const session = await parseSystemSession(cookie)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  const data = request.nextUrl.searchParams.get('data')
    ?? new Date().toLocaleDateString('en-CA')

  const start = `${data}T00:00:00`
  const end   = `${data}T23:59:59`

  let query = supabase
    .from('agendamentos')
    .select('*, tutores(id, nome, telefone), pets(id, nome, especie, raca), system_users(nome), laudos(id, token), clinicas(nome), agendamento_exames(tipo_exame, valor), agendamento_bioquimica(id, valor_pix, valor_cartao, bioquimica_exames(nome, codigo))')
    .gte('data_hora', start)
    .lte('data_hora', end)
    .order('data_hora')

  if (session.role !== 'admin') {
    query = query.eq('system_user_id', session.userId)
  }

  const { data: rows, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const result = rows ?? []

  // Para agendamentos de clínica onde agendamento_exames.valor = 0 (bug legado),
  // enriquecer com o preço PIX de comissoes_exame
  const tiposComValorZero = new Set<string>()
  for (const ag of result) {
    if (!ag.clinica_id) continue
    const exames = (ag as Record<string, unknown>).agendamento_exames as { tipo_exame: string; valor: number | null }[] | null
    if (!exames) continue
    for (const ex of exames) {
      if (!ex.valor || ex.valor === 0) tiposComValorZero.add(ex.tipo_exame)
    }
  }

  if (tiposComValorZero.size > 0) {
    const { data: comissoes } = await supabase
      .from('comissoes_exame')
      .select('tipo_exame, varia_por_horario, preco_exame, preco_pix_comercial')
      .in('tipo_exame', Array.from(tiposComValorZero))

    const precoMap = new Map<string, number>()
    for (const c of comissoes ?? []) {
      const preco = c.varia_por_horario ? (c.preco_pix_comercial ?? 0) : (c.preco_exame ?? 0)
      precoMap.set(c.tipo_exame, preco)
    }

    for (const ag of result) {
      if (!ag.clinica_id) continue
      const exames = (ag as Record<string, unknown>).agendamento_exames as { tipo_exame: string; valor: number | null }[] | null
      if (!exames) continue
      let valorTotal = 0
      for (const ex of exames) {
        if (!ex.valor || ex.valor === 0) {
          ex.valor = precoMap.get(ex.tipo_exame) ?? 0
        }
        valorTotal += ex.valor ?? 0
      }
      // Corrige ag.valor também se estiver nulo/zero
      const agRecord = ag as Record<string, unknown>
      if (!agRecord.valor && valorTotal > 0) {
        agRecord.valor = valorTotal
      }
    }
  }

  return NextResponse.json(result)
}
