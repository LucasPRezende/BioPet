// Neutraliza os caracteres de controle do parser de filtros .or() do PostgREST
// (vírgula e parênteses), evitando que um termo de busca injete condições extras.
// Preserva letras, números, espaços, pontos, hífens e acentos — nomes comuns
// (ex.: "J.R.", "Maria-Clara") continuam buscáveis normalmente.
export function sanitizeOrTerm(termo: string): string {
  return termo.replace(/[,()]/g, ' ').replace(/\s+/g, ' ').trim()
}
