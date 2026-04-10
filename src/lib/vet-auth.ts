// Usa apenas Web Crypto (globalThis.crypto) — funciona em Node.js e Edge Runtime

const getSecret = () => process.env.AUTH_SECRET ?? 'mude-esta-chave-secreta-2024'

// ── Session token ─────────────────────────────────────────────────────────────
// Formato: "vetId:hmac"

async function makeHmac(vetId: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(String(vetId)),
  )
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function createVetSession(vetId: number): Promise<string> {
  return `${vetId}:${await makeHmac(vetId)}`
}

export async function parseVetSession(token: string): Promise<number | null> {
  const idx = token.indexOf(':')
  if (idx === -1) return null
  const vetId = parseInt(token.slice(0, idx))
  if (isNaN(vetId) || vetId <= 0) return null
  const expected = await createVetSession(vetId)
  return token === expected ? vetId : null
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
