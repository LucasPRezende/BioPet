import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

// Marca todas as comissões pendentes de um vet em determinado mês como pagas
export async function POST(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  let body: { vet_id?: number; mes?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 }) }

  const vetId = Number(body.vet_id)
  const mes   = body.mes
  if (!vetId || !mes) return NextResponse.json({ error: 'vet_id e mes são obrigatórios.' }, { status: 400 })

  const [year, month] = mes.split('-').map(Number)
  const mesInicio = `${mes}-01`
  const d = new Date(year, month, 1)
  const mesFim = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`

  // Coleta IDs hemogasimetria
  const [{ data: aeRows }, { data: legacyRows }] = await Promise.all([
    supabase.from('agendamento_exames').select('agendamento_id').ilike('tipo_exame', '%hemogasometria%'),
    supabase.from('agendamentos').select('id').ilike('tipo_exame', '%hemogasometria%'),
  ])
  const hemoIds = Array.from(new Set([
    ...(aeRows ?? []).map(r => r.agendamento_id as number),
    ...(legacyRows ?? []).map(r => r.id as number),
  ]))

  if (hemoIds.length === 0) return NextResponse.json({ sucesso: true, atualizados: 0 })

  const agora = new Date().toISOString()
  const { data, error } = await supabase
    .from('agendamentos')
    .update({ comissao_paga: true, comissao_paga_em: agora })
    .in('id', hemoIds)
    .eq('vet_extracao_id', vetId)
    .eq('comissao_paga', false)
    .gte('data_hora', mesInicio)
    .lt('data_hora', mesFim)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ sucesso: true, atualizados: data?.length ?? 0 })
}
