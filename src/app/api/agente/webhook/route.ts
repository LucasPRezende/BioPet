import { NextRequest, NextResponse } from 'next/server'

/**
 * Webhook de recepção de mensagens do WhatsApp (Evolution API).
 *
 * ETAPA 1 (captura): por enquanto este endpoint apenas RECEBE e LOGA o payload
 * cru que a Evolution dispara, para descobrirmos o formato real do evento
 * `messages.upsert` desta instância. Ainda NÃO responde nada — assim não há
 * risco de loop (mensagens nossas vêm com `fromMe: true`) antes de o parse
 * estar pronto.
 *
 * Próximas etapas (depois de vermos um payload real):
 *  - parse: extrair telefone, texto, msgId; ignorar `fromMe` e grupos (@g.us)
 *  - estado da conversa (tabela `conversas`)
 *  - orquestrador + resposta via Evolution (sendWhatsAppText)
 */

export const dynamic = 'force-dynamic'

// A Evolution (e alguns painéis) fazem um GET para verificar se o webhook está no ar.
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: 'agente/webhook' })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)

  // Log greppable nos logs da VPS: `pm2 logs | grep '[agente/webhook]'`
  console.log('[agente/webhook] payload recebido:\n' + JSON.stringify(body, null, 2))

  // Responde 200 rápido para a Evolution não reenfileirar/reenviar.
  return NextResponse.json({ ok: true })
}
