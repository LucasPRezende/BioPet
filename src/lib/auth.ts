import 'server-only'
import crypto from 'crypto'

const PASSWORD = process.env.ADMIN_PASSWORD ?? 'vet123'
const SECRET = process.env.AUTH_SECRET ?? 'mude-esta-chave-secreta-2024'

export function verifyPassword(input: string): boolean {
  return input === PASSWORD
}

/** Token de sessão derivado da senha + segredo. Mesmo algoritmo do middleware (SHA-256). */
export function getSessionToken(): string {
  return crypto.createHash('sha256').update(PASSWORD + SECRET).digest('hex')
}
