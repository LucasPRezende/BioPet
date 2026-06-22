import { NextRequest, NextResponse } from 'next/server'
import {
  parseEvolutionWebhook,
  carregarConversa,
  salvarConversa,
  telefoneBloqueado,
  emAtendimentoHumano,
  type MensagemRecebida,
} from '@/lib/agente/conversa'
import { enfileirarMensagem } from '@/lib/agente/debounce'
import { responder, acionarHumanoPorErro } from '@/lib/agente/orquestrador'
import { sendWhatsAppText, getBase64FromMedia } from '@/lib/evolution'
import { transcreverAudio, lerImagemEncaminhamento } from '@/lib/agente/midia'

/**
 * Webhook de recepção do WhatsApp (Evolution API) — agente com IA.
 *
 * Texto: enfileira no debounce e responde uma vez. Áudio/imagem: busca o
 * conteúdo na Evolution, transcreve (áudio) ou lê o encaminhamento (imagem) com
 * Gemini, e então enfileira o texto resultante. Tudo fora do ciclo da resposta
 * HTTP (processo persistente PM2), então retornamos 200 na hora para a Evolution.
 */

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: 'agente/webhook' })
}

/** Processa o texto (já resolvido) com guard-rails + orquestrador + envio. */
async function processar(
  telefone: string,
  texto: string,
  msgId: string | undefined,
  pushName: string | undefined,
) {
  try {
    if (await telefoneBloqueado(telefone)) {
      console.log(`[agente/webhook] número bloqueado: ${telefone}`)
      return
    }
    if (await emAtendimentoHumano(telefone)) {
      console.log(`[agente/webhook] atendimento humano ativo: ${telefone}`)
      return
    }

    const estado = await carregarConversa(telefone)
    if (msgId && estado.ultimaMsgId === msgId) return

    console.log(`[agente/webhook] de ${pushName ?? '?'} (${telefone}): "${texto.slice(0, 80)}"`)

    const { resposta, historico } = await responder(telefone, texto, estado.historico)
    await salvarConversa(telefone, historico, msgId)
    await sendWhatsAppText(telefone, resposta)
  } catch (err) {
    console.error('[agente/webhook] erro ao processar:', err)
    await acionarHumanoPorErro(telefone, texto)
    await sendWhatsAppText(
      telefone,
      'Tive um probleminha técnico aqui 🙏 Já avisei a equipe e em breve alguém vai te responder.',
    ).catch(() => {})
  }
}

/** Resolve o texto de uma mídia (áudio/imagem) e enfileira para processamento. */
async function processarMidia(msg: MensagemRecebida) {
  const telefone = msg.telefone!
  try {
    const media = await getBase64FromMedia(msg.rawKey!)
    if (!media) {
      await sendWhatsAppText(telefone, 'Não consegui abrir seu arquivo 😕 Pode me mandar por texto?')
      return
    }

    let texto: string
    if (msg.tipoMidia === 'audio') {
      texto = await transcreverAudio(media.base64, media.mimetype)
    } else if (msg.tipoMidia === 'documento') {
      // Só sabemos ler PDF; outros documentos pedimos por outro meio.
      if (!/pdf/i.test(media.mimetype)) {
        await sendWhatsAppText(telefone, 'Recebi seu arquivo, mas só consigo ler PDF ou foto 😕 Pode mandar assim?')
        return
      }
      const desc = await lerImagemEncaminhamento(media.base64, media.mimetype, msg.legenda)
      texto =
        `[O cliente enviou um PDF (provável encaminhamento). Conteúdo extraído pelo sistema:]\n${desc}` +
        (msg.legenda ? `\n\n[Arquivo/legenda: ${msg.legenda}]` : '')
    } else {
      const desc = await lerImagemEncaminhamento(media.base64, media.mimetype, msg.legenda)
      texto =
        `[O cliente enviou uma imagem (provável encaminhamento). Conteúdo extraído pelo sistema:]\n${desc}` +
        (msg.legenda ? `\n\n[Legenda do cliente: ${msg.legenda}]` : '')
    }

    if (!texto || /^\(sem fala\)$/i.test(texto.trim())) {
      await sendWhatsAppText(telefone, 'Não consegui entender o áudio 😕 Pode repetir ou me mandar por texto?')
      return
    }

    enfileirarMensagem(telefone, texto, msg.msgId, msg.pushName, (t, id, nome) =>
      processar(telefone, t, id, nome),
    )
  } catch (err) {
    console.error('[agente/webhook] erro ao processar mídia:', err)
    await sendWhatsAppText(
      telefone,
      'Tive dificuldade para abrir seu arquivo 🙏 Pode me mandar as informações por texto?',
    ).catch(() => {})
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const msg = parseEvolutionWebhook(body)

  if (!msg.processavel) {
    return NextResponse.json({ ok: true, ignorado: msg.motivo })
  }

  const telefone = msg.telefone!

  if (msg.tipoMidia) {
    // Mídia: resolução assíncrona (busca + Gemini) sem segurar a resposta HTTP.
    void processarMidia(msg)
  } else {
    enfileirarMensagem(telefone, msg.texto!, msg.msgId, msg.pushName, (t, id, nome) =>
      processar(telefone, t, id, nome),
    )
  }

  return NextResponse.json({ ok: true })
}
