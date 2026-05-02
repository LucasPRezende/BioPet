import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const { id } = await params
  const petId = parseInt(id)
  if (isNaN(petId)) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })

  const sp = request.nextUrl.searchParams
  const data_inicio  = sp.get('data_inicio')
  const data_fim     = sp.get('data_fim')
  const tipo_evento  = sp.get('tipo_evento')  // 'laudo' | 'agendamento' | null
  const tipo_exame   = sp.get('tipo_exame')

  const [laudosRes, agendamentosRes] = await Promise.all([
    tipo_evento === 'agendamento' ? Promise.resolve({ data: [] }) :
    supabase
      .from('laudos')
      .select('id, created_at, tipo_exame, token, system_users(nome), veterinarios(nome)')
      .eq('pet_id', petId)
      .order('created_at', { ascending: false }),

    tipo_evento === 'laudo' ? Promise.resolve({ data: [] }) :
    supabase
      .from('agendamentos')
      .select('id, data_hora, tipo_exame, status, valor, forma_pagamento, pagamento_responsavel, status_pagamento, system_users(nome), laudos(id, token)')
      .eq('pet_id', petId)
      .order('data_hora', { ascending: false }),
  ])

  let laudos: typeof laudosRes.data = laudosRes.data ?? []
  let agendamentos: typeof agendamentosRes.data = agendamentosRes.data ?? []

  if (data_inicio) {
    laudos        = laudos?.filter(l => l.created_at >= data_inicio) ?? []
    agendamentos  = agendamentos?.filter(a => a.data_hora >= data_inicio) ?? []
  }
  if (data_fim) {
    const fim = data_fim + 'T23:59:59'
    laudos        = laudos?.filter(l => l.created_at <= fim) ?? []
    agendamentos  = agendamentos?.filter(a => a.data_hora <= fim) ?? []
  }
  if (tipo_exame) {
    laudos        = laudos?.filter(l => l.tipo_exame === tipo_exame) ?? []
    agendamentos  = agendamentos?.filter(a => a.tipo_exame === tipo_exame) ?? []
  }

  const itens = [
    ...(laudos ?? []).map(l => ({
      tipo:       'laudo' as const,
      id:         l.id,
      data:       l.created_at,
      tipo_exame: l.tipo_exame,
      token:      l.token,
      emitido_por: (l.system_users as unknown as { nome: string } | null)?.nome ?? null,
      veterinario: (l.veterinarios as unknown as { nome: string } | null)?.nome ?? null,
    })),
    ...(agendamentos ?? []).map(a => ({
      tipo:               'agendamento' as const,
      id:                 a.id,
      data:               a.data_hora,
      tipo_exame:         a.tipo_exame,
      status:             a.status,
      valor:              a.valor,
      forma_pagamento:    a.forma_pagamento,
      pagamento_responsavel: a.pagamento_responsavel,
      status_pagamento:   a.status_pagamento,
      responsavel:        (a.system_users as unknown as { nome: string } | null)?.nome ?? null,
      laudo:              (a.laudos as { id: number; token: string }[] | null)?.[0] ?? null,
    })),
  ].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())

  // Resumo por tipo de exame
  const resumo: Record<string, { tipo_exame: string; total: number; ultima_data: string }> = {}
  for (const item of itens) {
    const te = item.tipo_exame ?? 'Sem tipo'
    if (!resumo[te]) resumo[te] = { tipo_exame: te, total: 0, ultima_data: item.data }
    resumo[te].total++
    if (item.data > resumo[te].ultima_data) resumo[te].ultima_data = item.data
  }

  return NextResponse.json({ itens, resumo: Object.values(resumo) })
}
