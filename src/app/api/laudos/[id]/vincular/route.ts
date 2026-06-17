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

// GET — agendamentos candidatos para vincular (mesmo pet do laudo)
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const { data: laudo } = await supabase
    .from('laudos')
    .select('pet_id, telefone, nome_pet, tipo_exame, data_laudo, criado_em')
    .eq('id', Number(params.id))
    .single()

  if (!laudo) return NextResponse.json({ error: 'Laudo não encontrado.' }, { status: 404 })
  if (!laudo.pet_id) {
    // Sem pet_id não dá para sugerir com segurança — retorna vazio
    return NextResponse.json({ candidatos: [], sem_pet: true })
  }

  const { data } = await supabase
    .from('agendamentos')
    .select('id, tipo_exame, data_hora, status, laudos(id), agendamento_exames(tipo_exame)')
    .eq('pet_id', laudo.pet_id)
    .neq('status', 'cancelado')
    .order('data_hora', { ascending: false })
    .limit(20)

  // Pontua cada candidato pela probabilidade de ser o agendamento do laudo:
  // match de tipo de exame (forte) + ainda sem laudo + proximidade de data + status
  const laudoTipo = (laudo.tipo_exame ?? '').toLowerCase().trim()
  const laudoData = new Date(laudo.data_laudo || laudo.criado_em).getTime()

  const candidatos = (data ?? []).map(ag => {
    const exames = (ag.agendamento_exames as { tipo_exame: string }[] | null) ?? []
    const tipos = [ag.tipo_exame, ...exames.map(e => e.tipo_exame)]
      .filter(Boolean).map(t => String(t).toLowerCase().trim())
    const laudosCount = Array.isArray(ag.laudos) ? ag.laudos.length : 0
    const examesCount = Math.max(1, exames.length)
    const faltaLaudo  = laudosCount < examesCount

    let score = 0
    const matchTipo = laudoTipo !== '' && tipos.some(t => t === laudoTipo)
    if (matchTipo) score += 100
    if (laudosCount === 0) score += 40
    const diffDias = Math.abs(laudoData - new Date(ag.data_hora).getTime()) / 86_400_000
    score += Math.max(0, 30 - diffDias) // até +30, decai 1 ponto/dia
    if (ag.status === 'concluído' || ag.status === 'em atendimento') score += 10

    return {
      id:          ag.id,
      tipo_exame:  ag.tipo_exame,
      data_hora:   ag.data_hora,
      status:      ag.status,
      tem_laudo:   laudosCount > 0,
      falta_laudo: faltaLaudo,
      match_tipo:  matchTipo,
      score:       Math.round(score),
    }
  })
    .filter(c => c.falta_laudo) // só agendamentos que ainda precisam de laudo
    .sort((a, b) => b.score - a.score)

  // Sugerido: o melhor, desde que tenha match de tipo (score >= 100)
  const sugeridoId = candidatos.length > 0 && candidatos[0].score >= 100 ? candidatos[0].id : null

  return NextResponse.json({ candidatos, sugerido_id: sugeridoId })
}

// PATCH — vincula o laudo ao agendamento informado
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const agendamentoId = Number(body?.agendamento_id)
  if (!agendamentoId) {
    return NextResponse.json({ error: 'agendamento_id obrigatório.' }, { status: 400 })
  }

  const { data: ag } = await supabase
    .from('agendamentos')
    .select('id')
    .eq('id', agendamentoId)
    .single()
  if (!ag) return NextResponse.json({ error: 'Agendamento não encontrado.' }, { status: 404 })

  const { error } = await supabase
    .from('laudos')
    .update({ agendamento_id: agendamentoId, agendamento_dispensado: false })
    .eq('id', Number(params.id))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Marca o agendamento como concluído se todos os exames já têm laudo
  const [{ data: totalLaudos }, { data: totalExames }] = await Promise.all([
    supabase.from('laudos').select('id').eq('agendamento_id', agendamentoId),
    supabase.from('agendamento_exames').select('id').eq('agendamento_id', agendamentoId),
  ])
  const laudosTotal = totalLaudos?.length ?? 0
  const examesTotal = Math.max(1, totalExames?.length ?? 0)
  if (laudosTotal >= examesTotal) {
    await supabase.from('agendamentos').update({ status: 'concluído' }).eq('id', agendamentoId)
  }

  return NextResponse.json({ ok: true })
}
