// Quem recebe comissão de cada exame (migration v48).
//
// Cada exame da tabela de Preços (comissoes_exame) tem um valor por
// beneficiário, e pode pagar mais de um ao mesmo tempo:
//
//   comissao_laudo     → quem gerou o laudo (gravado em laudos.valor_comissao)
//   comissao_clinica   → clínica parceira (comissao_clinica_id / abate do repasse)
//   comissao_extracao  → vet que extraiu o sangue (agendamentos.comissao_extracao)
//
// Bioquímica, Teste Rápido e PCR são "agrupadores": a comissão da clínica deles
// mora em cada sub-exame (bioquimica_exames / testes_rapidos / exames_pcr), não aqui.
//
// Só funções puras (usadas também no front); as consultas ao banco ficam em
// comissao-exame-db.ts. Testes em __tests__/comissao-exame.test.ts.

export const AGRUPADORES = ['Bioquímica', 'Teste Rápido', 'PCR'] as const

export const ehAgrupador = (tipo: string) => (AGRUPADORES as readonly string[]).includes(tipo)

export interface ComissoesDoExame {
  tipo_exame:        string
  comissao_laudo:    number | null
  comissao_clinica:  number | null
  comissao_extracao: number | null
}

export const num = (v: number | string | null | undefined) => Number(v ?? 0) || 0

/**
 * O exame gera comissão para uma clínica parceira? Agrupadores sempre podem
 * gerar (o valor está nos sub-exames); os demais, quando comissao_clinica > 0.
 */
type ComClinica = Pick<ComissoesDoExame, 'tipo_exame' | 'comissao_clinica'>

export function geraComissaoClinica(tipo: string, tabela: ComClinica[]): boolean {
  if (ehAgrupador(tipo)) return true
  return num(tabela.find(c => c.tipo_exame === tipo)?.comissao_clinica) > 0
}

/** Algum dos exames gera comissão de clínica? Decide se pergunta qual clínica. */
export function algumGeraComissaoClinica(tipos: string[], tabela: ComClinica[]): boolean {
  return tipos.some(t => geraComissaoClinica(t, tabela))
}

/**
 * Agendamento feito pela própria clínica: ela recebe comissão quando algum
 * exame gera comissão de clínica E o tutor paga a BioPet direto. Se é a
 * clínica quem cobra do tutor, a comissão já sai do repasse (não fica devida).
 */
export function clinicaQueRecebeComissao(p: {
  tipos:                 string[]
  pagamentoResponsavel:  string | null | undefined
  clinicaId:             number
  tabela:                ComClinica[]
}): number | null {
  if (p.pagamentoResponsavel === 'clinica') return null
  return algumGeraComissaoClinica(p.tipos, p.tabela) ? p.clinicaId : null
}

/**
 * A BioPet deve a comissão à clínica (decisão de 16/10/2026):
 *  - só depois que a BioPet RECEBEU do tutor (status 'pago') — cobrança em
 *    aberto ou pet que faltou não geram dívida;
 *  - exame gratuito nunca gera comissão de clínica.
 * (Quando é a clínica quem cobra do tutor, a comissão sai do repasse e não
 * passa por aqui.)
 */
export function comissaoClinicaDevida(ag: {
  comissao_clinica_id:  number | null | undefined
  status_pagamento:     string | null | undefined
  forma_pagamento:      string | null | undefined
}): boolean {
  if (ag.comissao_clinica_id == null) return false
  if ((ag.forma_pagamento ?? '').toLowerCase() === 'gratuito') return false
  return ag.status_pagamento === 'pago'
}

/** Tipos de exame que pagam comissão ao vet da extração. */
export function tiposComExtracao(tabela: ComissoesDoExame[]): string[] {
  return tabela.filter(c => num(c.comissao_extracao) > 0).map(c => c.tipo_exame)
}

/** Comissão do vet da extração para um agendamento = soma dos seus exames. */
export function comissaoExtracaoDe(tiposDoAgendamento: string[], tabela: ComissoesDoExame[]): number {
  return tiposDoAgendamento.reduce(
    (s, t) => s + num(tabela.find(c => c.tipo_exame === t)?.comissao_extracao), 0)
}
