/**
 * lab-pedidos.ts — helpers compartilhados pelas rotas de pedido_lab (Labs
 * Parceiros, Fase 2). Centraliza a máquina de estados e o snapshot de preço,
 * seguindo o padrão de agendamento-helpers.ts.
 */
import { supabase } from './supabase'
import { precoLabExame, type TipoCobranca } from './pricing'

export type OrigemPedido = 'vet' | 'clinica' | 'admin'

/** `vet`/`clinica` → `preco_parceiro`; `admin` (em nome do cliente) → `preco_cliente`. */
export function tipoCobrancaFromOrigem(origem: OrigemPedido): TipoCobranca {
  return origem === 'admin' ? 'cliente' : 'parceiro'
}

export const STATUS_PEDIDO = [
  'rascunho', 'confirmado', 'coleta_agendada', 'coletado', 'enviado', 'concluido', 'cancelado',
] as const
export type StatusPedido = typeof STATUS_PEDIDO[number]

// rascunho -> confirmado -> coleta_agendada -> coletado -> enviado -> concluido
// cancelado alcançável de qualquer estado antes de concluido (ver LABS_PARCEIROS.md).
// enviado/concluido ficam no vocabulário para as fases de frete/resultado — a
// Fase 2 só constrói até coletado, mas não bloqueia o valor do campo.
const TRANSICOES: Record<StatusPedido, StatusPedido[]> = {
  rascunho:        ['confirmado', 'cancelado'],
  confirmado:      ['coleta_agendada', 'cancelado'],
  coleta_agendada: ['coletado', 'cancelado'],
  coletado:        ['enviado', 'cancelado'],
  enviado:         ['concluido', 'cancelado'],
  concluido:       [],
  cancelado:       [],
}

export function transicaoValida(atual: string, novo: string): boolean {
  const de = TRANSICOES[atual as StatusPedido]
  return !!de && de.includes(novo as StatusPedido)
}

// Sem resposta da pergunta D.16 (janelas de coleta) — default configurável aqui.
export const DURACAO_COLETA_PADRAO_MIN = 30

interface LabExameRow {
  id: number
  laboratorio_id: number
  codigo: string | null
  nome: string
  cor_tubo: string | null
  material_tipo: string | null
  material_volume_ml: number | null
  custo: number | null
  preco_cliente: number | null
  preco_parceiro: number | null
  sob_consulta: boolean
  ativo: boolean
}

export interface ItemSnapshot {
  lab_exame_id:       number
  laboratorio_id:     number
  codigo:             string | null
  nome:               string
  cor_tubo:           string | null
  material_tipo:      string | null
  material_volume_ml: number | null
  custo_snapshot:     number | null
  preco_snapshot:     number
}

export interface MontarItensResult {
  itens?:      ItemSnapshot[]
  valorTotal?: number
  error?:      string
}

/**
 * Busca os lab_exames pedidos, valida as regras duras (ativo, sob_consulta,
 * preço definido para o tipo de cobrança) e monta os itens com snapshot.
 * Preço SEMPRE calculado aqui no backend — nunca confiar em valor vindo do front.
 */
export async function montarItensPedido(
  labExameIds: number[],
  tipo: TipoCobranca,
): Promise<MontarItensResult> {
  if (labExameIds.length === 0) return { error: 'Selecione ao menos um exame.' }

  const { data: exames, error } = await supabase
    .from('lab_exames')
    .select('id, laboratorio_id, codigo, nome, cor_tubo, material_tipo, material_volume_ml, custo, preco_cliente, preco_parceiro, sob_consulta, ativo')
    .in('id', labExameIds)

  if (error) return { error: error.message }

  const porId = new Map((exames as LabExameRow[] ?? []).map(e => [e.id, e]))
  const itens: ItemSnapshot[] = []

  for (const id of labExameIds) {
    const e = porId.get(id)
    if (!e) return { error: `Exame #${id} não encontrado no catálogo.` }
    if (!e.ativo) return { error: `Exame "${e.nome}" está inativo.` }
    if (e.sob_consulta) return { error: `Exame "${e.nome}" é sob consulta — sem preço fechado, fora do fluxo de pedido.` }

    const preco = precoLabExame(e, tipo)
    if (preco === null) {
      return {
        error: tipo === 'parceiro'
          ? `Preço parceiro não definido para o exame "${e.nome}" — preencha em /admin/labs.`
          : `Preço cliente não definido para o exame "${e.nome}" — preencha em /admin/labs.`,
      }
    }

    itens.push({
      lab_exame_id:       e.id,
      laboratorio_id:     e.laboratorio_id,
      codigo:             e.codigo,
      nome:               e.nome,
      cor_tubo:           e.cor_tubo,
      material_tipo:      e.material_tipo,
      material_volume_ml: e.material_volume_ml,
      custo_snapshot:     e.custo,
      preco_snapshot:     preco,
    })
  }

  const valorTotal = itens.reduce((s, i) => s + i.preco_snapshot, 0)
  return { itens, valorTotal }
}
