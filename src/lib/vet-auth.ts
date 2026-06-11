// Usa Web Crypto (globalThis.crypto) + consulta ao banco para validar a sessão.
import { fetchSenhaHashFresh, getSenhaHashCached } from './session-cache'

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 dias

const getSecret = () => {
  const s = process.env.AUTH_SECRET
  if (!s) throw new Error('AUTH_SECRET env var não configurada.')
  return s
}

// ── Session token ─────────────────────────────────────────────────────────────
// Formato: "v2:{vetId}:{exp}:{hmac}"
//   exp = expiração em epoch ms
//   hmac = HMAC-SHA256(secret, "v2:vetId:exp:{pwdTag}")
//   pwdTag = derivado do senha_hash atual → trocar a senha invalida sessões antigas

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

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

export async function createVetSession(vetId: number): Promise<string> {
  const senhaHash = await fetchSenhaHashFresh('veterinarios', vetId)
  const tag = await pwdTag(senhaHash)
  const exp = Date.now() + SESSION_TTL_MS
  const payload = `v2:${vetId}:${exp}`
  const hmac = await makeHmac(`${payload}:${tag}`)
  return `${payload}:${hmac}`
}

export async function parseVetSession(token: string): Promise<number | null> {
  const parts = token.split(':')
  if (parts.length !== 4 || parts[0] !== 'v2') return null
  const vetId = parseInt(parts[1])
  if (isNaN(vetId) || vetId <= 0) return null

  const exp = parseInt(parts[2])
  if (isNaN(exp) || Date.now() > exp) return null

  const senhaHash = await getSenhaHashCached('veterinarios', vetId)
  if (senhaHash === undefined) return null

  const tag = await pwdTag(senhaHash)
  const expected = await makeHmac(`v2:${vetId}:${parts[2]}:${tag}`)
  return parts[3] === expected ? vetId : null
}

// ── Password hashing (PBKDF2, sem dependência externa) ────────────────────────

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const saltHex = Array.from(salt)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100_000 },
    key,
    256,
  )
  const hashHex = Array.from(new Uint8Array(bits))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  return `pbkdf2:${saltHex}:${hashHex}`
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split(':')
  if (parts.length !== 3 || parts[0] !== 'pbkdf2') return false
  const saltHex = parts[1]
  const expectedHex = parts[2]
  const salt = new Uint8Array(
    saltHex.match(/.{2}/g)!.map(b => parseInt(b, 16)),
  )
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100_000 },
    key,
    256,
  )
  const hashHex = Array.from(new Uint8Array(bits))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  return hashHex === expectedHex
}
