// Histórico da tabela de preços (migration v49).
//
// O lote da tela ("Revisar e salvar") grava o histórico dentro da função
// aplicar_alteracoes_precos, na mesma transação. As outras mudanças (modal ⋯,
// criação, remoção) passam por aqui, depois de aplicadas.

import { randomUUID } from 'node:crypto'
import { supabase } from './supabase'

export type TabelaPreco = 'comissoes_exame' | 'bioquimica_exames' | 'testes_rapidos' | 'exames_pcr'

export interface EntradaHistorico {
  tabela:      TabelaPreco
  registro_id: number
  campo:       string            // '*' = criação/remoção do registro inteiro
  antes:       unknown
  depois:      unknown
}

/** Campos que mudaram entre duas versões do registro, como entradas de histórico. */
export function diffHistorico(
  tabela: TabelaPreco,
  registroId: number,
  antes: Record<string, unknown>,
  depois: Record<string, unknown>,
): EntradaHistorico[] {
  const iguais = (a: unknown, b: unknown) => (a ?? null) === (b ?? null)
  return Object.keys(depois)
    .filter(campo => campo in antes && !iguais(antes[campo], depois[campo]))
    .map(campo => ({ tabela, registro_id: registroId, campo, antes: antes[campo] ?? null, depois: depois[campo] ?? null }))
}

/**
 * Grava as entradas num lote. Não derruba a operação que já foi feita: se o
 * histórico falhar, só registra no log.
 */
export async function registrarHistorico(entradas: EntradaHistorico[], usuarioId: number | null): Promise<void> {
  if (entradas.length === 0) return
  const lote = randomUUID()
  const { error } = await supabase.from('historico_precos').insert(entradas.map(e => ({
    tabela:       e.tabela,
    registro_id:  e.registro_id,
    campo:        e.campo,
    valor_antes:  e.antes ?? null,
    valor_depois: e.depois ?? null,
    alterado_por: usuarioId,
    lote_id:      lote,
  })))
  if (error) console.error('[historico_precos] falha ao gravar:', error.message)
}
