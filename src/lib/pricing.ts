/**
 * pricing.ts — fonte única de verdade do cálculo de preço de exames.
 *
 * FASE 0 da refatoração de pricing: este módulo espelha *exatamente* a regra que
 * hoje vive duplicada em ~10 lugares (AgendamentoForm, agenda, admin/agendar,
 * clinica/agendamentos, revisoes, mp-preference, criar-pix, regerar-link,
 * laudos/gerar, laudos/route). Nesta fase **nada ainda usa este módulo** — ele
 * existe para ser validado pelo script de equivalência (scripts/pricing-equivalence.ts)
 * antes de migrarmos os pontos um a um (Fase 1).
 *
 * Regra de negócio (espelhada de `calcularValorExame` em AgendamentoForm.tsx):
 *  - Exame que NÃO varia por horário: preço comercial (pix ou cartão).
 *  - Exame que varia por horário + horário especial: preço especial; se ausente,
 *    cai para o comercial.
 *  - Exame que varia por horário + horário comercial: preço comercial.
 *  - Bioquímica: soma dos sub-exames (preço fixo por sub-exame, não varia por horário).
 *  - Contexto clínica: sempre PIX, sem desconto.
 *  - Gratuidade: valor 0 SEM consultar a tabela (tratado por quem chama — ver
 *    [[gratuidade-admin-only]]). Este módulo NUNCA decide gratuidade.
 *
 * Centraliza também `isHorarioEspecial` (re-exportado de ./feriados) para que os
 * pontos de cálculo importem horário-especial + preço do mesmo lugar.
 */
import { isHorarioEspecial } from './feriados'

export { isHorarioEspecial }

export type FormaPagamento = 'pix' | 'cartao'

/**
 * Preços de um tipo de exame, no formato já mapeado usado pelo front
 * (AgendamentoForm / clinica/exames-permitidos).
 */
export interface PrecoExame {
  varia_por_horario: boolean
  valor_pix: number | null              // preço comercial PIX
  valor_cartao: number | null           // preço comercial cartão
  valor_especial_pix: number | null     // preço fora de horário PIX
  valor_especial_cartao: number | null  // preço fora de horário cartão
}

/** Linha crua de `comissoes_exame`, como vem do banco. */
export interface ComissaoRow {
  varia_por_horario: boolean
  preco_pix_comercial: number | null
  preco_cartao_comercial: number | null
  preco_pix_fora_horario: number | null
  preco_cartao_fora_horario: number | null
}

/** Converte uma linha crua de `comissoes_exame` para o formato {@link PrecoExame}. */
export function fromComissao(c: ComissaoRow): PrecoExame {
  return {
    varia_por_horario:     c.varia_por_horario,
    valor_pix:             c.preco_pix_comercial,
    valor_cartao:          c.preco_cartao_comercial,
    valor_especial_pix:    c.preco_pix_fora_horario,
    valor_especial_cartao: c.preco_cartao_fora_horario,
  }
}

/**
 * Preço BRUTO (sem desconto) de um único exame.
 * Espelho fiel de `calcularValorExame` (AgendamentoForm) — inclusive os fallbacks:
 * cartão cai para PIX quando não há preço de cartão; especial cai para comercial.
 */
export function precoExame(
  p: PrecoExame,
  { forma, especial }: { forma: FormaPagamento; especial: boolean },
): number {
  if (!p.varia_por_horario) {
    return forma === 'cartao'
      ? (p.valor_cartao ?? p.valor_pix ?? 0)
      : (p.valor_pix ?? 0)
  }
  if (especial) {
    return forma === 'cartao'
      ? (p.valor_especial_cartao ?? p.valor_cartao ?? 0)
      : (p.valor_especial_pix    ?? p.valor_pix    ?? 0)
  }
  return forma === 'cartao'
    ? (p.valor_cartao ?? 0)
    : (p.valor_pix    ?? 0)
}

/** Sub-exame de bioquímica com preços fixos (não variam por horário). */
export interface SubExameBioquimica {
  valor_pix: number
  valor_cartao: number
}

/** Total bruto de bioquímica: soma dos sub-exames selecionados, conforme a forma. */
export function precoBioquimica(subs: SubExameBioquimica[], forma: FormaPagamento): number {
  return subs.reduce(
    (s, b) => s + Number(forma === 'cartao' ? b.valor_cartao : b.valor_pix),
    0,
  )
}

/**
 * Desconto efetivo (admin): clampeado a [0, bruto]. Espelha
 * `Math.min(descontos[...] ?? 0, bruto)` com piso em 0.
 */
export function descontoEfetivo(bruto: number, desconto = 0): number {
  return Math.min(Math.max(0, Number(desconto) || 0), bruto)
}

/** Valor LÍQUIDO de um exame: bruto − desconto, nunca negativo. */
export function valorLiquido(bruto: number, desconto = 0): number {
  return Math.max(0, bruto - descontoEfetivo(bruto, desconto))
}

/** Item de um agendamento para somar o total (já com o valor bruto resolvido). */
export interface ItemAgendamento {
  bruto: number
  desconto?: number
}

/**
 * Total do agendamento = soma dos valores líquidos dos itens.
 * Espelha `Math.max(0, totalBruto − descontoTotal)` (com desconto por item).
 */
export function totalAgendamento(itens: ItemAgendamento[]): number {
  return itens.reduce((s, it) => s + valorLiquido(it.bruto, it.desconto), 0)
}

/** Contexto de cálculo de preço (forma de pagamento + se permite desconto). */
export interface ContextoPreco {
  forma: FormaPagamento
  permiteDesconto: boolean
}

/**
 * Contexto "pagamento pela clínica": sempre PIX e sem desconto — comportamento
 * idêntico ao atual (`pagamentoResp === 'clinica' ? 'pix' : forma`, desconto 0).
 */
export function contextoClinica(): ContextoPreco {
  return { forma: 'pix', permiteDesconto: false }
}

/**
 * Resolve a forma efetiva de pagamento a partir do responsável + forma escolhida,
 * espelhando `isPix = pagResp === 'clinica' || !formaPag.includes('cartao')`.
 */
export function formaEfetiva(
  pagamentoResponsavel: string | null | undefined,
  formaPagamento: string | null | undefined,
): FormaPagamento {
  if (pagamentoResponsavel === 'clinica') return 'pix'
  return (formaPagamento ?? '').toLowerCase().includes('cartao') ? 'cartao' : 'pix'
}
