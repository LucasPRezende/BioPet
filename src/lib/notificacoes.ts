// Regras da tela /admin/notificacoes.
//
// Notificação só conta como pendente por 7 dias. Passou disso, ela é tratada
// como resolvida automaticamente (sai do badge e dos contadores, aparece com
// o selo "Resolvido automaticamente"). É só na leitura: nada é gravado no banco
// e a pausa da IA (atendimento humano) não é mexida.

export const DIAS_AUTO_RESOLVER = 7

export const TIPOS_REQUER_ATENCAO = new Set([
  'ia_travou', 'pergunta_laudo', 'pergunta_tecnica', 'erro_tecnico', 'laudo_urgente', 'laudo_atrasado',
])

export const TIPOS_AGENDAMENTO = new Set([
  'agendamento', 'remarcacao', 'alteracao', 'cancelamento', 'agendamento_clinica',
])

export interface NotificacaoBase {
  visualizado: boolean
  criado_em:   string
  tipo_evento?: string | null
}

// `criado_em` vem do Postgres como TIMESTAMP sem timezone, já em UTC.
// Sem o "Z", o Date() leria como horário local.
export function parseUtc(iso: string): Date {
  return new Date(/Z|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`)
}

export function expirou(criadoEm: string, agoraMs: number): boolean {
  const t = parseUtc(criadoEm).getTime()
  if (Number.isNaN(t)) return false
  return agoraMs - t > DIAS_AUTO_RESOLVER * 24 * 60 * 60 * 1000
}

/** Marca como resolvidas (visualizado) as notificações pendentes com mais de 7 dias. */
export function aplicarAutoResolucao<T extends NotificacaoBase>(
  notifs: T[],
  agoraMs: number,
): (T & { auto_resolvido: boolean })[] {
  return notifs.map(n => {
    const auto = !n.visualizado && expirou(n.criado_em, agoraMs)
    return { ...n, visualizado: n.visualizado || auto, auto_resolvido: auto }
  })
}

export function isRequerAtencao(n: NotificacaoBase): boolean {
  return !n.tipo_evento || TIPOS_REQUER_ATENCAO.has(n.tipo_evento)
}

export function isAgendamento(n: NotificacaoBase): boolean {
  return !!n.tipo_evento && TIPOS_AGENDAMENTO.has(n.tipo_evento)
}

/** Contadores do badge (já com a auto-resolução aplicada). */
export function contarPendentes(notifs: NotificacaoBase[], agoraMs: number) {
  const ativas = aplicarAutoResolucao(notifs, agoraMs).filter(n => !n.visualizado)
  return {
    nao_visualizadas:   ativas.filter(isRequerAtencao).length,
    agendamentos_novos: ativas.filter(isAgendamento).length,
  }
}
