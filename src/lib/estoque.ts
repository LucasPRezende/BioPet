import 'server-only'
import { supabase } from './supabase'
import { agoraLocalISO } from './agendamento-helpers'
import {
  somarConsumo, montarReservas, juntarReservas, precisaRepor, consumoLaudoPcr, itensExtracao, ITEM_EXTRACAO, faltasEstoque,
  type Vinculo, type Reserva, type ItemAgendado, type FaltaEstoque,
} from './estoque-regras'

// Estoque de consumíveis (migrations v44, v45 e v52). Cada compra é um lote com saldo
// próprio; as saídas consomem os lotes em PEPS pelas funções SQL
// consumir_estoque / registrar_compra_consumivel, que rodam numa transação com
// lock no consumível.

export const DIAS_ALERTA_VALIDADE = 30

// Agrupamento na tela de Estoque. Texto livre no banco; esta é a lista oferecida.
export const CATEGORIAS = ['teste_rapido', 'pcr', 'tubo', 'caixa', 'reagente', 'outro'] as const

// Agendamentos que ainda vão gastar kit: não cancelados/concluídos/faltou.
const STATUS_EM_ABERTO = ['pendente', 'agendado', 'em atendimento']

export { precisaRepor }
export type { Reserva }

export interface ConsumivelResumo {
  id:              number
  nome:            string
  unidade:         string
  categoria:       string
  codigo:          string | null // código do kit do fornecedor (o da nota fiscal)
  extrator_pcr:    boolean       // extrator de DNA/RNA: sai 1 por laudo de PCR (amostra)
  estoque_minimo:  number
  ativo:           boolean
  estoque:         number        // saldo dos lotes − saídas pendentes (pode ser negativo)
  pendente:        number        // saídas sem estoque, aguardando a próxima compra
  reservado:       number        // comprometido com agendamentos de hoje em diante
  disponivel:      number        // estoque − reservado (negativo = vai faltar)
  reservas:        Reserva[]     // os agendamentos que compõem o reservado, por data
  valor_estoque:   number        // saldo × custo de cada lote
  custo_atual:     number | null // custo unitário do lote em uso (o mais antigo com saldo)
  proxima_validade: string | null // validade mais próxima entre os lotes com saldo
  testes:          { id: number; nome: string }[]                     // testes rápidos que gastam este item
  pcrs:            { id: number; nome: string; quantidade: number }[] // PCRs que gastam este item
}

// Teste rápido: 1 unidade do consumível ligado em testes_rapidos.consumivel_id.
// Inclui testes inativos: agendamento antigo de um teste desativado ainda gasta kit.
async function vinculosTestesRapidos(): Promise<(Vinculo & { nome: string; ativo: boolean })[]> {
  const { data, error } = await supabase
    .from('testes_rapidos').select('id, nome, ativo, consumivel_id').not('consumivel_id', 'is', null)
  if (error) throw new Error(error.message)
  return (data ?? []).map(t => ({ item_id: t.id, consumivel_id: t.consumivel_id, quantidade: 1, nome: t.nome, ativo: t.ativo }))
}

// PCR: N kits por exame (exame_pcr_consumiveis, migration v52).
async function vinculosPcr(): Promise<(Vinculo & { nome: string })[]> {
  const { data, error } = await supabase
    .from('exame_pcr_consumiveis').select('pcr_id, consumivel_id, quantidade, exames_pcr(nome)')
  if (error) throw new Error(error.message)
  return (data ?? []).map(v => {
    const pcr = (Array.isArray(v.exames_pcr) ? v.exames_pcr[0] : v.exames_pcr) as { nome: string } | null
    return { item_id: v.pcr_id, consumivel_id: v.consumivel_id, quantidade: v.quantidade, nome: pcr?.nome ?? `PCR #${v.pcr_id}` }
  })
}

// O extrator de DNA/RNA (sai 1 por laudo de PCR). null se não houver um ativo.
async function extratorPcrId(): Promise<number | null> {
  const { data, error } = await supabase
    .from('consumiveis').select('id').eq('extrator_pcr', true).eq('ativo', true).limit(1).maybeSingle()
  if (error) throw new Error(error.message)
  return data?.id ?? null
}

