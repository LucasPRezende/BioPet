import 'server-only'
import { supabase } from './supabase'
import { especieParaRef } from './hemograma-referencias'
import type { ReferenciaUrina } from './urinalise'

/** Referências da parte química da urinálise para a espécie (sem faixa etária). */
export async function carregarReferenciasUrina(especie: string): Promise<ReferenciaUrina[]> {
  const { data, error } = await supabase
    .from('urinalise_referencia')
    .select('parametro, valor_min, valor_max')
    .eq('especie', especieParaRef(especie))
  if (error) throw new Error(error.message)
  const num = (v: unknown) => v === null || v === undefined ? null : Number(v)
  return (data ?? []).map(r => ({ parametro: r.parametro, valor_min: num(r.valor_min), valor_max: num(r.valor_max) }))
}
