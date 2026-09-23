/**
 * Leitura de credenciais para os scripts avulsos deste diretório.
 *
 * Regra: nenhum arquivo de scripts/ pode ter chave em texto puro. Tudo vem do
 * ambiente, como já fazem migrate.mjs e seed-admins.ts.
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/<script>.ts     # projeto de DEV
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/<script>.ts
 *
 * Atenção: .env.local aponta para o projeto de DEV. Para rodar contra PRODUÇÃO,
 * exporte as variáveis de produção explicitamente na sessão do shell.
 */

const AJUDA =
  'Defina a variável antes de rodar, por exemplo:\n' +
  '  npx tsx --env-file=.env.local scripts/<script>.ts\n' +
  'ou exporte o valor na sessão do shell. Nunca escreva a chave no arquivo.'

export function requireEnv(nome: string): string {
  const valor = process.env[nome]
  if (!valor) {
    console.error(`\nErro: variável de ambiente ${nome} não definida.\n${AJUDA}\n`)
    process.exit(1)
  }
  return valor
}

export interface SupabaseAlvo {
  url: string
  key: string
  ref: string
  headers: Record<string, string>
}

/**
 * URL + service role do Supabase. Imprime o projeto alvo antes de qualquer
 * chamada, para não confundir dev (teozyceggokmsrmuitnj) com produção
 * (ykhshkgdikjplnedtxye).
 */
export function supabaseAlvo(): SupabaseAlvo {
  const bruta = process.env.SUPABASE_URL
    ? requireEnv('SUPABASE_URL')
    : requireEnv('NEXT_PUBLIC_SUPABASE_URL')
  const url = bruta.replace(/\/+$/, '')
  const key = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  const ref = url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1] ?? url

  console.error(`[scripts] projeto Supabase alvo: ${ref}`)

  return {
    url,
    key,
    ref,
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
  }
}

/** Credenciais da Evolution API (WhatsApp). */
export function evolutionAlvo() {
  const url = requireEnv('EVOLUTION_API_URL').replace(/\/+$/, '')
  const key = requireEnv('EVOLUTION_API_KEY')
  const instancia = requireEnv('EVOLUTION_INSTANCE')

  console.error(`[scripts] Evolution alvo: ${url} / instância ${instancia}`)

  return { url, key, instancia, headers: { 'Content-Type': 'application/json', apikey: key } }
}
