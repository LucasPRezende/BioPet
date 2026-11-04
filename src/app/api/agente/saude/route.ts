import { NextRequest, NextResponse } from 'next/server'
import { verifyAgentKey } from '@/lib/agent-auth'
import { enviarTelegram } from '@/lib/telegram'
import { aplicarDecisao, decidirVigia, lerEstadoVigia } from '@/lib/agente/vigia'

/**
 * Vigia do agente: chamado por cron da VPS a cada 5 min. Decide se a IA parou
 * de receber mensagens e avisa o Lucas por Telegram (ver `@/lib/agente/vigia`).
 * `?teste=1` só manda uma mensagem de teste, para validar o bot/chat.
 */

/** Estado da instância na Evolution ('open', 'close', ...); null se não deu para consultar. */
async function estadoDaInstancia(): Promise<string | null> {
  const apiUrl = process.env.EVOLUTION_API_URL
  const apiKey = process.env.EVOLUTION_API_KEY
  const instance = process.env.EVOLUTION_INSTANCE
  if (!apiUrl || !apiKey || !instance) return null
  try {
    const res = await fetch(`${apiUrl}/instance/connectionState/${instance}`, {
      headers: { apikey: apiKey },
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) return null
    const json = await res.json().catch(() => null)
    return json?.instance?.state ?? null
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  if (!verifyAgentKey(request)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  if (request.nextUrl.searchParams.get('teste') === '1') {
    const enviado = await enviarTelegram('🧪 BioPet: teste do vigia da IA. Se você leu isto, o aviso por Telegram está funcionando.')
    return NextResponse.json({ teste: true, enviado })
  }

  const agora = new Date()
  const estado = lerEstadoVigia()
  const estadoInstancia = await estadoDaInstancia()
  const decisao = decidirVigia({ agora, estado, estadoInstancia })

  let enviado: boolean | null = null
  if (decisao.acao === 'alertar' || decisao.acao === 'reavisar' || decisao.acao === 'recuperou') {
    enviado = await enviarTelegram(decisao.mensagem)
    // Só marca o alerta como avisado se o Telegram realmente recebeu; senão
    // tenta de novo no próximo ciclo (5 min) em vez de ficar mudo.
    if (enviado) aplicarDecisao(decisao, agora)
  }

  return NextResponse.json({
    acao: decisao.acao,
    silencio_min: decisao.silencioMin,
    estado_instancia: estadoInstancia,
    telegram_enviado: enviado,
  })
}
