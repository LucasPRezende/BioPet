import 'server-only'
import { supabase } from './supabase'
import { agoraLocalISO } from './agendamento-helpers'

// Estoque de consumíveis (migration_v44). Cada compra é um lote com saldo
// próprio; as saídas consomem os lotes em PEPS pelas funções SQL
// consumir_estoque / registrar_compra_consumivel, que rodam numa transação com
// lock no consumível.

export const DIAS_ALERTA_VALIDADE = 30

// Agrupamento na tela de Estoque. Texto livre no banco; esta é a lista oferecida.
export const CATEGORIAS = ['teste_rapido', 'tubo', 'caixa', 'reagente', 'outro'] as const

// Agendamentos que ainda vão gastar kit: não cancelados/concluídos/faltou.
const STATUS_EM_ABERTO = ['pendente', 'agendado', 'em atendimento']

export interface Reserva {
  agendamento_id: number
  data_hora:      string
  pet_nome:       string
}

export interface ConsumivelResumo {
  id:              number
  nome:            string
  unidade:         string
  categoria:       string
  estoque_minimo:  number
  ativo:           boolean
  estoque:         number        // saldo dos lotes − saídas pendentes (pode ser negativo)
  pendente:        number        // saídas sem estoque, aguardando a próxima compra
  reservado:       number        // kits comprometidos com agendamentos de hoje em diante
  disponivel:      number        // estoque − reservado (negativo = vai faltar)
  reservas:        Reserva[]     // os agendamentos que compõem o reservado, por data
  valor_estoque:   number        // saldo × custo de cada lote
  custo_atual:     number | null // custo unitário do lote em uso (o mais antigo com saldo)
  proxima_validade: string | null // validade mais próxima entre os lotes com saldo
  testes:          { id: number; nome: string }[]
}

// Precisa repor: vai faltar para os agendados, ou o que sobra fica no/abaixo do mínimo.
export function precisaRepor(c: Pick<ConsumivelResumo, 'disponivel' | 'estoque_minimo'>): boolean {
  return c.disponivel < 0 || (c.estoque_minimo > 0 && c.disponivel <= c.estoque_minimo)
}

// Kits reservados: testes rápidos de agendamentos em aberto, de hoje em diante,
// que ainda não têm laudo de Teste Rápido (o laudo é o que dá baixa). Atrasados
// sem laudo ficam de fora — já aparecem no alerta "exames sem laudo" e muitos
// são faltas.
async function reservasPorConsumivel(testeConsumivel: Map<number, number>): Promise<Map<number, Reserva[]>> {
  const inicioHoje = `${agoraLocalISO().slice(0, 10)}T00:00:00`
  const { data, error } = await supabase
    .from('agendamento_testes_rapidos')
    .select('teste_rapido_id, agendamentos!inner(id, status, data_hora, pets(nome))')
    .in('agendamentos.status', STATUS_EM_ABERTO)
    .gte('agendamentos.data_hora', inicioHoje)
  if (error) throw new Error(error.message)

  type Ag = { id: number; data_hora: string; pets: { nome: string } | { nome: string }[] | null }
  const itens = (data ?? []).map(r => ({
    teste_rapido_id: r.teste_rapido_id as number,
    ag: (Array.isArray(r.agendamentos) ? r.agendamentos[0] : r.agendamentos) as Ag,
  })).filter(r => r.ag)

  const agIds = Array.from(new Set(itens.map(r => r.ag.id)))
  const comLaudo = new Set<number>()
  if (agIds.length > 0) {
    const { data: laudos, error: lErr } = await supabase
      .from('laudos').select('agendamento_id').eq('tipo_exame', 'Teste Rápido').in('agendamento_id', agIds)
    if (lErr) throw new Error(lErr.message)
    for (const l of laudos ?? []) comLaudo.add(l.agendamento_id)
  }

  const out = new Map<number, Reserva[]>()
  for (const { teste_rapido_id, ag } of itens) {
    const consumivelId = testeConsumivel.get(teste_rapido_id)
    if (!consumivelId || comLaudo.has(ag.id)) continue
    const pet = Array.isArray(ag.pets) ? ag.pets[0] : ag.pets
    const lista = out.get(consumivelId) ?? []
    lista.push({ agendamento_id: ag.id, data_hora: ag.data_hora, pet_nome: pet?.nome ?? '—' })
    out.set(consumivelId, lista)
  }
  for (const lista of Array.from(out.values())) lista.sort((a, b) => a.data_hora.localeCompare(b.data_hora))
  return out
}

// Situação atual de todos os consumíveis (ativos e inativos).
export async function resumoEstoque(): Promise<ConsumivelResumo[]> {
  const [cons, lotes, pend, testes] = await Promise.all([
    supabase.from('consumiveis').select('id, nome, unidade, categoria, estoque_minimo, ativo').order('nome'),
    supabase.from('consumivel_compras')
      .select('consumivel_id, saldo, custo_unitario, validade, data_compra, id')
      .gt('saldo', 0)
      .order('data_compra').order('id'),
    supabase.from('consumivel_movimentos').select('consumivel_id, quantidade').is('compra_id', null),
    supabase.from('testes_rapidos').select('id, nome, ativo, consumivel_id').not('consumivel_id', 'is', null),
  ])
  for (const r of [cons, lotes, pend, testes]) {
    if (r.error) throw new Error(r.error.message)
  }

  // Inclui testes inativos: agendamento antigo de um teste desativado ainda gasta kit.
  const testeConsumivel = new Map((testes.data ?? []).map(t => [t.id as number, t.consumivel_id as number]))
  const reservas = await reservasPorConsumivel(testeConsumivel)

  const out = new Map<number, ConsumivelResumo>()
  for (const c of cons.data ?? []) {
    out.set(c.id, {
      ...c, estoque: 0, pendente: 0, reservado: 0, disponivel: 0, reservas: [],
      valor_estoque: 0, custo_atual: null, proxima_validade: null, testes: [],
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
  for (const t of testes.data ?? []) {
    if (t.ativo) out.get(t.consumivel_id)?.testes.push({ id: t.id, nome: t.nome })
  }
  for (const [consumivelId, lista] of Array.from(reservas)) {
    const c = out.get(consumivelId)
    if (!c) continue
    c.reservas  = lista
    c.reservado = lista.length
  }
  return Array.from(out.values()).map(c => ({
    ...c,
    disponivel:    c.estoque - c.reservado,
    valor_estoque: Math.round(c.valor_estoque * 100) / 100,
  }))
}

// Dá baixa dos consumíveis usados num laudo de teste rápido e grava o custo
// no laudo (laudos.custo_exame, que o Dashboard soma). Cada teste gasta 1
// unidade do consumível vinculado; testes sem consumível não custam nada.
// Devolve o custo total ou lança erro — quem chama decide se isso bloqueia.
export async function baixarConsumoLaudo(laudoId: number, testeIds: number[], userId: number | null): Promise<number> {
  if (testeIds.length === 0) return 0

  const { data: testes, error } = await supabase
    .from('testes_rapidos')
    .select('id, consumivel_id')
    .in('id', testeIds)
  if (error) throw new Error(error.message)

  const porConsumivel = new Map<number, number>()
  for (const id of testeIds) {
    const consumivelId = testes?.find(t => t.id === id)?.consumivel_id
    if (consumivelId) porConsumivel.set(consumivelId, (porConsumivel.get(consumivelId) ?? 0) + 1)
  }

  let custo = 0
  for (const [consumivelId, quantidade] of Array.from(porConsumivel)) {
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
