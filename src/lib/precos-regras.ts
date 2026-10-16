// Regras da tela de Preços (versão 2a). Só funções puras, usadas no front e
// nas APIs. Nenhum cálculo de preço novo: tudo passa por precoExame().

import { precoExame, fromComissao, type ComissaoRow, type FormaPagamento } from './pricing'
import { ehAgrupador } from './comissao-exame'

export type CampoPreco =
  | 'preco_pix_comercial' | 'preco_cartao_comercial'
  | 'preco_pix_fora_horario' | 'preco_cartao_fora_horario'

export interface Combinacao {
  campo:    CampoPreco
  forma:    FormaPagamento
  especial: boolean
  rotulo:   string
}

const COMBINACOES: Combinacao[] = [
  { campo: 'preco_pix_comercial',       forma: 'pix',    especial: false, rotulo: 'Pix comercial' },
  { campo: 'preco_cartao_comercial',    forma: 'cartao', especial: false, rotulo: 'Cartão comercial' },
  { campo: 'preco_pix_fora_horario',    forma: 'pix',    especial: true,  rotulo: 'Pix fora do horário' },
  { campo: 'preco_cartao_fora_horario', forma: 'cartao', especial: true,  rotulo: 'Cartão fora do horário' },
]

/** Combinações forma × horário que valem para o exame (2 se não varia, 4 se varia). */
export function combinacoesDo(row: Pick<ComissaoRow, 'varia_por_horario'>): Combinacao[] {
  if (!row.varia_por_horario) {
    return [
      { ...COMBINACOES[0], rotulo: 'Pix' },
      { ...COMBINACOES[1], rotulo: 'Cartão' },
    ]
  }
  return COMBINACOES
}

/** Quanto o campo realmente cobra (aplicando os "vazio usa X" de precoExame). */
export function valorEfetivo(row: ComissaoRow, campo: CampoPreco): number {
  const c = COMBINACOES.find(x => x.campo === campo)!
  return precoExame(fromComissao(row), { forma: c.forma, especial: c.especial })
}

/** Combinações que cobram R$ 0,00. */
export function combinacoesZeradas(row: ComissaoRow): Combinacao[] {
  return combinacoesDo(row).filter(c => valorEfetivo(row, c.campo) <= 0)
}

/**
 * Explica um campo de preço vazio: de onde vem o valor que ele cobra, ou que
 * cobra zero. null quando o campo tem valor.
 */
export function explicarVazio(row: ComissaoRow, campo: CampoPreco): { valor: number; zero: boolean; motivo: string } | null {
  if (row[campo] != null) return null
  const valor = valorEfetivo(row, campo)
  const fmt = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  if (valor <= 0) {
    const motivo = row.varia_por_horario && campo === 'preco_cartao_comercial'
      ? 'Vazio: com "Varia por horário" ligado, o cartão vazio não usa o Pix e cobra zero.'
      : 'Vazio: cobra R$ 0,00.'
    return { valor: 0, zero: true, motivo }
  }
  const origem =
    campo === 'preco_cartao_comercial'    ? 'no cartão cobra o mesmo do Pix' :
    campo === 'preco_pix_fora_horario'    ? 'fora do horário cobra o Pix comercial' :
    campo === 'preco_cartao_fora_horario' ? 'fora do horário cobra o cartão comercial' :
                                            'cobra'
  return { valor, zero: false, motivo: `Vazio: ${origem} (${fmt(valor)}).` }
}

/** Exame (não agrupador) só pode ficar ativo com Pix comercial > 0. */
export function podeAtivar(row: { tipo_exame: string; preco_pix_comercial: number | null }): boolean {
  return ehAgrupador(row.tipo_exame) || Number(row.preco_pix_comercial ?? 0) > 0
}

/**
 * Lê um valor digitado: "280", "280,50", "1.280,50", "R$ 280", "1280.5".
 * '' → null. Inválido → NaN.
 */
export function parseValorBR(texto: string): number | null {
  const t = texto.replace(/R\$/gi, '').replace(/\s/g, '')
  if (t === '') return null
  let norm: string
  if (t.includes(',')) {
    norm = t.replace(/\./g, '').replace(',', '.')
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    norm = t.replace(/\./g, '')           // "1.280" = mil duzentos e oitenta
  } else {
    norm = t
  }
  if (!/^-?\d+(\.\d+)?$/.test(norm)) return NaN
  const n = Number(norm)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN
}

export const fmtValor = (n: number) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
