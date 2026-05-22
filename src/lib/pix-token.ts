import { randomUUID } from 'crypto'

// Token PIX: UUID aleatório (128-bit) armazenado no banco
// Impossível de adivinhar ou enumerar — não contém o ID do agendamento
export function gerarPixToken(): string {
  return randomUUID()
}

// Valida formato básico de UUID (v4)
export function isPixTokenValido(token: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)
}
