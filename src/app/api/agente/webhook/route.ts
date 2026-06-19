import { NextRequest, NextResponse } from 'next/server'
import {
  parseEvolutionWebhook,
  carregarConversa,
  salvarConversa,
  telefoneBloqueado,
  emAtendimentoHumano,
} from '@/lib/agente/conversa'
import { responder } from '@/lib/agente/orquestrador'
import { sendWhatsAppText } from '@/lib/evolution'

/**
 * Webhook de recepção do WhatsApp (Evolution API) — agente com IA.
 *
 * Fluxo: parse → descarta ruído → guard-rails (bloqueio / atendimento humano /
 * dedupe) → orquestrador (Claude) → persiste estado → responde via Evolution.
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

  try {
    // Guard-rails de recepção
    if (await telefoneBloqueado(telefone)) {
      console.log(`[agente/webhook] número bloqueado: ${telefone}`)
      return NextResponse.json({ ok: true, ignorado: 'bloqueado' })
    }
    if (await emAtendimentoHumano(telefone)) {
      console.log(`[agente/webhook] atendimento humano ativo: ${telefone}`)
      return NextResponse.json({ ok: true, ignorado: 'atendimento_humano' })
    }

    // Dedupe: a Evolution reenvia o mesmo evento às vezes
    const estado = await carregarConversa(telefone)
    if (msg.msgId && estado.ultimaMsgId === msg.msgId) {
      return NextResponse.json({ ok: true, ignorado: 'duplicada' })
    }

    console.log(`[agente/webhook] de ${msg.pushName ?? '?'} (${telefone}): "${msg.texto}"`)

    const { resposta, historico } = await responder(telefone, msg.texto!, estado.historico)

    await salvarConversa(telefone, historico, msg.msgId)
    await sendWhatsAppText(telefone, resposta)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[agente/webhook] erro:', err)
    // Não estoura para a Evolution ficar reenviando; avisa o cliente.
    await sendWhatsAppText(
      telefone,
      'Tive um probleminha técnico agora. Pode tentar de novo em instantes? 🙏',
    ).catch(() => {})
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
