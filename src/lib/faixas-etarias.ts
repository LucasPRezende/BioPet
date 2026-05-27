export interface FaixaConfig {
  especie:            string
  filhote_ate_meses:  number | null
  adulto_ate_meses:   number | null
}

/** Converte string de idade ("3 anos", "5 meses") para meses. */
export function idadeParaMeses(idadeStr: string): number | null {
  const num = parseFloat(idadeStr)
  if (isNaN(num)) return null
  const isMeses =
    idadeStr.toLowerCase().includes('mes') ||
    idadeStr.toLowerCase().includes('mês')
  return isMeses ? Math.round(num) : Math.round(num * 12)
}

/**
 * Calcula a faixa etária com base nas configs do banco.
 * Retorna 'filhote' | 'adulto' | 'idoso' | 'todos'.
 */
export function calcFaixaEtaria(
  especie:   string,
  idadeStr:  string,
  configs:   FaixaConfig[],
): string {
  const config = configs.find(c => c.especie === especie)
  if (!config) return 'todos'

  const meses = idadeParaMeses(idadeStr)
  if (meses === null) return 'todos'

  if (config.filhote_ate_meses !== null && meses < config.filhote_ate_meses) return 'filhote'
  if (config.adulto_ate_meses  !== null && meses < config.adulto_ate_meses)  return 'adulto'
  if (config.adulto_ate_meses  !== null) return 'idoso'
  return 'todos'
}
