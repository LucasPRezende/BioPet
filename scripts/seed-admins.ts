/**
 * Seed inicial: cria Andreza e Luciana na tabela system_users.
 * Só precisa rodar uma vez, logo após a migration SQL.
 *
 * Uso:
 *   npx tsx scripts/seed-admins.ts
 *
 * Variáveis de ambiente necessárias (.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import * as crypto from 'crypto'

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('')
  const key = await globalThis.crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await globalThis.crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100_000 }, key, 256)
  const hashHex = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('')
  return `pbkdf2:${saltHex}:${hashHex}`
}

async function main() {
  const { data: existing } = await supabase.from('system_users').select('id').limit(1)
  if (existing && existing.length > 0) {
    console.log('Usuários já existem — seed desnecessário.')
    return
  }

  const andrezaHash = await hashPassword('andreza123')
  const lucianaHash = await hashPassword('luciana123')

  const { error } = await supabase.from('system_users').insert([
    { nome: 'Andreza Moreira de Souza', email: 'andreza@biopet.com', senha_hash: andrezaHash, role: 'admin', ativo: true, primeira_senha: true },
    { nome: 'Luciana Pereira de Brites', email: 'luciana@biopet.com', senha_hash: lucianaHash, role: 'admin', ativo: true, primeira_senha: true },
  ])

  if (error) { console.error('Erro:', error.message); process.exit(1) }

  console.log('Usuários criados:')
  console.log('  andreza@biopet.com  / andreza123  (troca obrigatória no primeiro login)')
  console.log('  luciana@biopet.com  / luciana123  (troca obrigatória no primeiro login)')
}

main()
