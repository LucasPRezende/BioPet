/**
 * Autenticação do webhook do agente de WhatsApp.
 *
 * O corpo que a Evolution API entrega é 100% controlável por quem consegue
 * fazer um POST no endpoint — inclusive o `key.remoteJid`, que é a identidade
 * que o resto do agente usa para cancelar/remarcar agendamentos e enviar laudo.
 * Sem segredo no webhook, qualquer um da internet se passa por qualquer tutor.
 *
 * Por isso exigimos um segredo compartilhado em header ANTES de olhar o corpo.
 * Falha fechada: sem `EVOLUTION_WEBHOOK_SECRET` no ambiente, nada passa (mesma
 * postura de `pagamentos/webhook/route.ts`).
 *
 * Do lado da Evolution, o header é configurado no `/webhook/set/{instance}`:
 *   "headers": { "x-webhook-token": "<mesmo valor de EVOLUTION_WEBHOOK_SECRET>" }
 */
import { createHash, timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'

/** Headers aceitos para o segredo (a Evolution só deixa configurar por nome). */
const HEADERS_SEGREDO = ['x-webhook-token', 'apikey'] as const

export type MotivoRecusa = 'sem_segredo_configurado' | 'header_ausente' | 'segredo_invalido'

export type ResultadoAuth = { ok: true } | { ok: false; motivo: MotivoRecusa }

/**
 * Compara em tempo constante. Passa pelo SHA-256 antes para (a) igualar o
 * tamanho dos buffers — `timingSafeEqual` lança se diferirem — e (b) não vazar
 * o comprimento do segredo pelo tempo de resposta.
 */
function segredosIguais(recebido: string, esperado: string): boolean {
  const a = createHash('sha256').update(recebido).digest()
  const b = createHash('sha256').update(esperado).digest()
  return timingSafeEqual(a, b)
}

/**
 * Valida o segredo do webhook. Retorna o motivo da recusa para log — nunca
 * devolva o motivo ao cliente (serve de oráculo pra quem está tentando).
 */
export function verificarSegredoWebhook(request: NextRequest): ResultadoAuth {
  const esperado = process.env.EVOLUTION_WEBHOOK_SECRET
  if (!esperado) return { ok: false, motivo: 'sem_segredo_configurado' }

  const recebido = HEADERS_SEGREDO.map((h) => request.headers.get(h)).find(
    (v): v is string => typeof v === 'string' && v.length > 0,
  )
  if (!recebido) return { ok: false, motivo: 'header_ausente' }

  return segredosIguais(recebido, esperado) ? { ok: true } : { ok: false, motivo: 'segredo_invalido' }
}

/** Loga a recusa no nível certo (falta de config é erro nosso, não do cliente). */
export function logarRecusa(motivo: MotivoRecusa): void {
  if (motivo === 'sem_segredo_configurado') {
    console.error(
      '[agente/webhook] EVOLUTION_WEBHOOK_SECRET não configurado — rejeitando todas as requisições.',
    )
    return
  }
  console.warn(`[agente/webhook] requisição rejeitada (${motivo})`)
}
