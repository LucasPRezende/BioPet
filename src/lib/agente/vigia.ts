/**
 * Vigia do agente de WhatsApp.
 *
 * Caso real (04/11/2026): a sessão do WhatsApp na Evolution ficou "surda" — o
 * app e o pm2 estavam no ar, a instância aparecia `open`, mas nenhuma mensagem
 * chegava. A IA ficou 3h30 sem receber nada e quem percebeu foi a equipe.
 * Sinal confiável de "surdez": o app para de receber QUALQUER webhook da
 * Evolution (mensagens, grupos, confirmações de leitura/entrega) em horário de
 * atendimento. Este módulo decide quando avisar; o envio e a rota ficam fora
 * daqui para a regra ser testável sem rede.
 *
 * Não depende do WhatsApp para avisar (é justamente o canal que quebra) — o
 * aviso vai por Telegram, ver `@/lib/telegram`.
 */

/** Minutos sem webhook, em horário de atendimento, para considerar problema. */
export const LIMITE_SILENCIO_MIN = Number(process.env.AGENTE_VIGIA_SILENCIO_MIN) || 30
/** Enquanto o problema persiste, repete o aviso a cada tanto. */
export const REAVISO_MIN = 60

/** Atendimento: segunda a sábado, das 8h às 19h (Brasília). */
const HORA_INICIO = 8
const HORA_FIM = 19

const MIN = 60_000

/** Dia da semana (0=domingo) e hora cheia em Brasília para um instante. */
export function partesBrasilia(d: Date): { diaSemana: number; hora: number } {
  const local = new Date(d.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  return { diaSemana: local.getDay(), hora: local.getHours() }
}

export function emHorarioDeAtendimento(d: Date): boolean {
  const { diaSemana, hora } = partesBrasilia(d)
  if (diaSemana === 0) return false
  return hora >= HORA_INICIO && hora < HORA_FIM
}

export interface EstadoVigia {
  /** Quando o último webhook chegou (qualquer tipo). null = nenhum desde que o app subiu. */
  ultimoWebhookEm: Date | null
  /** Quando o processo do app subiu — base do silêncio se ainda não chegou webhook. */
  iniciouEm: Date
  /** Quando o alerta atual foi aberto; null = sem alerta aberto. */
  alertaAbertoEm: Date | null
  /** Último aviso enviado para o alerta atual. */
  ultimoAvisoEm: Date | null
}

export interface EntradaVigia {
  agora: Date
  estado: EstadoVigia
  /** Estado da instância na Evolution ('open', 'close', 'connecting'...); null = não conseguiu consultar. */
  estadoInstancia: string | null
}

export type DecisaoVigia =
  | { acao: 'nada'; silencioMin: number }
  | { acao: 'alertar' | 'reavisar'; silencioMin: number; motivos: string[]; mensagem: string }
  | { acao: 'recuperou'; silencioMin: number; mensagem: string }

/** Minutos de silêncio: desde o último webhook, ou desde que o app subiu. */
export function silencioEmMin(agora: Date, estado: EstadoVigia): number {
  const base = estado.ultimoWebhookEm && estado.ultimoWebhookEm > estado.iniciouEm
    ? estado.ultimoWebhookEm
    : estado.iniciouEm
  return Math.max(0, Math.floor((agora.getTime() - base.getTime()) / MIN))
}

function hhmm(d: Date): string {
  return d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
}

export function decidirVigia({ agora, estado, estadoInstancia }: EntradaVigia): DecisaoVigia {
  const silencioMin = silencioEmMin(agora, estado)
  const noHorario = emHorarioDeAtendimento(agora)

  const motivos: string[] = []
  if (noHorario && silencioMin >= LIMITE_SILENCIO_MIN) {
    motivos.push(`nenhuma mensagem nem confirmação chega do WhatsApp há ${silencioMin} min`)
  }
  if (noHorario && estadoInstancia !== null && estadoInstancia !== 'open') {
    motivos.push(`a instância do WhatsApp está "${estadoInstancia}" na Evolution`)
  }
  if (noHorario && estadoInstancia === null) {
    motivos.push('não consegui consultar a Evolution (fora do ar?)')
  }

  if (motivos.length > 0) {
    const corpo =
      `🚨 BioPet: a IA pode estar sem receber mensagens.\n` +
      motivos.map(m => `• ${m}`).join('\n') +
      `\n\nVerifique a conexão do WhatsApp (Evolution). Hora: ${hhmm(agora)}.`

    if (!estado.alertaAbertoEm) return { acao: 'alertar', silencioMin, motivos, mensagem: corpo }

    const desdeUltimoAviso = estado.ultimoAvisoEm
      ? (agora.getTime() - estado.ultimoAvisoEm.getTime()) / MIN
      : Infinity
    if (desdeUltimoAviso >= REAVISO_MIN) {
      return {
        acao: 'reavisar',
        silencioMin,
        motivos,
        mensagem: `⏰ Continua o problema desde ${hhmm(estado.alertaAbertoEm)}.\n` + corpo,
      }
    }
    return { acao: 'nada', silencioMin }
  }

  // Sem problema agora. Só encerra o alerta quando há prova de recuperação:
  // chegou webhook depois de aberto e a instância está 'open'. Fora do horário,
  // silêncio é normal e não prova nada — o alerta fica aberto, sem repetir.
  if (
    estado.alertaAbertoEm &&
    estado.ultimoWebhookEm &&
    estado.ultimoWebhookEm > estado.alertaAbertoEm &&
    estadoInstancia === 'open'
  ) {
    return {
      acao: 'recuperou',
      silencioMin,
      mensagem: `✅ BioPet: a IA voltou a receber mensagens (${hhmm(estado.ultimoWebhookEm)}).`,
    }
  }

  return { acao: 'nada', silencioMin }
}

// ─── Estado em memória do processo ────────────────────────────────────────────
// `globalThis` porque o Next pode empacotar a rota do webhook e a rota de saúde
// em módulos separados; o estado precisa ser um só no processo.
// Reiniciar o app zera o estado: o silêncio passa a contar do boot e, se o
// problema continuar, o aviso volta a sair — comportamento desejado.

const CHAVE = '__biopetVigia'

function estadoGlobal(): EstadoVigia {
  const g = globalThis as unknown as Record<string, EstadoVigia | undefined>
  if (!g[CHAVE]) {
    g[CHAVE] = { ultimoWebhookEm: null, iniciouEm: new Date(), alertaAbertoEm: null, ultimoAvisoEm: null }
  }
  return g[CHAVE]!
}

/** Chamado pelo webhook a cada POST autenticado da Evolution. */
export function registrarWebhookRecebido(agora: Date = new Date()): void {
  estadoGlobal().ultimoWebhookEm = agora
}

export function lerEstadoVigia(): EstadoVigia {
  return estadoGlobal()
}

/** Aplica a decisão ao estado (abre/fecha alerta, marca aviso). */
export function aplicarDecisao(decisao: DecisaoVigia, agora: Date = new Date()): void {
  const e = estadoGlobal()
  if (decisao.acao === 'alertar') {
    e.alertaAbertoEm = agora
    e.ultimoAvisoEm = agora
  } else if (decisao.acao === 'reavisar') {
    e.ultimoAvisoEm = agora
  } else if (decisao.acao === 'recuperou') {
    e.alertaAbertoEm = null
    e.ultimoAvisoEm = null
  }
}
