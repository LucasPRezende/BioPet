// Neutraliza os caracteres de controle do parser de filtros .or() do PostgREST
// (vírgula e parênteses), evitando que um termo de busca injete condições extras.
// Preserva letras, números, espaços, pontos, hífens e acentos — nomes comuns
// (ex.: "J.R.", "Maria-Clara") continuam buscáveis normalmente.
export function sanitizeOrTerm(termo: string): string {
  return termo.replace(/[,()]/g, ' ').replace(/\s+/g, ' ').trim()
}

// Monta o filtro .or() de uma busca textual já sanitizada.
// Use SEMPRE isto em vez de interpolar o termo na string do .or() à mão:
// é o único ponto onde o termo do usuário encosta no parser do PostgREST.
// Devolve null quando o termo vira vazio depois da limpeza (ex.: ",,,"),
// caso em que o chamador deve simplesmente não aplicar o filtro.
export function ilikeOrFilter(colunas: string[], termo: string): string | null {
  const safe = sanitizeOrTerm(termo)
  if (!safe) return null
  return colunas.map(col => `${col}.ilike.%${safe}%`).join(',')
}
