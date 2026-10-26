// Consultas ao banco da regra de comissão por exame (ver comissao-exame.ts).

import { supabase } from './supabase'
import { num, type ComissoesDoExame } from './comissao-exame'

const COLS = 'tipo_exame, comissao_laudo, comissao_clinica, comissao_extracao'

export async function carregarComissoes(): Promise<ComissoesDoExame[]> {
  const { data, error } = await supabase.from('comissoes_exame').select(COLS)
  if (error) throw new Error(error.message)
  return (data ?? []) as ComissoesDoExame[]
}

/** Comissão de quem fez o laudo, para gravar em laudos.valor_comissao. */
export async function comissaoLaudo(tipoExame: string | null): Promise<number> {
  if (!tipoExame) return 0
  const { data } = await supabase
    .from('comissoes_exame')
    .select('comissao_laudo')
    .eq('tipo_exame', tipoExame)
    .maybeSingle()
  return num(data?.comissao_laudo)
}
