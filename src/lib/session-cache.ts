// Cache em memória dos dados de conta usados na validação de sessão, para
// reduzir consultas ao banco. TTL curto: revogar uma sessão (trocar a senha,
// desativar ou rebaixar o usuário) leva no máximo TTL_MS para propagar entre
// dispositivos e instâncias.
//
// Retorno de getContaCached / fetchContaFresh:
//   ContaRow  → registro atual
//   undefined → registro não encontrado
import { supabase } from './supabase'

const TTL_MS = 60_000

// Colunas lidas por tabela, no MESMO select do hash — sem custo de consulta
// extra. system_users traz role e ativo (a autorização decide pelo papel do
// banco, nunca pelo que veio assinado no cookie); clinicas traz ativo para que
// desativar uma clínica derrube a sessão dela.
const COLUNAS: Record<string, string> = {
  system_users: 'senha_hash, role, ativo',
  clinicas:     'senha_hash, ativo',
  veterinarios: 'senha_hash',
}

export interface ContaRow {
  senha_hash: string | null
  role?: string | null
  ativo?: boolean | null
}

type CacheValue = ContaRow | undefined
const cache = new Map<string, { value: CacheValue; exp: number }>()

const keyOf = (tabela: string, id: number) => `${tabela}:${id}`

// Lê do banco SEMPRE (ignora cache) e atualiza o cache. Usado ao criar sessão,
// onde precisamos do estado mais recente (ex.: logo após troca de senha).
export async function fetchContaFresh(tabela: string, id: number): Promise<CacheValue> {
  const { data } = await supabase
    .from(tabela)
    .select(COLUNAS[tabela] ?? 'senha_hash')
    .eq('id', id)
    .maybeSingle()
  const row = data as ContaRow | null
  const value: CacheValue = row
    ? { senha_hash: row.senha_hash ?? null, role: row.role ?? null, ativo: row.ativo ?? null }
    : undefined
  cache.set(keyOf(tabela, id), { value, exp: Date.now() + TTL_MS })
  return value
}

// Lê do cache se válido; senão consulta o banco e cacheia. Usado na validação.
export async function getContaCached(tabela: string, id: number): Promise<CacheValue> {
  const k = keyOf(tabela, id)
  const hit = cache.get(k)
  if (hit && hit.exp > Date.now()) return hit.value
  return fetchContaFresh(tabela, id)
}

// Descarta a entrada cacheada — chamado quando o próprio processo altera a
// conta (desativar, rebaixar, resetar senha) para revogar na hora em vez de
// esperar o TTL. Outras instâncias continuam limitadas ao TTL.
export function invalidarConta(tabela: string, id: number): void {
  cache.delete(keyOf(tabela, id))
}
