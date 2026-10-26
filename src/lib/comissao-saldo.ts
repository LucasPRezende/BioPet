// Extrato de comissões por pessoa (migration v46).
//
//   saldo = saldo_inicial + comissões geradas desde a data de corte − pagamentos
//
// "Pessoa" é a chave do saldo. Quem é usuário do sistema (faz laudo) fica em
// ('usuario', system_users.id). Veterinário que também é usuário
// (veterinarios.system_user_id preenchido) cai na MESMA pessoa — extração e
// laudo somam num saldo só. Vet sem usuário fica em ('veterinario', id).
//
// Parte pura (sem I/O) no topo, testada em __tests__/comissao-saldo.test.ts;
// o carregamento do banco fica embaixo.

import { supabase } from './supabase'

export const DATA_CORTE = '2026-10-01'
export const VALOR_MAX_PAGAMENTO = 100_000

export type PessoaTipo = 'usuario' | 'veterinario'
export interface PessoaRef { tipo: PessoaTipo; id: number }

export const chavePessoa = (p: PessoaRef) => `${p.tipo}:${p.id}`

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/** Vet vinculado a um usuário compartilha o saldo do usuário. */
export function pessoaDoVet(vet: { id: number; system_user_id: number | null }): PessoaRef {
  return vet.system_user_id
    ? { tipo: 'usuario', id: vet.system_user_id }
    : { tipo: 'veterinario', id: vet.id }
}

export interface Saldo {
  inicial:      number
  devido:       number
  pago:         number
  saldo:        number
  adiantamento: boolean // saldo < 0: foi pago mais do que o devido
}

export function calcularSaldo(p: { inicial: number; devido: number; pago: number }): Saldo {
  const saldo = round2(p.inicial + p.devido - p.pago)
  return {
    inicial: round2(p.inicial),
    devido:  round2(p.devido),
    pago:    round2(p.pago),
    saldo,
    adiantamento: saldo < 0,
  }
}

/** Quanto do pagamento passa do que é devido hoje (0 se não passa). */
export function excedente(saldoAtual: number, valor: number): number {
  return round2(Math.max(0, valor - Math.max(0, saldoAtual)))
}

export function validarValor(v: unknown): { ok: true; valor: number } | { ok: false; erro: string } {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v)
  if (!Number.isFinite(n)) return { ok: false, erro: 'Valor inválido.' }
  const valor = round2(n)
  if (valor <= 0) return { ok: false, erro: 'O valor deve ser maior que zero.' }
  if (valor > VALOR_MAX_PAGAMENTO) return { ok: false, erro: `Valor acima do limite de R$ ${VALOR_MAX_PAGAMENTO.toLocaleString('pt-BR')}.` }
  return { ok: true, valor }
}

/** YYYY-MM-DD válida e não futura (data local do servidor em UTC-3 é tratada pelo chamador). */
export function validarDataPagamento(s: unknown, hoje: string): { ok: true; data: string } | { ok: false; erro: string } {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: false, erro: 'Data inválida.' }
  const d = new Date(`${s}T00:00:00Z`)
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return { ok: false, erro: 'Data inválida.' }
  if (s > hoje) return { ok: false, erro: 'A data do pagamento não pode ser futura.' }
  return { ok: true, data: s }
}

// ── Banco ────────────────────────────────────────────────────────────────────

const PAGE = 1000

/** Busca todas as linhas de uma query paginando (o PostgREST corta em 1000). */
async function todas<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }
  return out
}

export interface PosicaoPessoa extends Saldo {
  pessoa:         PessoaRef
  chave:          string
  nome:           string
  devido_laudo:   number
  devido_extracao: number
}

