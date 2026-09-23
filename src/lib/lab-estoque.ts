/**
 * lab-estoque.ts — baixa automática de consumíveis derivada das operações de
 * Labs Parceiros (consolidação de tubos, compra de frete) e o rollup de
 * custo real por pedido. O estoque em si é o módulo único de consumíveis
 * (estoque.ts, lotes com custo PEPS) — este módulo é quem sabe como
 * pedido_lab/lab-tubos/caixa_preset se conectam com ele. As saídas ficam com
 * origem_tipo='pedido_lab' e origem_id=<pedido>.
 */
import { supabase } from './supabase'
import { consumir } from './estoque'
import { consolidarTubos, type ItemParaTubo } from './lab-tubos'
import type { Pacote } from './melhor-envio'

export const ORIGEM_PEDIDO_LAB = 'pedido_lab'

interface ConsumivelTuboRow {
  id:       number
  cor_tubo: string | null
}

function chaveComparacao(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * Baixa 1 unidade do consumível de tubo correspondente pra cada tubo físico
 * consolidado do pedido. Sem consumível cadastrado pra aquela cor, ignora — não
 * bloqueia a transição de status do pedido (cadastro é responsabilidade
 * separada, em /admin/estoque).
 */
export async function baixarTubosDoPedido(pedidoId: number): Promise<void> {
  const { data: itens, error } = await supabase
    .from('pedido_lab_item')
    .select('nome, cor_tubo, material_tipo, material_volume_ml')
    .eq('pedido_id', pedidoId)
  if (error || !itens || itens.length === 0) return

  const grupos = consolidarTubos(itens as ItemParaTubo[])

  const { data: tubos } = await supabase
    .from('consumiveis').select('id, cor_tubo').eq('categoria', 'tubo').eq('ativo', true)
  const lista = (tubos ?? []) as ConsumivelTuboRow[]

  for (const grupo of grupos) {
    if (!grupo.cor_tubo || grupo.tubos.length === 0) continue
    const chave = chaveComparacao(grupo.cor_tubo)
    const tubo  = lista.find(i => i.cor_tubo && chaveComparacao(i.cor_tubo) === chave)
    if (!tubo) continue

    await consumir(tubo.id, grupo.tubos.length, {
      origemTipo: ORIGEM_PEDIDO_LAB, origemId: pedidoId,
      observacao: `Coleta — tubo ${grupo.cor_tubo}`,
    })
  }
}

interface ItemKit { consumivel_id: number; quantidade: number }

/** Preset de caixa usado no frete — por ora sempre o primeiro ativo (sem UI
 * de escolha por pedido ainda; ver LABS_PARCEIROS.md Fase 5/8). */
export async function caixaPresetPadrao(): Promise<{ id: number; nome: string; pacote: Pacote } | null> {
  const { data } = await supabase
    .from('caixa_preset').select('id, nome, altura_cm, largura_cm, comprimento_cm, peso_kg')
    .eq('ativo', true).order('id').limit(1).maybeSingle()
  if (!data) return null
  return {
    id:   data.id,
    nome: data.nome,
    pacote: {
      altura_cm:      Number(data.altura_cm),
      largura_cm:     Number(data.largura_cm),
      comprimento_cm: Number(data.comprimento_cm),
      peso_kg:        Number(data.peso_kg),
    },
  }
}

/** Baixa o kit de consumíveis do preset de caixa usado no envio (isopor, gelo, etiqueta...). */
export async function baixarKitCaixa(caixaPresetId: number, pedidoId: number): Promise<void> {
  const { data } = await supabase.from('caixa_preset').select('kit_json, nome').eq('id', caixaPresetId).single()
  const kit = Array.isArray(data?.kit_json) ? (data.kit_json as ItemKit[]) : []
  for (const item of kit) {
    const quantidade = Math.round(Number(item.quantidade))
    if (!item.consumivel_id || !(quantidade > 0)) continue
    await consumir(item.consumivel_id, quantidade, {
      origemTipo: ORIGEM_PEDIDO_LAB, origemId: pedidoId,
      observacao: `Envio — kit caixa ${data?.nome ?? caixaPresetId}`,
    })
  }
}

export interface CustoRealPedido {
  custoItens:   number
  custoFrete:   number
  custoInsumos: number
  custoTotal:   number
}

/** Custo real = custo_lab dos itens + valor_frete + consumíveis gastos (tubo + kit da caixa),
 *  cada um pelo custo do lote de onde saiu. */
export async function custoRealPedido(pedidoId: number): Promise<CustoRealPedido> {
  const [itensRes, freteRes, insumosRes] = await Promise.all([
    supabase.from('pedido_lab_item').select('custo_snapshot').eq('pedido_id', pedidoId),
    supabase.from('pedido_lab_envio').select('valor_frete').eq('pedido_id', pedidoId),
    supabase.from('consumivel_movimentos').select('quantidade, custo_unitario')
      .eq('origem_tipo', ORIGEM_PEDIDO_LAB).eq('origem_id', pedidoId).eq('tipo', 'consumo'),
  ])

  const custoItens = (itensRes.data ?? []).reduce((s, i) => s + Number(i.custo_snapshot ?? 0), 0)
  const custoFrete = (freteRes.data ?? []).reduce((s, e) => s + Number(e.valor_frete ?? 0), 0)
  const custoInsumos = (insumosRes.data ?? []).reduce((s, m) => s + Number(m.quantidade) * Number(m.custo_unitario), 0)

  return { custoItens, custoFrete, custoInsumos, custoTotal: custoItens + custoFrete + custoInsumos }
}
