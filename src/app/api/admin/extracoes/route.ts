import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const session = await parseSystemSession(cookie)
  if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const now    = new Date()
  const mes    = searchParams.get('mes') ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const tab    = searchParams.get('tab') ?? 'sem_vet'

  const [year, month] = mes.split('-').map(Number)
  const mesInicio = `${mes}-01`
  const d = new Date(year, month, 1)
  const mesFim = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`

  // Coleta todos os IDs com hemogasimetria (nova tabela + legado)
  const [{ data: aeRows }, { data: legacyRows }] = await Promise.all([
    supabase.from('agendamento_exames').select('agendamento_id').ilike('tipo_exame', '%hemogasometria%'),
    supabase.from('agendamentos').select('id').ilike('tipo_exame', '%hemogasometria%'),
  ])

  const hemoIds = Array.from(new Set([
    ...(aeRows  ?? []).map(r => r.agendamento_id as number),
    ...(legacyRows ?? []).map(r => r.id as number),
  ]))

  if (hemoIds.length === 0) {
    return NextResponse.json({
      extracoes: [],
      dashboard: { por_vet: [], total_comissao: 0, total_extracoes: 0 },
    })
  }

  // ── Dashboard (mês selecionado, só com vet atribuído) ─────────────────────
  const { data: dashRows } = await supabase
    .from('agendamentos')
    .select('vet_extracao_id, comissao_extracao')
    .in('id', hemoIds)
    .gte('data_hora', mesInicio)
    .lt('data_hora', mesFim)
    .not('vet_extracao_id', 'is', null)

  // Busca nomes dos vets do dashboard
  const vetIds = Array.from(new Set((dashRows ?? []).map(r => r.vet_extracao_id as number)))
  const { data: vetRows } = vetIds.length > 0
    ? await supabase.from('veterinarios').select('id, nome').in('id', vetIds)
    : { data: [] }

  const vetNomeMap = new Map((vetRows ?? []).map(v => [v.id, v.nome as string]))

  const vetMap = new Map<number, { vet_nome: string; total: number; comissao: number }>()
  let total_comissao  = 0
  let total_extracoes = 0

  for (const row of (dashRows ?? [])) {
    const vid = row.vet_extracao_id as number
    const val = Number(row.comissao_extracao ?? 0)
    if (!vetMap.has(vid)) vetMap.set(vid, { vet_nome: vetNomeMap.get(vid) ?? '—', total: 0, comissao: 0 })
    const entry = vetMap.get(vid)!
    entry.total++
    entry.comissao += val
    total_comissao += val
    total_extracoes++
  }

  const por_vet = Array.from(vetMap.entries()).map(([vet_id, v]) => ({ vet_id, ...v }))
    .sort((a, b) => b.comissao - a.comissao)

  // ── Lista de extrações (filtrada por tab) ─────────────────────────────────
  let q = supabase
    .from('agendamentos')
    .select(`
      id, data_hora, tipo_exame, valor, status, status_pagamento,
      vet_extracao_id, comissao_extracao,
      pets(nome, especie),
      tutores(nome, telefone),
      veterinario_id
    `)
    .in('id', hemoIds)
    .order('data_hora', { ascending: false })

  if (tab === 'sem_vet') {
    q = q.is('vet_extracao_id', null)
  } else {
    // 'atribuidas': extrações do mês que já têm vet. O pagamento da comissão
    // não é mais controlado aqui (ver /admin/pagamentos-comissao).
    q = q.not('vet_extracao_id', 'is', null).gte('data_hora', mesInicio).lt('data_hora', mesFim)
  }

  const { data: extRows, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Enriquece com nomes dos vets (responsável e extração)
  const allVetIds = Array.from(new Set([
    ...(extRows ?? []).map(r => r.veterinario_id as number | null).filter(Boolean) as number[],
    ...(extRows ?? []).map(r => r.vet_extracao_id as number | null).filter(Boolean) as number[],
  ]))

  const { data: allVets } = allVetIds.length > 0
    ? await supabase.from('veterinarios').select('id, nome').in('id', allVetIds)
    : { data: [] }

  const allVetMap = new Map((allVets ?? []).map(v => [v.id, v.nome as string]))

  const extracoes = (extRows ?? []).map(r => ({
    ...r,
    vet_responsavel: r.veterinario_id ? { nome: allVetMap.get(r.veterinario_id) ?? '—' } : null,
    vet_extracao:    r.vet_extracao_id ? { id: r.vet_extracao_id, nome: allVetMap.get(r.vet_extracao_id) ?? '—' } : null,
  }))

  return NextResponse.json({
    extracoes,
    dashboard: { por_vet, total_comissao, total_extracoes },
  })
}
