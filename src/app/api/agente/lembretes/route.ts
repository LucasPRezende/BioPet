import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyAgentKey } from '@/lib/agent-auth'
import { sendWhatsAppText } from '@/lib/evolution'
import { acionarHumanoPorClienteSumido } from '@/lib/agente/orquestrador'

/**
 * Cutuca clientes que ignoraram uma pergunta da IA (pedido do Lucas,
 * 25/09/2026 — caso real: cliente sumiu depois de "PIX ou Cartão?" e voltou
 * horas depois achando que já estava tudo confirmado). Chamado por cron da
 * VPS a cada poucos minutos — ver [[project_lembrete_pergunta_ignorada]].
 *
 * Fluxo por conversa: 1h sem resposta após uma pergunta da IA → reenvia a
 * mesma pergunta. Mais 1h sem resposta → escala pra atendente
 * (transferir_humano), a IA para de tentar sozinha. Tempo configurável via
 * env (AGENTE_LEMBRETE_ESPERA_MS) só pra facilitar teste manual — em prod
 * deixar vazio (usa o padrão de 1h).
 */
const ESPERA_MS = Number(process.env.AGENTE_LEMBRETE_ESPERA_MS) || 60 * 60_000

function textoDoTurno(msg: any): string {
  if (typeof msg?.content === 'string') return msg.content.trim()
  if (!Array.isArray(msg?.content)) return ''
  return msg.content
    .filter((b: any) => b?.type === 'text' && typeof b.text === 'string')
    .map((b: any) => b.text as string)
    .join('\n')
    .trim()
}

function temToolUse(msg: any): boolean {
  return Array.isArray(msg?.content) && msg.content.some((b: any) => b?.type === 'tool_use')
}

/**
 * Só considera "pergunta de decisão real" se alguma tool já foi chamada na
 * conversa (preço, horário, cadastro, etc.) — filtra saudação de abertura
 * tipo "Como posso ajudar?" sem continuação, que também termina em "?" mas
 * não é uma decisão pendente de verdade. Achado ao vivo em 25/09/2026: das
 * 4 primeiras conversas cutucadas em prod, 3 eram só isso.
 */
function temProgressoReal(historico: any[]): boolean {
  return historico.some((m) => temToolUse(m))
}

export async function GET(request: NextRequest) {
  if (!verifyAgentKey(request)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const agora = new Date()

  const { data: conversas, error } = await supabase
    .from('conversas')
    .select('id, telefone, historico, atualizado_em, lembrete_enviado_em, atendimento_humano_ate, expira_em')
    .gt('expira_em', agora.toISOString())

  if (error) {
    return NextResponse.json({ erro: true, mensagem: error.message }, { status: 500 })
  }

  let lembretesEnviados = 0
  let escalacoes = 0

  for (const conv of conversas ?? []) {
    // Já em atendimento humano — a IA (e este lembrete) ficam de fora.
    if (conv.atendimento_humano_ate && new Date(conv.atendimento_humano_ate) > agora) continue

    const historico = Array.isArray(conv.historico) ? conv.historico : []
    if (!historico.length) continue

    const ultima = historico[historico.length - 1]
    // Só nos importa quando a ÚLTIMA mensagem foi a IA perguntando algo (sem
    // tool junto — só assim ela realmente chegou ao cliente).
    if (ultima?.role !== 'assistant' || temToolUse(ultima)) continue

    const texto = textoDoTurno(ultima)
    if (!texto || !texto.endsWith('?')) continue
    if (!temProgressoReal(historico)) continue

    if (!conv.lembrete_enviado_em) {
      const desde = agora.getTime() - new Date(conv.atualizado_em).getTime()
      if (desde < ESPERA_MS) continue

      await sendWhatsAppText(conv.telefone, `Oi! Só um lembrete — ainda aguardo sua resposta:\n\n${texto}`, 'ia')
      await supabase.from('conversas').update({ lembrete_enviado_em: agora.toISOString() }).eq('id', conv.id)
      lembretesEnviados++
    } else {
      const desdeLembrete = agora.getTime() - new Date(conv.lembrete_enviado_em).getTime()
      if (desdeLembrete < ESPERA_MS) continue

      await acionarHumanoPorClienteSumido(
        conv.telefone,
        `Cliente não respondeu mesmo depois de um lembrete automático. Última pergunta da IA: "${texto}"`,
      )
      escalacoes++
    }
  }

  return NextResponse.json({ ok: true, lembretes_enviados: lembretesEnviados, escalacoes })
}
