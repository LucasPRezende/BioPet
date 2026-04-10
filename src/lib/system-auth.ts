// Sistema de autenticação para system_users
// Session format: "{userId}:{role}:{ps}:{hmac(userId:role:ps)}"
// ps = "1" (primeira_senha = true) | "0"
// Cookie name: sys_session

const getSecret = () => process.env.AUTH_SECRET ?? 'mude-esta-chave-secreta-2024'

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
  const ps = primeiraSSenha ? '1' : '0'
  const payload = `${userId}:${role}:${ps}`
  const hmac = await makeHmac(payload)
  return `${payload}:${hmac}`
}

export async function parseSystemSession(token: string): Promise<SystemSessionData | null> {
  // Last segment is HMAC (64 hex chars), rest is payload
  const lastColon = token.lastIndexOf(':')
  if (lastColon === -1) return null
  const payload = token.slice(0, lastColon)
  const hmac = token.slice(lastColon + 1)

  const parts = payload.split(':')
  if (parts.length !== 3) return null

  const userId = parseInt(parts[0])
  const role = parts[1]
  const ps = parts[2]

  if (isNaN(userId) || userId <= 0) return null
  if (role !== 'admin' && role !== 'user') return null
  if (ps !== '0' && ps !== '1') return null

  const expectedHmac = await makeHmac(payload)
  if (hmac !== expectedHmac) return null

  return { userId, role, primeiraSSenha: ps === '1' }
}

export const SESSION_COOKIE_NAME = 'sys_session'

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 60 * 60 * 24 * 7, // 7 dias
  path: '/',
}
