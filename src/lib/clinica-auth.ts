// Autenticação para clínicas parceiras
// Session format: "v2:{clinicaId}:{ps}:{exp}:{hmac}"
//   ps  = "1" (primeira_senha = true) | "0"
//   exp = expiração em epoch ms
//   hmac = HMAC-SHA256(secret, "v2:clinicaId:ps:exp:{pwdTag}")
//   pwdTag = derivado do senha_hash atual → trocar a senha invalida sessões antigas
// Cookie name: clinica_session

import { supabase } from './supabase'

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

export interface ClinicaSessionData {
  clinicaId: number
  primeiraSenha: boolean
}

export async function createClinicaSession(
  clinicaId: number,
  primeiraSenha: boolean,
): Promise<string> {
  const { data } = await supabase.from('clinicas').select('senha_hash').eq('id', clinicaId).single()
  const tag = await pwdTag(data?.senha_hash)
  const ps  = primeiraSenha ? '1' : '0'
  const exp = Date.now() + SESSION_TTL_MS
  const payload = `v2:${clinicaId}:${ps}:${exp}`
  const hmac = await makeHmac(`${payload}:${tag}`)
  return `${payload}:${hmac}`
}

export async function parseClinicaSession(token: string): Promise<ClinicaSessionData | null> {
  const parts = token.split(':')
  if (parts.length !== 5 || parts[0] !== 'v2') return null
  const [, clinicaIdStr, ps, expStr, hmac] = parts

  const clinicaId = parseInt(clinicaIdStr)
  if (isNaN(clinicaId) || clinicaId <= 0) return null
  if (ps !== '0' && ps !== '1') return null

  const exp = parseInt(expStr)
  if (isNaN(exp) || Date.now() > exp) return null

  const { data } = await supabase.from('clinicas').select('senha_hash').eq('id', clinicaId).single()
  if (!data) return null

  const tag = await pwdTag(data.senha_hash)
  const expectedHmac = await makeHmac(`v2:${clinicaId}:${ps}:${expStr}:${tag}`)
  if (hmac !== expectedHmac) return null

  return { clinicaId, primeiraSenha: ps === '1' }
}

export const CLINICA_COOKIE_NAME = 'clinica_session'

export const CLINICA_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 60 * 60 * 24 * 7,
  path: '/',
}

// ── Password hashing (PBKDF2) ─────────────────────────────────────────────────

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

export function gerarSenhaTemporaria(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let senha = ''
  const arr = crypto.getRandomValues(new Uint8Array(8))
  for (let i = 0; i < arr.length; i++) {
    senha += chars[arr[i] % chars.length]
  }
  return senha
}

export function gerarTokenConvite(): string {
  const arr = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(arr)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
