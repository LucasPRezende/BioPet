/**
 * orcamento.ts — regra pura do orçamento (sem banco, sem PDF).
 *
 * Orçamento é um documento informativo para o particular: lista exames, valor no
 * PIX e no cartão, e validade. NÃO cria agendamento, estoque nem comissão.
 * O preço vem SEMPRE da tabela (pricing.ts) — nunca digitado.
 *
 * Exame que varia por horário: o valor principal é o comercial; o fora de horário
 * entra à parte (`especial`) para o cliente saber antes de marcar.
 */
import { precoExame, type PrecoExame } from './pricing'

export const VALIDADE_PADRAO_DIAS = 15
export const VALIDADE_MAX_DIAS = 90

export interface ItemOrcamento {
  nome: string
  preco: PrecoExame
}

export interface LinhaOrcamento {
  nome: string
  pix: number
  cartao: number
  varia_por_horario: boolean
  /** Só quando varia por horário. */
  especial: { pix: number; cartao: number } | null
}

export interface Orcamento {
  linhas: LinhaOrcamento[]
  total_pix: number
  total_cartao: number
  /** Total fora do horário comercial; null se nenhum exame varia por horário. */
  total_especial: { pix: number; cartao: number } | null
}

const arredonda = (n: number) => Math.round(n * 100) / 100

export function calcularOrcamento(itens: ItemOrcamento[]): Orcamento {
  const linhas: LinhaOrcamento[] = itens.map(({ nome, preco }) => ({
    nome,
    pix:    precoExame(preco, { forma: 'pix',    especial: false }),
    cartao: precoExame(preco, { forma: 'cartao', especial: false }),
    varia_por_horario: preco.varia_por_horario,
    especial: preco.varia_por_horario
      ? {
          pix:    precoExame(preco, { forma: 'pix',    especial: true }),
          cartao: precoExame(preco, { forma: 'cartao', especial: true }),
        }
      : null,
  }))

  const soma = (f: (l: LinhaOrcamento) => number) => arredonda(linhas.reduce((s, l) => s + f(l), 0))
  const temEspecial = linhas.some(l => l.especial)

  return {
    linhas,
    total_pix:    soma(l => l.pix),
    total_cartao: soma(l => l.cartao),
    total_especial: temEspecial
      ? {
          pix:    soma(l => (l.especial ?? l).pix),
          cartao: soma(l => (l.especial ?? l).cartao),
        }
      : null,
  }
}

/** Normaliza os dias de validade: inteiro entre 1 e 90; inválido cai no padrão (15). */
export function normalizarValidadeDias(v: unknown): number {
  const n = Math.floor(Number(v))
  if (!Number.isFinite(n) || n < 1) return VALIDADE_PADRAO_DIAS
  return Math.min(n, VALIDADE_MAX_DIAS)
}

/** Data de hoje (YYYY-MM-DD) no fuso de Brasília. */
export function hojeBrasilia(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora)
}

/** Soma `dias` a uma data YYYY-MM-DD (aritmética em UTC, sem surpresa de fuso/horário de verão). */
export function validadeAte(emissaoISO: string, dias: number): string {
  const [y, m, d] = emissaoISO.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + dias))
  return dt.toISOString().slice(0, 10)
}
