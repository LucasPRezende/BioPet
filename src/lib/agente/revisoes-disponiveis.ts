/**
 * Revisões gratuitas disponíveis para os pets de um tutor — usada tanto pela
 * tool identificar_tutor (/api/agente/contexto) quanto pelo webhook, que injeta
 * essas informações no prompt logo na PRIMEIRA mensagem da conversa para a IA
 * oferecer proativamente (sem depender dela decidir chamar identificar_tutor).
 */
import { supabase } from '@/lib/supabase'
import { normalizeTelefone } from '@/lib/telefone'
import { calcularElegibilidadeRevisao } from '@/lib/revisao-elegibilidade'
import { gerarFeriadosPorAno, isHorarioEspecial } from '@/lib/feriados'

export interface RevisaoDisponivel {
  agendamento_original_id: number
  pet_nome: string | null
  tipo_exame: string
  data_original: string
  prazo_limite: string
  pode_agendar: boolean
  /**
   * Presente quando o exame original foi em horário comercial: a revisão SÓ
   * pode ser agendada em horário comercial (mesma regra do /api/revisoes).
   */
  restricao_horario: string | null
}

export async function buscarRevisoesDisponiveis(petIds: number[]): Promise<RevisaoDisponivel[]> {
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
    .select('id, tipo_exame, data_hora, duracao_minutos, pets(nome)')
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

  // Janela comercial (feriados + expediente) para marcar a restrição de horário.
  const [{ data: feriadosRows }, { data: horarioRows }] = await Promise.all([
    supabase.from('feriados').select('data'),
    supabase.from('system_config').select('key, value').in('key', ['horario_especial_inicio', 'horario_especial_fim']),
  ])
  const y = new Date().getFullYear()
  const feriados = Array.from(new Set([
    ...(feriadosRows ?? []).map((f: { data: string }) => f.data),
    ...[y - 1, y, y + 1, y + 2].flatMap(gerarFeriadosPorAno).map(f => f.data),
  ]))
  const horarioMap = Object.fromEntries((horarioRows ?? []).map(r => [r.key, r.value]))
  const horarioInicio = horarioMap['horario_especial_inicio'] ?? '08:00'
  const horarioFim = horarioMap['horario_especial_fim'] ?? '17:00'

  return elegiveis
    .map(ag => {
      const config = configMap[getTipoPermitido(ag.tipo_exame)!]
      const eleg = calcularElegibilidadeRevisao(ag.data_hora, config, contador[ag.id] ?? 0)
      const pet = Array.isArray(ag.pets) ? (ag.pets as { nome: string }[])[0] : (ag.pets as { nome: string } | null)
      const [data, horaCompleta = '00:00'] = ag.data_hora.split('T')
      const originalEspecial = isHorarioEspecial(
        horaCompleta.slice(0, 5), ag.duracao_minutos ?? 30, data, feriados, horarioFim, horarioInicio,
      )
      return {
        agendamento_original_id: ag.id,
        pet_nome: pet?.nome ?? null,
        tipo_exame: ag.tipo_exame,
        data_original: ag.data_hora,
        prazo_limite: eleg.prazo_limite.toISOString().slice(0, 10),
        pode_agendar: eleg.pode_agendar,
        restricao_horario: originalEspecial
          ? null
          : `exame original foi em horário comercial — a revisão SÓ pode ser agendada em horário comercial (seg–sex, ${horarioInicio}–${horarioFim})`,
      }
    })
    .filter(r => r.pode_agendar)
}

function formatBr(iso: string): string {
  const [data] = iso.split('T')
  const [, m, d] = data.split('-')
  return `${d}/${m}`
}

/**
 * Bloco de contexto sobre o cliente para injetar no prompt na PRIMEIRA mensagem
 * da conversa: nome (cumprimento personalizado sem tool) e revisões gratuitas
 * disponíveis (oferta proativa já na primeira resposta). undefined se o
 * telefone não é de um tutor cadastrado.
 */
export async function montarInfoClienteNovo(telefone: string): Promise<string | undefined> {
  const telNorm = normalizeTelefone(telefone)
  const digits = telefone.replace(/\D/g, '')

  const { data: tutor } = await supabase
    .from('tutores')
    .select('id, nome')
    .or(`telefone.eq.${telNorm},telefone.eq.${digits}`)
    .maybeSingle()
  if (!tutor) return undefined

  const { data: pets } = await supabase
    .from('pets')
    .select('id, falecido')
    .eq('tutor_id', tutor.id)
  const petIds = (pets ?? []).filter(p => !p.falecido).map(p => p.id)

  const revisoes = await buscarRevisoesDisponiveis(petIds)

  const linhas = [
    `CLIENTE JÁ CADASTRADO: ${tutor.nome ?? 'sem nome'}. Cumprimente pelo nome. (Para ids de pets ou dados completos, chame identificar_tutor quando precisar.)`,
  ]
  if (revisoes.length > 0) {
    linhas.push(
      'REVISÃO GRATUITA DISPONÍVEL para este cliente — mencione JÁ NA SUA PRIMEIRA RESPOSTA, mesmo que ele só tenha cumprimentado:',
    )
    for (const r of revisoes) {
      linhas.push(
        `- ${r.pet_nome ?? 'pet'}: ${r.tipo_exame} feito em ${formatBr(r.data_original)} ` +
          `(agendamento_original_id=${r.agendamento_original_id} para agendar_revisao, prazo até ${formatBr(r.prazo_limite + 'T00:00')})` +
          (r.restricao_horario ? ` — ATENÇÃO: ${r.restricao_horario}. Avise ANTES de perguntar a data e não ofereça fim de semana/feriado/noite.` : ''),
      )
    }
  }
  return linhas.join('\n')
}
