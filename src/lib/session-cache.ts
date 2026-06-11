// Cache em memória do senha_hash por usuário, para reduzir consultas ao banco
// na validação de sessão. TTL curto: a invalidação ao trocar a senha leva no
// máximo TTL_MS para propagar entre dispositivos.
//
// Retorno de getSenhaHashCached / fetchSenhaHashFresh:
//   string    → hash atual
//   null      → registro existe mas senha_hash é null
//   undefined → registro não encontrado
import { supabase } from './supabase'

const TTL_MS = 60_000

type CacheValue = string | null | undefined
const cache = new Map<string, { value: CacheValue; exp: number }>()

const keyOf = (tabela: string, id: number) => `${tabela}:${id}`

// Lê do banco SEMPRE (ignora cache) e atualiza o cache. Usado ao criar sessão,
// onde precisamos do hash mais recente (ex.: logo após troca de senha).
export async function fetchSenhaHashFresh(tabela: string, id: number): Promise<CacheValue> {
  const { data } = await supabase.from(tabela).select('senha_hash').eq('id', id).maybeSingle()
  const value: CacheValue = data ? (data.senha_hash ?? null) : undefined
  cache.set(keyOf(tabela, id), { value, exp: Date.now() + TTL_MS })
  return value
}

// Lê do cache se válido; senão consulta o banco e cacheia. Usado na validação.
export async function getSenhaHashCached(tabela: string, id: number): Promise<CacheValue> {
  const k = keyOf(tabela, id)
  const hit = cache.get(k)
  if (hit && hit.exp > Date.now()) return hit.value
  return fetchSenhaHashFresh(tabela, id)
}
