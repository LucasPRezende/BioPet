/**
 * lab-estoque.ts — baixa automática de insumos derivada das operações de
 * Labs Parceiros (consolidação de tubos, compra de frete) e o rollup de
 * custo real por pedido. O ledger genérico fica em estoque.ts — este módulo
 * é quem sabe como pedido_lab/lab-tubos/caixa_preset se conectam com ele.
 */
import { supabase } from './supabase'
import { registrarMovimento } from './estoque'
import { consolidarTubos, type ItemParaTubo } from './lab-tubos'
import type { Pacote } from './melhor-envio'

interface InsumoTuboRow {
  id:       number
  cor_tubo: string | null
}

function chaveComparacao(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * Baixa 1 unidade do insumo de tubo correspondente pra cada tubo físico
 * consolidado do pedido. Sem insumo cadastrado pra aquela cor, ignora — não
 * bloqueia a transição de status do pedido (cadastro de insumo é
 * responsabilidade separada, em /admin/estoque).
 */
export async function baixarTubosDoPedido(pedidoId: number): Promise<void> {
  const { data: itens, error } = await supabase
    .from('pedido_lab_item')
    .select('nome, cor_tubo, material_tipo, material_volume_ml')
    .eq('pedido_id', pedidoId)
  if (error || !itens || itens.length === 0) return

  const grupos = consolidarTubos(itens as ItemParaTubo[])

  const { data: insumos } = await supabase
    .from('insumos').select('id, cor_tubo').eq('tipo', 'tubo').eq('ativo', true)
  const lista = (insumos ?? []) as InsumoTuboRow[]

  for (const grupo of grupos) {
    if (!grupo.cor_tubo) continue
    const chave  = chaveComparacao(grupo.cor_tubo)
    const insumo = lista.find(i => i.cor_tubo && chaveComparacao(i.cor_tubo) === chave)
    if (!insumo) continue

    for (let i = 0; i < grupo.tubos.length; i++) {
      await registrarMovimento({
        insumoId: insumo.id, tipo: 'saida', quantidade: 1,
        pedidoId, motivo: `Coleta pedido #${pedidoId} — tubo ${grupo.cor_tubo}`,
      })
    }
  }
}

interface ItemKit { insumo_id: number; quantidade: number }

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

/** Baixa o kit de insumos do preset de caixa usado no envio (isopor, gelo, etiqueta...). */
export async function baixarKitCaixa(caixaPresetId: number, pedidoId: number): Promise<void> {
  const { data } = await supabase.from('caixa_preset').select('kit_json, nome').eq('id', caixaPresetId).single()
  const kit = Array.isArray(data?.kit_json) ? (data.kit_json as ItemKit[]) : []
  for (const item of kit) {
    if (!item.insumo_id || !item.quantidade) continue
    await registrarMovimento({
      insumoId: item.insumo_id, tipo: 'saida', quantidade: item.quantidade,
      pedidoId, motivo: `Envio pedido #${pedidoId} — kit caixa ${data?.nome ?? caixaPresetId}`,
    })
  }
}

export interface CustoRealPedido {
  custoItens:   number
  custoFrete:   number
  custoInsumos: number
  custoTotal:   number
}

/** Custo real = custo_lab dos itens + valor_frete + insumos consumidos (tubo + kit da caixa). */
export async function custoRealPedido(pedidoId: number): Promise<CustoRealPedido> {
  const [itensRes, freteRes, insumosRes] = await Promise.all([
    supabase.from('pedido_lab_item').select('custo_snapshot').eq('pedido_id', pedidoId),
    supabase.from('pedido_lab_envio').select('valor_frete').eq('pedido_id', pedidoId),
    supabase.from('insumo_movimento').select('quantidade, insumos(custo_unitario)').eq('pedido_id', pedidoId).eq('tipo', 'saida'),
  ])

  const custoItens = (itensRes.data ?? []).reduce((s, i) => s + Number(i.custo_snapshot ?? 0), 0)
  const custoFrete = (freteRes.data ?? []).reduce((s, e) => s + Number(e.valor_frete ?? 0), 0)
  const custoInsumos = (insumosRes.data ?? []).reduce((s, m) => {
    const join = Array.isArray(m.insumos) ? m.insumos[0] : m.insumos
    const custoUnit = Number((join as { custo_unitario?: number } | null)?.custo_unitario ?? 0)
    return s + Number(m.quantidade) * custoUnit
  }, 0)

  return { custoItens, custoFrete, custoInsumos, custoTotal: custoItens + custoFrete + custoInsumos }
}
