import { supabase } from '@/lib/supabase'

/**
 * Diz se o agendamento já tem laudo suficiente para o exame informado.
 *
 * Um agendamento pode ter vários exames (ex.: Hemogasometria + Teste Rápido),
 * e cada um rende o seu laudo. Por isso a comparação é por tipo_exame: só
 * bloqueia quando a quantidade de laudos daquele tipo já alcançou a quantidade
 * de linhas daquele tipo em agendamento_exames.
 *
 * Sem tipo_exame, mantém o comportamento legado: qualquer laudo já bloqueia.
 */
export async function jaTemLaudo(
  agendamentoId: number,
  tipoExame?: string | null,
): Promise<boolean> {
  if (!tipoExame) {
    const { data: existente } = await supabase
      .from('laudos')
      .select('id')
      .eq('agendamento_id', agendamentoId)
      .limit(1)
    return (existente ?? []).length > 0
  }

  const [{ data: laudosDoTipo }, { data: examesDoTipo }] = await Promise.all([
    supabase.from('laudos').select('id')
      .eq('agendamento_id', agendamentoId).eq('tipo_exame', tipoExame),
    supabase.from('agendamento_exames').select('id')
      .eq('agendamento_id', agendamentoId).eq('tipo_exame', tipoExame),
  ])

  const laudosCount = (laudosDoTipo ?? []).length
  const examesCount = Math.max(1, (examesDoTipo ?? []).length)
  return laudosCount >= examesCount
}
