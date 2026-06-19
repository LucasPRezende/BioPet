import { NextRequest, NextResponse } from 'next/server'
import {
  parseEvolutionWebhook,
  carregarConversa,
  salvarConversa,
  telefoneBloqueado,
  emAtendimentoHumano,
} from '@/lib/agente/conversa'
import { enfileirarMensagem } from '@/lib/agente/debounce'
import { responder } from '@/lib/agente/orquestrador'
import { sendWhatsAppText } from '@/lib/evolution'

/**
 * Webhook de recepção do WhatsApp (Evolution API) — agente com IA.
 *
 * A mensagem é enfileirada no debounce (junta mensagens quebradas) e respondida
 * uma vez quando a janela fecha. O processamento roda fora do ciclo da resposta
 * HTTP (processo persistente PM2), então retornamos 200 na hora para a Evolution.
 */

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: 'agente/webhook' })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const msg = parseEvolutionWebhook(body)

  if (!msg.processavel) {
    return NextResponse.json({ ok: true, ignorado: msg.motivo })
  }

  const telefone = msg.telefone!

  // Acumula mensagens fragmentadas; processa o conjunto após a janela de silêncio.
  enfileirarMensagem(telefone, msg.texto!, msg.msgId, msg.pushName, async (texto, msgId, pushName) => {
    try {
      // Guard-rails (avaliados ao fechar a janela)
      if (await telefoneBloqueado(telefone)) {
        console.log(`[agente/webhook] número bloqueado: ${telefone}`)
        return
      }
      if (await emAtendimentoHumano(telefone)) {
        console.log(`[agente/webhook] atendimento humano ativo: ${telefone}`)
        return
      }

      const estado = await carregarConversa(telefone)
      if (msgId && estado.ultimaMsgId === msgId) return // já processada

      console.log(`[agente/webhook] de ${pushName ?? '?'} (${telefone}): "${texto}"`)

      const { resposta, historico } = await responder(telefone, texto, estado.historico)

      await salvarConversa(telefone, historico, msgId)
      await sendWhatsAppText(telefone, resposta)
    } catch (err) {
      console.error('[agente/webhook] erro ao processar:', err)
      await sendWhatsAppText(
        telefone,
        'Tive um probleminha técnico agora. Pode tentar de novo em instantes? 🙏',
      ).catch(() => {})
    }
  })

  return NextResponse.json({ ok: true })
}
