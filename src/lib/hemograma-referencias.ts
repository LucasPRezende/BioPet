import 'server-only'
import { supabase } from './supabase'
import { ESPECIE_PARA_REF } from './especies'
import type { ReferenciaHemograma } from './hemograma'

/** "Canina" → "cao"; já no formato de referência ("cao") passa direto. */
export function especieParaRef(especie: string): string {
  return ESPECIE_PARA_REF[especie] ?? especie.trim().toLowerCase()
}

/**
 * Referências do hemograma para a espécie/faixa. Para cada parâmetro, a faixa
 * específica tem prioridade sobre 'todos' campo a campo: mínimo ou máximo
 * vazio na faixa específica herda o de 'todos' (é o que a tela de edição promete).
 */
export async function carregarReferenciasHemograma(
  especie: string,
  faixaEtaria = 'todos',
): Promise<ReferenciaHemograma[]> {
  const faixas = faixaEtaria && faixaEtaria !== 'todos' ? [faixaEtaria, 'todos'] : ['todos']
  const { data, error } = await supabase
    .from('hemograma_referencia')
    .select('parametro, faixa_etaria, valor_min, valor_max')
    .eq('especie', especieParaRef(especie))
    .in('faixa_etaria', faixas)
  if (error) throw new Error(error.message)

  const num = (v: unknown) => v === null || v === undefined ? null : Number(v)
  const linhas = data ?? []
  const parametros = Array.from(new Set(linhas.map(r => r.parametro)))

  return parametros.map(parametro => {
    const especifica = linhas.find(r => r.parametro === parametro && r.faixa_etaria !== 'todos')
    const geral      = linhas.find(r => r.parametro === parametro && r.faixa_etaria === 'todos')
    return {
      parametro,
      valor_min: num(especifica?.valor_min) ?? num(geral?.valor_min),
      valor_max: num(especifica?.valor_max) ?? num(geral?.valor_max),
    }
  })
}