export async function carregarPosicoes(): Promise<PosicaoPessoa[]> {
  const [iniciais, pagamentos, laudos, extracoes, vets] = await Promise.all([
    todas<{ pessoa_tipo: PessoaTipo; pessoa_id: number; valor: number }>((a, b) =>
      supabase.from('saldo_inicial_comissao').select('pessoa_tipo, pessoa_id, valor').order('id').range(a, b)),
    todas<{ pessoa_tipo: PessoaTipo; pessoa_id: number; valor: number }>((a, b) =>
      supabase.from('pagamentos_comissao').select('pessoa_tipo, pessoa_id, valor').is('estornado_em', null).order('id').range(a, b)),
    todas<{ system_user_id: number; valor_comissao: number; system_users: unknown }>((a, b) =>
      supabase.from('laudos').select('system_user_id, valor_comissao, system_users(nome, recebe_comissao)')
        .gte('criado_em', `${DATA_CORTE}T00:00:00`).not('system_user_id', 'is', null).gt('valor_comissao', 0).order('id').range(a, b)),
    todas<{ vet_extracao_id: number; comissao_extracao: number }>((a, b) =>
      supabase.from('agendamentos').select('vet_extracao_id, comissao_extracao')
        .gte('data_hora', `${DATA_CORTE}T00:00:00`).not('vet_extracao_id', 'is', null).gt('comissao_extracao', 0).order('id').range(a, b)),
    todas<{ id: number; nome: string; system_user_id: number | null }>((a, b) =>
      supabase.from('veterinarios').select('id, nome, system_user_id').order('id').range(a, b)),
  ])

  const vetPorId = new Map(vets.map(v => [v.id, v]))
  const mapa = new Map<string, { pessoa: PessoaRef; nome: string; inicial: number; laudo: number; extracao: number; pago: number }>()
  const slot = (pessoa: PessoaRef, nome = '') => {
    const k = chavePessoa(pessoa)
    let e = mapa.get(k)
    if (!e) { e = { pessoa, nome, inicial: 0, laudo: 0, extracao: 0, pago: 0 }; mapa.set(k, e) }
    if (nome && !e.nome) e.nome = nome
    return e
  }

  for (const r of iniciais)   slot({ tipo: r.pessoa_tipo, id: r.pessoa_id }).inicial += Number(r.valor)
  for (const r of pagamentos) slot({ tipo: r.pessoa_tipo, id: r.pessoa_id }).pago    += Number(r.valor)

  for (const l of laudos) {
    const raw = l.system_users
    const su = (Array.isArray(raw) ? raw[0] : raw) as { nome: string; recebe_comissao: boolean } | null
    if (!su || su.recebe_comissao === false) continue
    slot({ tipo: 'usuario', id: l.system_user_id }, su.nome).laudo += Number(l.valor_comissao)
  }
  for (const x of extracoes) {
    const vet = vetPorId.get(x.vet_extracao_id)
    if (!vet) continue
    slot(pessoaDoVet(vet), vet.nome).extracao += Number(x.comissao_extracao)
  }

  // Nomes que ainda faltam (pessoa só com saldo inicial/pagamento)
  const userIds = Array.from(mapa.values()).filter(e => !e.nome && e.pessoa.tipo === 'usuario').map(e => e.pessoa.id)
  if (userIds.length) {
    const { data } = await supabase.from('system_users').select('id, nome').in('id', userIds)
    for (const u of data ?? []) slot({ tipo: 'usuario', id: u.id }, u.nome)
  }
  for (const e of Array.from(mapa.values())) {
    if (!e.nome && e.pessoa.tipo === 'veterinario') e.nome = vetPorId.get(e.pessoa.id)?.nome ?? ''
  }

  return Array.from(mapa.values())
    .map(e => ({
      pessoa: e.pessoa,
      chave: chavePessoa(e.pessoa),
      nome: e.nome || '—',
      devido_laudo: round2(e.laudo),
      devido_extracao: round2(e.extracao),
      ...calcularSaldo({ inicial: e.inicial, devido: e.laudo + e.extracao, pago: e.pago }),
    }))
    .sort((a, b) => b.saldo - a.saldo)
}

export async function carregarPosicao(pessoa: PessoaRef): Promise<PosicaoPessoa | null> {
  const k = chavePessoa(pessoa)
  return (await carregarPosicoes()).find(p => p.chave === k) ?? null
}
