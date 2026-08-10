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

// ─── Cliente da API de fretes (cotação, carrinho, compra, etiqueta) ─────────
// Endpoints confirmados na doc técnica deles (docs.melhorenvio.com.br/reference).

const USER_AGENT = 'BioPet Vet (contato@biopetvet.com)'

async function apiFetch<T>(path: string, body: unknown): Promise<T> {
  const token = await getValidAccessToken()
  const res = await fetch(`${baseUrl()}/api/v2/me${path}`, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'User-Agent':   USER_AGENT,
      'Content-Type': 'application/json',
      Accept:         'application/json',
    },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(`Melhor Envio ${path} falhou (${res.status}): ${JSON.stringify(data)}`)
  }
  return data as T
}

export interface Endereco {
  cep:        string
  logradouro: string
  numero:     string
  bairro:     string
  cidade:     string
  uf:         string
  telefone?:  string  // exigido por algumas transportadoras (ex: Jadlog) no /cart
  cnpj?:      string  // documento do remetente/destinatário, exigido no /cart
}

export interface Pacote {
  altura_cm: number
  largura_cm: number
  comprimento_cm: number
  peso_kg: number
}

// Chutes de mercado pra caixa de isopor + gelo + tubos — sem medida real ainda
// (não bloqueia a Fase 4, ver LABS_PARCEIROS.md seção "Estoque de insumos").
// Ajustar aqui quando tiver os presets de caixa de verdade.
export const PRESET_CAIXA_PADRAO: Pacote = {
  altura_cm: 20, largura_cm: 20, comprimento_cm: 20, peso_kg: 1.5,
}

export async function enderecoOrigemBioPet(): Promise<Endereco> {
  const { data } = await supabase
    .from('system_config').select('value').eq('key', 'biopet_endereco_origem').maybeSingle()
  if (!data?.value) throw new Error('Endereço de origem da BioPet não configurado (system_config.biopet_endereco_origem).')
  return JSON.parse(data.value)
}

export interface OpcaoFrete {
  id:            number
  name:          string
  price:         string | null
  custom_price:  string | null
  delivery_time: number | null
  company:       { id: number; name: string; picture?: string }
  error?:        string
}

/** Cotação — retorna as opções de transportadora/preço/prazo pra uma rota. */
export async function cotarFrete(
  origem: Endereco, destino: Endereco, pacote: Pacote, valorSegurado: number,
): Promise<OpcaoFrete[]> {
  return apiFetch<OpcaoFrete[]>('/shipment/calculate', {
    from: { postal_code: origem.cep },
    to:   { postal_code: destino.cep },
    products: [{
      id:              'pedido-lab',
      width:           pacote.largura_cm,
      height:          pacote.altura_cm,
      length:          pacote.comprimento_cm,
      weight:          pacote.peso_kg,
      insurance_value: valorSegurado,
      quantity:        1,
    }],
    options: { receipt: false, own_hand: false },
  })
}

interface ItemCarrinho {
  id:       string
  protocol: string
  price:    number
}

/** Adiciona o envio escolhido ao carrinho. Retorna o id (UUID) do pedido no carrinho. */
export async function adicionarAoCarrinho(params: {
  serviceId: number
  origem:    Endereco
  destino:   Endereco
  pacote:    Pacote
  valorSegurado: number
  nomeProduto: string
}): Promise<ItemCarrinho> {
  const { serviceId, origem, destino, pacote, valorSegurado, nomeProduto } = params
  return apiFetch<ItemCarrinho>('/cart', {
    service: serviceId,
    from: {
      name: 'BioPet Vet', document: '', company_document: origem.cnpj ?? '', phone: origem.telefone ?? '',
      address: origem.logradouro, number: origem.numero, district: origem.bairro,
      city: origem.cidade, state_abbr: origem.uf, postal_code: origem.cep, country_id: 'BR',
    },
    to: {
      name: nomeProduto, document: '', company_document: destino.cnpj ?? '', phone: destino.telefone ?? '',
      address: destino.logradouro, number: destino.numero, district: destino.bairro,
      city: destino.cidade, state_abbr: destino.uf, postal_code: destino.cep, country_id: 'BR',
    },
    products: [{ name: nomeProduto, quantity: '1', unitary_value: String(valorSegurado) }],
    volumes: [{
      height: pacote.altura_cm, width: pacote.largura_cm,
      length: pacote.comprimento_cm, weight: pacote.peso_kg,
    }],
    options: {
      insurance_value: valorSegurado, receipt: false, own_hand: false,
      reverse: false, non_commercial: true,
    },
  })
}

/** Paga os envios do carrinho (debita saldo pré-pago da conta Melhor Envio). */
export async function comprarFretes(orderIds: string[]): Promise<unknown> {
  return apiFetch('/shipment/checkout', { orders: orderIds })
}

/** Gera a etiqueta (assíncrono — dar um intervalo antes de chamar imprimirEtiquetas). */
export async function gerarEtiquetas(orderIds: string[]): Promise<unknown> {
  return apiFetch('/shipment/generate', { orders: orderIds })
}

/** Retorna a URL do PDF da etiqueta pronta pra impressão. */
export async function imprimirEtiquetas(orderIds: string[]): Promise<string> {
  const data = await apiFetch<{ url: string }>('/shipment/print', { orders: orderIds, mode: 'public' })
  return data.url
}

export interface StatusRastreio {
  status:      string
  tracking:    string | null
  posted_at:   string | null
  delivered_at: string | null
  canceled_at: string | null
}

export async function rastrearEnvios(orderIds: string[]): Promise<Record<string, StatusRastreio>> {
  return apiFetch<Record<string, StatusRastreio>>('/shipment/tracking', { orders: orderIds })
}
