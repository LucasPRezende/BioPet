import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyAgentKey } from '@/lib/agent-auth'
import { normalizeTelefone } from '@/lib/telefone'
import { gerarFeriadosPorAno, horasUteisDesde } from '@/lib/feriados'

export async function GET(request: NextRequest) {
  if (!verifyAgentKey(request)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const telefone = request.nextUrl.searchParams.get('telefone')?.trim()
  if (!telefone) {
    return NextResponse.json({ error: 'Parâmetro "telefone" obrigatório.' }, { status: 400 })
  }

  // Normaliza: remove não-dígitos, garante prefixo 55
  const digits = telefone.replace(/\D/g, '')
  const telNorm = normalizeTelefone(digits)

  // Busca tutor pelo telefone (aceita com ou sem 55)
  const { data: tutor } = await supabase
    .from('tutores')
    .select('id')
    .or(`telefone.eq.${telNorm},telefone.eq.${digits}`)
    .maybeSingle()

  if (!tutor) {
    return NextResponse.json({ tem_laudo: false, laudos: [], pendentes: [] })
  }

  const agora = new Date()

  const [{ data: laudos, error }, { data: realizados }, { data: feriadosRows }] = await Promise.all([
    supabase
      .from('laudos')
      .select('id, tipo_exame, criado_em, filename, agendamento_id, pets(nome)')
      .eq('tutor_id', tutor.id)
      .order('criado_em', { ascending: false })
      .limit(5),
    // O agendamento só vira "concluído" quando TODOS os laudos já foram
    // emitidos (ver /api/laudos/gerar) — ou seja, nunca existe um
    // "concluído" sem laudo. O exame que JÁ ACONTECEU mas ainda não tem
    // laudo continua com status "agendado"/"em atendimento" (não cancelado,
    // não faltou) e data_hora no passado.
    supabase
      .from('agendamentos')
      .select('id, tipo_exame, data_hora, pets(nome)')
      .eq('tutor_id', tutor.id)
      .in('status', ['agendado', 'em atendimento'])
      .lt('data_hora', agora.toISOString())
      .order('data_hora', { ascending: false })
      .limit(10),
    supabase.from('feriados').select('data'),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // NÃO retorna link: os links de laudo exigem login (fechados por segurança).
  // O agente deve ENVIAR o PDF (ver /api/agente/laudo/enviar). Aqui só listamos
  // para o cliente escolher qual laudo quer receber.
  const resultado = (laudos ?? []).map((l: Record<string, unknown>) => {
    const pets = l.pets as { nome: string }[] | null
    const pet  = Array.isArray(pets) ? pets[0]?.nome ?? null : (pets as { nome: string } | null)?.nome ?? null
    return {
      id:         l.id as number,
      pet,
      tipo_exame: l.tipo_exame as string | null,
      data:       new Date(l.criado_em as string).toLocaleDateString('pt-BR'),
      tem_arquivo: !!l.filename,
    }
  })

  // Exames já REALIZADOS (data_hora passada) sem laudo emitido: calcula aqui
  // (não no modelo) se já passou do prazo de 48h ÚTEIS — para o agente saber
  // se é "dentro do prazo normal" (pode oferecer urgência paga) ou "atraso
  // nosso" (não cobrar nada). Fim de semana/feriado não conta: o prazo pausa
  // e retoma no próximo dia útil (mesma fonte de feriados usada nas
  // revisões/horário especial).
  const agendamentoIdsComLaudo = new Set((laudos ?? []).map(l => l.agendamento_id).filter(Boolean))
  const y = agora.getFullYear()
  const feriados = Array.from(new Set([
    ...(feriadosRows ?? []).map((f: { data: string }) => f.data),
    ...[y - 1, y, y + 1].flatMap(gerarFeriadosPorAno).map(f => f.data),
  ]))
  const pendentes = (realizados ?? [])
    .filter(ag => !agendamentoIdsComLaudo.has(ag.id))
    .map(ag => {
      const pets = ag.pets as { nome: string }[] | { nome: string } | null
      const pet  = Array.isArray(pets) ? pets[0]?.nome ?? null : pets?.nome ?? null
      const horasUteis = horasUteisDesde(ag.data_hora, agora, feriados)
      return {
        agendamento_id:   ag.id as number,
        pet,
        tipo_exame:       ag.tipo_exame as string | null,
        data_exame:       new Date(ag.data_hora).toLocaleDateString('pt-BR'),
        horas_uteis_desde_exame: Math.round(horasUteis),
        dentro_prazo_48h: horasUteis < 48,
      }
    })

  return NextResponse.json({ tem_laudo: resultado.length > 0, laudos: resultado, pendentes })
}
