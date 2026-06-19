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
    .select('*, tutores(id, nome, telefone), pets(id, nome, especie, raca), system_users(nome), laudos(id, token, tipo_exame), clinicas(nome), agendamento_exames(tipo_exame, valor, desconto, duracao_minutos, descricao), agendamento_bioquimica(id, valor_pix, valor_cartao, bioquimica_exames(nome, codigo))')
    .gte('data_hora', start)
    .lte('data_hora', end)
    .order('data_hora')

  if (session.role !== 'admin') {
    const { data: userRow } = await supabase
      .from('system_users')
      .select('permissoes')
      .eq('id', session.userId)
      .single()

    const laudosExames = (userRow?.permissoes as { laudos_exames?: string[] } | null)?.laudos_exames

    if (laudosExames && laudosExames.length > 0) {
      // Busca IDs de agendamentos que têm pelo menos um dos exames permitidos
      const { data: exameRows } = await supabase
        .from('agendamento_exames')
        .select('agendamento_id')
        .in('tipo_exame', laudosExames)

      const agIds = Array.from(new Set((exameRows ?? []).map(r => r.agendamento_id)))

      // Combina: via tabela agendamento_exames + fallback string tipo_exame (legado)
      const orParts = laudosExames.map(t => `tipo_exame.ilike.%${t}%`)
      if (agIds.length > 0) orParts.push(`id.in.(${agIds.join(',')})`)
      query = query.or(orParts.join(','))
    } else {
      query = query.eq('system_user_id', session.userId)
    }
  }

  const { data: rows, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const result = rows ?? []

  // (Fase 3) Removida a enrichment "bug legado clínica": o backend agora precifica
  // na criação (precificarExames) e mantém o invariante ag.valor == soma(partes),
  // então agendamento_exames.valor não nasce mais zerado.
  return NextResponse.json(result)
}
