/**
 * estoque.ts — ledger genérico de insumos (Labs Parceiros, Fase 5). Versão
 * enxuta: sem lote/validade/fornecedor/OC (ver LABS_PARCEIROS.md). O saldo em
 * `insumos.estoque_atual` é mantido junto com cada `insumo_movimento` inserido
 * — não é recalculado por soma a cada leitura, mas o ledger é a fonte da
 * verdade histórica (dá pra recompor/auditar se divergir).
 */
import { supabase } from './supabase'

export type TipoMovimento = 'entrada' | 'saida' | 'ajuste'

function delta(tipo: TipoMovimento, quantidade: number): number {
  if (tipo === 'entrada') return Math.abs(quantidade)
  if (tipo === 'saida') return -Math.abs(quantidade)
  return quantidade // ajuste: delta com sinal, vem pronto de quem chama
}

export interface RegistrarMovimentoParams {
  insumoId:      number
  tipo:          TipoMovimento
  quantidade:    number
  custoUnitario?: number | null
  pedidoId?:     number | null
  motivo?:       string | null
}

/** Registra o movimento no ledger e atualiza o saldo do insumo. */
export async function registrarMovimento(params: RegistrarMovimentoParams): Promise<void> {
  const { error: errMov } = await supabase.from('insumo_movimento').insert({
    insumo_id:      params.insumoId,
    tipo:           params.tipo,
    quantidade:     params.quantidade,
    custo_unitario: params.custoUnitario ?? null,
    pedido_id:      params.pedidoId ?? null,
    motivo:         params.motivo ?? null,
  })
  if (errMov) throw new Error(`Falha ao registrar movimento de estoque: ${errMov.message}`)

  const { data: insumo, error: errGet } = await supabase
    .from('insumos').select('estoque_atual').eq('id', params.insumoId).single()
  if (errGet || !insumo) throw new Error('Insumo não encontrado ao atualizar saldo.')

  const novoSaldo = Number(insumo.estoque_atual) + delta(params.tipo, params.quantidade)
  const { error: errUpd } = await supabase
    .from('insumos').update({ estoque_atual: novoSaldo }).eq('id', params.insumoId)
  if (errUpd) throw new Error(`Falha ao atualizar saldo do insumo: ${errUpd.message}`)
}