// Itens de agendamentos em aberto, de hoje em diante, que ainda não têm laudo
// daquele exame (o laudo é o que dá baixa). Atrasados sem laudo ficam de fora —
// já aparecem no alerta "exames sem laudo" e muitos são faltas. Com
// `extratorId`, reserva também uma extração por agendamento (amostra).
async function reservasDe(
  tabela: 'agendamento_testes_rapidos' | 'agendamento_pcr',
  colunaItem: 'teste_rapido_id' | 'pcr_id',
  tipoExame: 'Teste Rápido' | 'PCR',
  vinculos: Vinculo[],
  extratorId: number | null = null,
): Promise<Map<number, Reserva[]>> {
  const inicioHoje = `${agoraLocalISO().slice(0, 10)}T00:00:00`
  const { data, error } = await supabase
    .from(tabela)
    .select(`${colunaItem}, agendamentos!inner(id, status, data_hora, pets(nome))`)
    .in('agendamentos.status', STATUS_EM_ABERTO)
    .gte('agendamentos.data_hora', inicioHoje)
  if (error) throw new Error(error.message)

  type Ag = { id: number; data_hora: string; pets: { nome: string } | { nome: string }[] | null }
  const itens: ItemAgendado[] = []
  for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
    const ag = (Array.isArray(r.agendamentos) ? r.agendamentos[0] : r.agendamentos) as Ag | null
    if (!ag) continue
    const pet = Array.isArray(ag.pets) ? ag.pets[0] : ag.pets
    itens.push({ item_id: Number(r[colunaItem]), agendamento_id: ag.id, data_hora: ag.data_hora, pet_nome: pet?.nome ?? '—' })
  }

  const agIds = Array.from(new Set(itens.map(i => i.agendamento_id)))
  const comLaudo = new Set<number>()
  if (agIds.length > 0) {
    const { data: laudos, error: lErr } = await supabase
      .from('laudos').select('agendamento_id').eq('tipo_exame', tipoExame).in('agendamento_id', agIds)
    if (lErr) throw new Error(lErr.message)
    for (const l of laudos ?? []) comLaudo.add(l.agendamento_id)
  }
  const reservas = montarReservas(itens, vinculos, comLaudo)
  if (!extratorId) return reservas
  return juntarReservas(reservas, montarReservas(
    itensExtracao(itens),
    [{ item_id: ITEM_EXTRACAO, consumivel_id: extratorId, quantidade: 1 }],
    comLaudo,
  ))
}

// Situação atual de todos os consumíveis (ativos e inativos).
export async function resumoEstoque(): Promise<ConsumivelResumo[]> {
  const [cons, lotes, pend, vTestes, vPcr] = await Promise.all([
    supabase.from('consumiveis').select('id, nome, unidade, categoria, codigo, extrator_pcr, estoque_minimo, ativo').order('nome'),
    supabase.from('consumivel_compras')
      .select('consumivel_id, saldo, custo_unitario, validade, data_compra, id')
      .gt('saldo', 0)
      .order('data_compra').order('id'),
    supabase.from('consumivel_movimentos').select('consumivel_id, quantidade').is('compra_id', null),
    vinculosTestesRapidos(),
    vinculosPcr(),
  ])
  for (const r of [cons, lotes, pend]) {
    if (r.error) throw new Error(r.error.message)
  }

  const extratorId = (cons.data ?? []).find(c => c.extrator_pcr && c.ativo)?.id ?? null
  const reservas = juntarReservas(
    await reservasDe('agendamento_testes_rapidos', 'teste_rapido_id', 'Teste Rápido', vTestes),
    await reservasDe('agendamento_pcr', 'pcr_id', 'PCR', vPcr, extratorId),
  )

  const out = new Map<number, ConsumivelResumo>()
  for (const c of cons.data ?? []) {
    out.set(c.id, {
      ...c, estoque: 0, pendente: 0, reservado: 0, disponivel: 0, reservas: [],
      valor_estoque: 0, custo_atual: null, proxima_validade: null, testes: [], pcrs: [],
    })
  }
  // Lotes já vêm em ordem PEPS: o primeiro de cada consumível é o "em uso".
  for (const l of lotes.data ?? []) {
    const c = out.get(l.consumivel_id)
    if (!c) continue
    c.estoque       += l.saldo
    c.valor_estoque += l.saldo * Number(l.custo_unitario)
    if (c.custo_atual === null) c.custo_atual = Number(l.custo_unitario)
    if (l.validade && (!c.proxima_validade || l.validade < c.proxima_validade)) c.proxima_validade = l.validade
  }
  for (const p of pend.data ?? []) {
    const c = out.get(p.consumivel_id)
    if (!c) continue
    c.pendente += p.quantidade
    c.estoque  -= p.quantidade
  }
  for (const t of vTestes) {
    if (t.ativo) out.get(t.consumivel_id)?.testes.push({ id: t.item_id, nome: t.nome })
  }
  for (const v of vPcr) {
    out.get(v.consumivel_id)?.pcrs.push({ id: v.item_id, nome: v.nome, quantidade: v.quantidade })
  }
  for (const [consumivelId, lista] of Array.from(reservas)) {
    const c = out.get(consumivelId)
    if (!c) continue
    c.reservas  = lista
    c.reservado = lista.reduce((s, r) => s + r.quantidade, 0)
  }
  return Array.from(out.values()).map(c => ({
    ...c,
    disponivel:    c.estoque - c.reservado,
    valor_estoque: Math.round(c.valor_estoque * 100) / 100,
  }))
}

