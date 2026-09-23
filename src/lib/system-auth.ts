// Sistema de autenticação para system_users
// Session format: "v2:{userId}:{role}:{ps}:{exp}:{hmac}"
//   ps  = "1" (primeira_senha = true) | "0"
//   exp = expiração em epoch ms
//   hmac = HMAC-SHA256(secret, "v2:userId:role:ps:exp:{pwdTag}")
//   pwdTag = derivado do senha_hash atual → trocar a senha invalida sessões antigas
// Cookie name: sys_session
//
// O role dentro do token é apenas dado assinado redundante (entra no HMAC).
// A autorização usa o role LIDO DO BANCO na validação, junto com ativo — assim
// rebaixar ou desativar alguém derruba a sessão em até 60s (TTL do cache), sem
// depender da expiração do cookie nem da troca de senha.

import { fetchContaFresh, getContaCached } from './session-cache'

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 dias

const getSecret = () => {
  const s = process.env.AUTH_SECRET
  if (!s) throw new Error('AUTH_SECRET env var não configurada.')
  return s
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Tag curta e estável derivada do hash da senha. Muda quando a senha muda.
async function pwdTag(senhaHash: string | null | undefined): Promise<string> {
  if (!senhaHash) return ''
  return (await sha256Hex(senhaHash)).slice(0, 16)
}

async function makeHmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export interface SystemSessionData {
  userId: number
  role: string
  primeiraSSenha: boolean
}

export async function createSystemSession(
  userId: number,
  role: string,
  primeiraSSenha: boolean,
): Promise<string> {
  const conta = await fetchContaFresh('system_users', userId)
  const tag = await pwdTag(conta?.senha_hash)
  const ps  = primeiraSSenha ? '1' : '0'
  const exp = Date.now() + SESSION_TTL_MS
  const payload = `v2:${userId}:${role}:${ps}:${exp}`
  const hmac = await makeHmac(`${payload}:${tag}`)
  return `${payload}:${hmac}`
}

export async function parseSystemSession(token: string): Promise<SystemSessionData | null> {
  const parts = token.split(':')
  if (parts.length !== 6 || parts[0] !== 'v2') return null
  const [, userIdStr, role, ps, expStr, hmac] = parts

  const userId = parseInt(userIdStr)
  if (isNaN(userId) || userId <= 0) return null
  if (role !== 'admin' && role !== 'user') return null
  if (ps !== '0' && ps !== '1') return null

  const exp = parseInt(expStr)
  if (isNaN(exp) || Date.now() > exp) return null

  const conta = await getContaCached('system_users', userId)
  if (conta === undefined) return null
  // Conta desativada: sessão morta, mesmo com cookie válido e não expirado.
  // Mesmo critério do login (ativo nulo também barra, a coluna é nullable).
  if (!conta.ativo) return null

  const tag = await pwdTag(conta.senha_hash)
  const payload = `v2:${userId}:${role}:${ps}:${expStr}`
  const expectedHmac = await makeHmac(`${payload}:${tag}`)
  if (hmac !== expectedHmac) return null

  // Papel do banco, não do cookie. Qualquer valor inesperado cai no menor
  // privilégio ('user') em vez de herdar o que estava assinado no token.
  const roleAtual = conta.role === 'admin' ? 'admin' : 'user'

  return { userId, role: roleAtual, primeiraSSenha: ps === '1' }
}

export const SESSION_COOKIE_NAME = 'sys_session'

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 60 * 60 * 24 * 30, // 30 dias
  path: '/',
}
