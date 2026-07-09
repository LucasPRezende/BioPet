/**
 * Normalização de telefone para dígitos com DDI (código do país).
 *
 * Regras:
 * - Começa com "+": DDI explícito — só remove a formatação (ex.: "+54 9 11 ..." → "549...").
 * - Já começa com 55: mantém como está.
 * - Até 11 dígitos: formato local BR (DDD + número) — prefixa o DDI 55.
 * - Mais de 11 dígitos: já veio com DDI de outro país (ex.: 54 Argentina) — mantém.
 *
 * Um número BR local nunca passa de 11 dígitos (DDD + 9), então qualquer coisa
 * maior sem o 55 na frente é um número internacional e não deve ganhar o 55.
 */
export function normalizeTelefone(raw: string | null | undefined): string {
  const str = String(raw ?? '').trim()
  const ddiExplicito = str.startsWith('+')
  const digits = str.replace(/\D/g, '')
  if (!digits) return ''
  if (ddiExplicito) return digits
  if (digits.startsWith('55')) return digits
  if (digits.length <= 11) return `55${digits}`
  return digits
}
