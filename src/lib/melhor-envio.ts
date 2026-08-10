/**
 * melhor-envio.ts — integração OAuth2 com o Melhor Envio (Labs Parceiros,
 * Fase 4). Encapsula como asaas.ts/mp-preference.ts já fazem com APIs
 * externas. Por ora só o fluxo de conexão (obter/renovar token) — cotação,
 * compra e impressão de etiqueta entram depois de validar a conexão real.
 *
 * Fluxo de conexão (uma vez, feito pelo admin):
 *   GET /api/labs/frete/conectar → redireciona pro authorize da ME
 *   GET /api/labs/frete/callback → troca o code por access/refresh token,
 *                                   guarda em system_config
 *
 * Depois disso, getValidAccessToken() renova sozinho quando o access_token
 * (validade 30 dias) estiver perto de expirar, usando o refresh_token
 * (validade 45 dias).
 *
 * NOTA: o endpoint de troca de token (`/oauth/token`) segue o padrão Laravel
 * Passport, que é o que a Melhor Envio usa publicamente — a documentação
 * deles não expôs a referência técnica desses parâmetros exatos no momento
 * desta implementação (site com conteúdo renderizado em JS). Confirmar no
 * primeiro /conectar real e ajustar se a resposta vier em formato diferente.
 */
import 'server-only'
import { supabase } from './supabase'

const SCOPES = [
  'shipping-calculate',
  'shipping-checkout',
  'shipping-generate',
  'shipping-print',
  'shipping-tracking',
  'cart-write',
  'cart-read',
].join(' ')

const CONFIG_KEYS = {
  accessToken:  'melhor_envio_access_token',
  refreshToken: 'melhor_envio_refresh_token',
  expiresAt:    'melhor_envio_expires_at',
} as const

function env(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} não configurada.`)
  return v
}

function baseUrl(): string {
  return env('MELHOR_ENVIO_BASE_URL').replace(/\/$/, '')
}

export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id:     env('MELHOR_ENVIO_CLIENT_ID'),
    redirect_uri:  env('MELHOR_ENVIO_REDIRECT_URI'),
    response_type: 'code',
    state,
    scope:         SCOPES,
  })
  return `${baseUrl()}/oauth/authorize?${params.toString()}`
}

interface TokenResponse {
  token_type:    string
  expires_in:    number
  access_token:  string
  refresh_token: string
}

async function trocarToken(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${baseUrl()}/oauth/token`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body:    JSON.stringify(body),
  })
  if (!res.ok) {
    const texto = await res.text().catch(() => '')
    throw new Error(`Falha ao obter token do Melhor Envio (${res.status}): ${texto}`)
  }
  return res.json()
}

async function trocarCodePorToken(code: string): Promise<TokenResponse> {
  return trocarToken({
    grant_type:    'authorization_code',
    client_id:     env('MELHOR_ENVIO_CLIENT_ID'),
    client_secret: env('MELHOR_ENVIO_CLIENT_SECRET'),
    redirect_uri:  env('MELHOR_ENVIO_REDIRECT_URI'),
    code,
  })
}

async function renovarToken(refreshToken: string): Promise<TokenResponse> {
  return trocarToken({
    grant_type:    'refresh_token',
    client_id:     env('MELHOR_ENVIO_CLIENT_ID'),
    client_secret: env('MELHOR_ENVIO_CLIENT_SECRET'),
    refresh_token: refreshToken,
  })
}

async function salvarTokens(tokens: TokenResponse): Promise<void> {
  const expiraEm = new Date(Date.now() + tokens.expires_in * 1000).toISOString()
  const now = new Date().toISOString()
  const { error } = await supabase.from('system_config').upsert([
    { key: CONFIG_KEYS.accessToken,  value: tokens.access_token,  updated_at: now },
    { key: CONFIG_KEYS.refreshToken, value: tokens.refresh_token, updated_at: now },
    { key: CONFIG_KEYS.expiresAt,    value: expiraEm,             updated_at: now },
  ], { onConflict: 'key' })
  if (error) throw new Error(`Falha ao salvar tokens do Melhor Envio: ${error.message}`)
}

/** Troca o code recebido no callback por tokens e persiste. */
export async function conectar(code: string): Promise<void> {
  const tokens = await trocarCodePorToken(code)
  await salvarTokens(tokens)
}

async function lerConfig(): Promise<Record<string, string>> {
  const { data: rows } = await supabase
    .from('system_config')
    .select('key, value')
    .in('key', Object.values(CONFIG_KEYS))

  const map: Record<string, string> = {}
  for (const row of rows ?? []) map[row.key] = row.value
  return map
}

/** Retorna um access_token válido, renovando via refresh_token se necessário. */
export async function getValidAccessToken(): Promise<string> {
  const map = await lerConfig()
  const accessToken  = map[CONFIG_KEYS.accessToken]
  const refreshToken = map[CONFIG_KEYS.refreshToken]
  const expiresAt    = map[CONFIG_KEYS.expiresAt]

  if (!accessToken || !refreshToken) {
    throw new Error('Melhor Envio não conectado — acesse /api/labs/frete/conectar como admin.')
  }

  // Renova com 1 dia de folga antes de expirar.
  const expiraLogo = !expiresAt || new Date(expiresAt).getTime() - Date.now() < 24 * 60 * 60 * 1000
  if (!expiraLogo) return accessToken

  const tokens = await renovarToken(refreshToken)
  await salvarTokens(tokens)
  return tokens.access_token
}

export async function isConectado(): Promise<boolean> {
  const map = await lerConfig()
  return !!map[CONFIG_KEYS.accessToken]
}
