// Regras puras do estoque de consumíveis (sem banco) — quanto cada exame gasta,
// o que está reservado por agendamentos e quando é preciso repor. O acesso ao
// banco fica em estoque.ts; estas funções recebem as linhas já carregadas.

/** Um item de exame (teste rápido, PCR…) gasta `quantidade` do consumível. */
export interface Vinculo {
  item_id:       number
  consumivel_id: number
  quantidade:    number
}

export interface Reserva {
  agendamento_id: number
  data_hora:      string
  pet_nome:       string
  quantidade:     number
}

/** Linha de um item agendado (agendamento_testes_rapidos, agendamento_pcr…). */
export interface ItemAgendado {
  item_id:        number
  agendamento_id: number
  data_hora:      string
  pet_nome:       string
}

/**
 * Quanto de cada consumível os itens gastam. Item repetido conta de novo; item
 * sem vínculo não gasta nada. Ex.: um painel de PCR ligado a dois kits → 1 de
 * cada.
 */
export function somarConsumo(itemIds: number[], vinculos: Vinculo[]): Map<number, number> {
  const total = new Map<number, number>()
  for (const id of itemIds) {
    for (const v of vinculos) {
      if (v.item_id !== id) continue
      total.set(v.consumivel_id, (total.get(v.consumivel_id) ?? 0) + v.quantidade)
    }
  }
  return total
}

/**
 * Kits reservados por consumível: itens de agendamentos que ainda não têm laudo
 * do exame (o laudo é o que dá baixa). Quem chama já filtra status em aberto e
 * data de hoje em diante. Um agendamento aparece uma vez por consumível, com a
 * quantidade somada; a lista sai em ordem de data.
 */
export function montarReservas(
  itens:    ItemAgendado[],
  vinculos: Vinculo[],
  comLaudo: Set<number>,
): Map<number, Reserva[]> {
  const porConsumivel = new Map<number, Map<number, Reserva>>()
  for (const it of itens) {
    if (comLaudo.has(it.agendamento_id)) continue
    for (const v of vinculos) {
      if (v.item_id !== it.item_id) continue
      const doConsumivel = porConsumivel.get(v.consumivel_id) ?? new Map<number, Reserva>()
      const atual = doConsumivel.get(it.agendamento_id)
      if (atual) atual.quantidade += v.quantidade
      else doConsumivel.set(it.agendamento_id, {
        agendamento_id: it.agendamento_id, data_hora: it.data_hora, pet_nome: it.pet_nome, quantidade: v.quantidade,
      })
      porConsumivel.set(v.consumivel_id, doConsumivel)
    }
  }
  const out = new Map<number, Reserva[]>()
  for (const [consumivelId, porAg] of Array.from(porConsumivel)) {
    out.set(consumivelId, Array.from(porAg.values()).sort((a, b) => a.data_hora.localeCompare(b.data_hora)))
  }
  return out
}

/** Junta reservas de várias origens (teste rápido + PCR) no mesmo consumível. */
export function juntarReservas(...mapas: Map<number, Reserva[]>[]): Map<number, Reserva[]> {
  const out = new Map<number, Reserva[]>()
  for (const mapa of mapas) {
    for (const [consumivelId, lista] of Array.from(mapa)) {
      out.set(consumivelId, [...(out.get(consumivelId) ?? []), ...lista])
    }
  }
  for (const lista of Array.from(out.values())) lista.sort((a, b) => a.data_hora.localeCompare(b.data_hora))
  return out
}

/** Precisa repor: vai faltar para os agendados, ou o que sobra fica no mínimo ou abaixo dele. */
export function precisaRepor(c: { disponivel: number; estoque_minimo: number }): boolean {
  return c.disponivel < 0 || (c.estoque_minimo > 0 && c.disponivel <= c.estoque_minimo)
}

/** item_id usado para a extração de DNA/RNA nas reservas (não é um PCR do catálogo). */
export const ITEM_EXTRACAO = -1

/**
 * Consumo de um laudo de PCR: o kit de cada PCR + UMA extração de DNA/RNA para
 * a amostra. Sem extração nova quando o extraído guardado foi reaproveitado
 * (`novaExtracao` = false) ou quando não há extrator cadastrado.
 */
export function consumoLaudoPcr(
  pcrIds:       number[],
  vinculos:     Vinculo[],
  extratorId:   number | null,
  novaExtracao: boolean,
): Map<number, number> {
  const total = somarConsumo(pcrIds, vinculos)
  if (novaExtracao && extratorId && pcrIds.length > 0) {
    total.set(extratorId, (total.get(extratorId) ?? 0) + 1)
  }
  return total
}

/**
 * Para a reserva do extrator: uma linha por agendamento que tem PCR (uma
 * amostra = uma extração), não importa quantos PCRs ele tenha.
 */
export function itensExtracao(itens: ItemAgendado[]): ItemAgendado[] {
  const porAg = new Map<number, ItemAgendado>()
  for (const it of itens) {
    if (!porAg.has(it.agendamento_id)) porAg.set(it.agendamento_id, { ...it, item_id: ITEM_EXTRACAO })
  }
  return Array.from(porAg.values())
}
