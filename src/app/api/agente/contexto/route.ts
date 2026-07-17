import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyAgentKey } from '@/lib/agent-auth'
import { normalizeTelefone } from '@/lib/telefone'
import { calcularElegibilidadeRevisao } from '@/lib/revisao-elegibilidade'

export async function GET(request: NextRequest) {
  if (!verifyAgentKey(request)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const telefone = request.nextUrl.searchParams.get('telefone')

  if (!telefone) {
    return NextResponse.json({ error: 'Parâmetro "telefone" é obrigatório.' }, { status: 400 })
  }

  const digits  = telefone.replace(/\D/g, '')
  const telNorm = normalizeTelefone(digits)

  const { data: tutor } = await supabase
    .from('tutores')
    .select('id, nome, telefone, atendimento_humano, atendimento_humano_ate')
    .or(`telefone.eq.${telNorm},telefone.eq.${digits}`)
    .maybeSingle()

  if (!tutor) {
    return NextResponse.json({ tutor: null, pets: [], atendimento_humano: false })
  }

  // Auto-desbloqueio: se o prazo expirou, limpa o flag
  if (tutor.atendimento_humano && tutor.atendimento_humano_ate) {
    const expiry = new Date(tutor.atendimento_humano_ate)
    if (expiry < new Date()) {
      await supabase
        .from('tutores')
        .update({ atendimento_humano: false, atendimento_humano_ate: null })
        .eq('id', tutor.id)
      tutor.atendimento_humano = false
      tutor.atendimento_humano_ate = null
    }
  }

  const { data: pets } = await supabase
    .from('pets')
    .select('id, nome, especie, raca, sexo, falecido, falecido_em')
    .eq('tutor_id', tutor.id)
    .order('nome')

  const todosOsPets   = pets ?? []
  const petsAtivos    = todosOsPets.filter(p => !p.falecido)
  const petsFalecidos = todosOsPets.filter(p => p.falecido)

  const revisoesDisponiveis = await buscarRevisoesDisponiveis(petsAtivos.map(p => p.id))

  return NextResponse.json({
    tutor,
    pets: petsAtivos,
    pets_falecidos: petsFalecidos,
    revisoes_disponiveis: revisoesDisponiveis,
  })
}

/**
 * Exames já feitos (não-revisão) dos pets do tutor que ainda estão dentro do
 * prazo/limite de revisão configurado em `revisao_config`. Usado pra IA
 * sugerir proativamente a revisão gratuita, sem o cliente precisar pedir.
 */
async function buscarRevisoesDisponiveis(petIds: number[]) {
  if (petIds.length === 0) return []

  const { data: configs } = await supabase
    .from('revisao_config')
    .select('tipo_exame, prazo_dias, max_revisoes')
    .eq('permite_revisao', true)
  const tiposPermitidos = (configs ?? []).map(c => c.tipo_exame)
  if (tiposPermitidos.length === 0) return []
  const configMap = Object.fromEntries((configs ?? []).map(c => [c.tipo_exame, c]))

  const { data: ags } = await supabase
    .from('agendamentos')
    .select('id, tipo_exame, data_hora, pets(nome)')
    .in('pet_id', petIds)
    .eq('is_revisao', false)
    .eq('status', 'concluído')
    .order('data_hora', { ascending: false })
    .limit(20)

  const getTipoPermitido = (tipoExame: string): string | null =>
    tipoExame.split(',').map((t: string) => t.trim()).find((t: string) => tiposPermitidos.includes(t)) ?? null

  const elegiveis = (ags ?? []).filter(ag => getTipoPermitido(ag.tipo_exame) !== null)
  if (elegiveis.length === 0) return []

  const agIds = elegiveis.map(a => a.id)
  const { data: revisoesAtivas } = await supabase
    .from('agendamentos')
    .select('agendamento_original_id')
    .in('agendamento_original_id', agIds)
    .eq('is_revisao', true)
    .in('status', ['agendado', 'em atendimento', 'concluído'])

  const contador: Record<number, number> = {}
  for (const r of revisoesAtivas ?? []) {
    if (r.agendamento_original_id) contador[r.agendamento_original_id] = (contador[r.agendamento_original_id] ?? 0) + 1
  }

  return elegiveis
    .map(ag => {
      const config = configMap[getTipoPermitido(ag.tipo_exame)!]
      const eleg = calcularElegibilidadeRevisao(ag.data_hora, config, contador[ag.id] ?? 0)
      const pet = Array.isArray(ag.pets) ? (ag.pets as { nome: string }[])[0] : (ag.pets as { nome: string } | null)
      return {
        agendamento_original_id: ag.id,
        pet_nome: pet?.nome ?? null,
        tipo_exame: ag.tipo_exame,
        data_original: ag.data_hora,
        prazo_limite: eleg.prazo_limite.toISOString().slice(0, 10),
        pode_agendar: eleg.pode_agendar,
      }
    })
    .filter(r => r.pode_agendar)
}
