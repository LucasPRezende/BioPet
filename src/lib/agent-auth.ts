/**
 * Autenticação das rotas internas do agente (/api/agente/*).
 *
 * Esta é a ÚNICA credencial dessa superfície — ela autoriza cancelar, remarcar,
 * cadastrar e disparar laudo escolhendo o telefone do tutor no corpo. Portanto:
 *
 * - comparação em tempo constante (não vaza a chave por timing);
 * - falha fechada se AGENT_API_KEY não estiver configurada;
 * - recusa explícita da chave fraca que vazou no bundle do navegador, mesmo que
 *   ela reapareça no ambiente (deploy antigo, .env esquecido, rollback).
 */
import { createHash, timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'

/**
 * Chave adivinhável (nome do produto + ano) que esteve hardcoded num componente
 * 'use client' e foi servida no bundle. Queimada — nunca mais vale.
 */
const CHAVE_QUEIMADA = 'biopet_agent_2026'

/** Tamanho mínimo aceitável para a chave (32 bytes em hex = 64 chars). */
const TAMANHO_MINIMO = 32

function iguais(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
}

export function verifyAgentKey(request: NextRequest): boolean {
  const esperada = process.env.AGENT_API_KEY

  if (!esperada) {
    console.error('[agent-auth] AGENT_API_KEY não configurada — rejeitando todas as requisições.')
    return false
  }
  if (esperada === CHAVE_QUEIMADA) {
    console.error(
      '[agent-auth] AGENT_API_KEY está com o valor queimado (vazou no bundle). ' +
      'Rotacione para 32+ bytes aleatórios — todas as requisições estão sendo rejeitadas.',
    )
    return false
  }
  if (esperada.length < TAMANHO_MINIMO) {
    console.warn(
      `[agent-auth] AGENT_API_KEY tem só ${esperada.length} caracteres — o mínimo recomendado é ${TAMANHO_MINIMO}.`,
    )
  }

  const recebida = request.headers.get('x-api-key')
  if (!recebida) return false

  return iguais(recebida, esperada)
}