/** Consumo dos testes rápidos de um laudo (1 do consumível de cada teste). */
export async function consumoTestesRapidos(testeIds: number[]): Promise<Map<number, number>> {
  if (testeIds.length === 0) return new Map()
  return somarConsumo(testeIds, await vinculosTestesRapidos())
}

/**
 * Consumo de um laudo de PCR: o kit de cada PCR + 1 extração de DNA/RNA da
 * amostra. `novaExtracao` = false quando reaproveitaram o extraído guardado.
 */
export async function consumoPcrs(pcrIds: number[], novaExtracao = true): Promise<Map<number, number>> {
  if (pcrIds.length === 0) return new Map()
  const [vinculos, extratorId] = await Promise.all([vinculosPcr(), novaExtracao ? extratorPcrId() : null])
  return consumoLaudoPcr(pcrIds, vinculos, extratorId, novaExtracao)
}

// Dá baixa do consumo de um laudo e grava o custo nele (laudos.custo_exame, que
// o Dashboard soma). Devolve o custo total ou lança erro — quem chama decide se
// isso bloqueia (a emissão do laudo não bloqueia).
export async function baixarConsumoLaudo(laudoId: number, consumo: Map<number, number>, userId: number | null): Promise<number> {
  if (consumo.size === 0) return 0

  let custo = 0
  for (const [consumivelId, quantidade] of Array.from(consumo)) {
    custo += await consumir(consumivelId, quantidade, { laudoId, userId })
  }

  custo = Math.round(custo * 100) / 100
  const { error: updErr } = await supabase.from('laudos').update({ custo_exame: custo }).eq('id', laudoId)
  if (updErr) throw new Error(updErr.message)
  return custo
}

export interface OpcoesSaida {
  tipo?:       'consumo' | 'perda'
  laudoId?:    number | null
  origemTipo?: string | null   // ex.: 'pedido_lab' — quando a saída não vem de um laudo
  origemId?:   number | null
  observacao?: string | null
  userId?:     number | null
}

// Saída de estoque em PEPS (função SQL consumir_estoque). Devolve o custo da saída.
export async function consumir(consumivelId: number, quantidade: number, opts: OpcoesSaida = {}): Promise<number> {
  const { data, error } = await supabase.rpc('consumir_estoque', {
    p_consumivel_id: consumivelId,
    p_quantidade:    quantidade,
    p_tipo:          opts.tipo ?? 'consumo',
    p_laudo_id:      opts.laudoId ?? null,
    p_observacao:    opts.observacao ?? null,
    p_user_id:       opts.userId ?? null,
    p_origem_tipo:   opts.origemTipo ?? null,
    p_origem_id:     opts.origemId ?? null,
  })
  if (error) throw new Error(error.message)
  return Number(data ?? 0)
}

/**
 * Aviso de estoque insuficiente para um agendamento novo (testes rápidos + PCRs,
 * com 1 extração de DNA/RNA se houver PCR). Só informa, não bloqueia.
 */
export async function avisoEstoqueAgendamento(testeIds: number[], pcrIds: number[]): Promise<FaltaEstoque[]> {
  if (testeIds.length === 0 && pcrIds.length === 0) return []
  const [consumiveis, deTestes, dePcrs] = await Promise.all([
    resumoEstoque(), consumoTestesRapidos(testeIds), consumoPcrs(pcrIds, true),
  ])
  const necessidade = new Map(deTestes)
  for (const [id, q] of Array.from(dePcrs)) necessidade.set(id, (necessidade.get(id) ?? 0) + q)
  return faltasEstoque(necessidade, consumiveis)
}
