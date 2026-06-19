import { NextRequest, NextResponse } from 'next/server'
import { parseEvolutionWebhook } from '@/lib/agente/conversa'
import { sendWhatsAppText } from '@/lib/evolution'

/**
 * Webhook de recepção de mensagens do WhatsApp (Evolution API).
 *
 * ETAPA 2 (echo): faz o parse do evento `messages.upsert`, descarta ruído
 * (`fromMe`, grupos, mensagens sem texto, remetente sem telefone) e responde
 * um echo simples — para validar o round-trip completo (recepção → envio)
 * nesta instância, incluindo o endereçamento @lid.
 *
 * Próxima etapa: estado da conversa (tabela `conversas`) + orquestrador (IA).
 */

export const dynamic = 'force-dynamic'

// A Evolution faz um GET para verificar se o webhook está no ar.
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: 'agente/webhook' })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)

  const msg = parseEvolutionWebhook(body)

  if (!msg.processavel) {
    console.log(`[agente/webhook] ignorado (${msg.motivo})`)
    return NextResponse.json({ ok: true, ignorado: msg.motivo })
  }

  console.log(
    `[agente/webhook] de ${msg.pushName ?? '?'} (${msg.telefone}): "${msg.texto}"`,
  )

  // ETAPA 2 — echo de confirmação (substituído pelo orquestrador na próxima etapa).
  await sendWhatsAppText(
    msg.telefone!,
    `Recebi sua mensagem: "${msg.texto}" ✅\n_(assistente da BioPet em construção)_`,
  )

  return NextResponse.json({ ok: true })
}
