/**
 * O que a IA mudou num agendamento que já existia (remarcar_agendamento). A
 * notificação para a equipe dizia sempre "Remarcação", mesmo quando só trocou
 * o veterinário ou a forma de pagamento — a equipe ia conferir uma data que
 * não tinha mudado.
 */

export interface MudancaAgendamento {
  dataHoraAntes: string
  dataHoraDepois: string
  formaPagamentoAntes?: string | null
  formaPagamentoDepois?: string | null
  valorAntes?: number | null
  valorDepois?: number | null
  veterinarioMudou?: boolean
  observacaoAdicionada?: boolean
}

export interface AlteracaoDescrita {
  /** 'remarcacao' só quando a data/hora mudou; senão 'alteracao'. */
  tipoEvento: 'remarcacao' | 'alteracao'
  descricao: string
}

/** "2026-11-04T09:30:00" -> "04/11 às 09:30" (data naive, sem fuso). */
function dataCurta(iso: string): string {
  const [data, hora = '00:00'] = iso.split('T')
  const [, mes, dia] = data.split('-')
  return `${dia}/${mes} às ${hora.slice(0, 5)}`
}

const NOME_FORMA: Record<string, string> = { pix: 'PIX', cartao: 'cartão', gratuito: 'gratuito' }

function nomeForma(forma?: string | null): string {
  const f = (forma ?? '').toLowerCase()
  return NOME_FORMA[f] ?? (f || 'não informada')
}

function brl(valor: number): string {
  return `R$ ${valor.toFixed(2).replace('.', ',')}`
}

export function descreverAlteracao(m: MudancaAgendamento): AlteracaoDescrita {
  const partes: string[] = []

  const mudouData = m.dataHoraAntes.slice(0, 16) !== m.dataHoraDepois.slice(0, 16)
  if (mudouData) partes.push(`Data/hora: ${dataCurta(m.dataHoraAntes)} → ${dataCurta(m.dataHoraDepois)}`)

  const formaAntes = (m.formaPagamentoAntes ?? '').toLowerCase()
  const formaDepois = (m.formaPagamentoDepois ?? '').toLowerCase()
  if (formaAntes !== formaDepois) {
    partes.push(`Pagamento: ${nomeForma(formaAntes)} → ${nomeForma(formaDepois)}`)
  }

  if (m.valorAntes != null && m.valorDepois != null && Math.abs(m.valorAntes - m.valorDepois) > 0.01) {
    partes.push(`Valor: ${brl(m.valorAntes)} → ${brl(m.valorDepois)}`)
  }

  if (m.veterinarioMudou) partes.push('Veterinário trocado')
  if (m.observacaoAdicionada) partes.push('Observação acrescentada')

  return {
    tipoEvento: mudouData ? 'remarcacao' : 'alteracao',
    descricao: partes.length > 0 ? partes.join(' · ') : 'Agendamento alterado pela IA',
  }
}
