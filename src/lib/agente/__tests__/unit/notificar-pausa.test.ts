import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Teste de INTEGRAÇÃO da pausa por atendimento humano.
 *
 * Em vez de espiar chamadas, usa um Supabase falso COM ESTADO: as tabelas
 * `tutores` e `conversas` guardam linhas de verdade em memória, então escrita e
 * leitura interagem como em produção. Isso prova o comportamento — o bot
 * realmente para de responder — e não só que uma função foi chamada.
 *
 * Cenário-alvo (o bug que motivou o fix): um número que NÃO é tutor cadastrado
 * precisa de humano; ao escalar, o bot tem que silenciar nas próximas mensagens.
 */

// ---------------------------------------------------------------------------
// Supabase falso com estado (só o subconjunto de operações que o código usa)
// ---------------------------------------------------------------------------
type Row = Record<string, any>
const db: Record<string, Row[]> = {}

function seed(tabelas: Record<string, Row[]>) {
  for (const k of Object.keys(db)) delete db[k]
  for (const [t, rows] of Object.entries(tabelas)) db[t] = rows.map((r) => ({ ...r }))
}

function makeBuilder(table: string) {
  const rows = () => (db[table] ??= [])
  const filtros: ((r: Row) => boolean)[] = []
  let op: { kind: 'update' | 'insert' | 'upsert'; payload: any; opts?: any } | null = null
  let limitN: number | null = null
  const casam = () => rows().filter((r) => filtros.every((f) => f(r)))

  const exec = () => {
    if (op?.kind === 'update') {
      for (const r of casam()) Object.assign(r, op.payload)
      return { data: null, error: null }
    }
    if (op?.kind === 'insert') {
      const arr = Array.isArray(op.payload) ? op.payload : [op.payload]
      rows().push(...arr.map((o: Row) => ({ ...o })))
      return { data: null, error: null }
    }
    if (op?.kind === 'upsert') {
      const key = op.opts?.onConflict as string | undefined
      const obj = op.payload as Row
      const existente = key ? rows().find((r) => String(r[key]) === String(obj[key])) : undefined
      if (existente) Object.assign(existente, obj)
      else rows().push({ ...obj })
      return { data: null, error: null }
    }
    let res = casam()
    if (limitN != null) res = res.slice(0, limitN)
    return { data: res, error: null }
  }

  const builder: any = {
    select: () => builder,
    order: () => builder,
    limit: (n: number) => ((limitN = n), builder),
    eq: (c: string, v: any) => (filtros.push((r) => String(r[c]) === String(v)), builder),
    or: (expr: string) => {
      const clausulas = expr.split(',').map((c) => {
        const [col, , val] = c.split('.')
        return (r: Row) => String(r[col]) === String(val)
      })
      filtros.push((r) => clausulas.some((f) => f(r)))
      return builder
    },
    update: (p: Row) => ((op = { kind: 'update', payload: p }), builder),
    insert: (p: Row) => ((op = { kind: 'insert', payload: p }), builder),
    upsert: (p: Row, opts: any) => ((op = { kind: 'upsert', payload: p, opts }), builder),
    maybeSingle: () => {
      const { data, error } = exec()
      return Promise.resolve({ data: Array.isArray(data) ? (data[0] ?? null) : data, error })
    },
    then: (resolve: any, reject: any) => Promise.resolve(exec()).then(resolve, reject),
  }
  return builder
}

vi.mock('@/lib/supabase', () => ({ supabase: { from: (t: string) => makeBuilder(t) } }))
vi.mock('@/lib/agent-auth', () => ({ verifyAgentKey: () => true }))
vi.mock('@/lib/evolution', () => ({ sendWhatsAppText: vi.fn(async () => {}) }))

import { POST } from '@/app/api/agente/notificar/route'
import { emAtendimentoHumano } from '@/lib/agente/conversa'

const TEL = '5511986872405'

function req(body: any) {
  return { json: async () => body } as any
}

/** Simula o gate do webhook: se em atendimento humano, o bot NÃO responde. */
async function botResponderia(telefone: string): Promise<boolean> {
  return !(await emAtendimentoHumano(telefone))
}

beforeEach(() => {
  seed({
    // NÃO é tutor cadastrado.
    tutores: [],
    // Mas já trocou mensagem com o bot, então existe linha em `conversas`.
    conversas: [{ telefone: TEL, historico: [{ role: 'user', content: 'oi' }], atendimento_humano_ate: null }],
    configuracoes_agente: [{ id: 1, tempo_retorno_ia_horas: 2 }],
  })
})

describe('cenário: tutor NÃO cadastrado precisa de humano', () => {
  it('antes de escalar, o bot responde normalmente', async () => {
    expect(await botResponderia(TEL)).toBe(true)
  })

  it('ao escalar (pergunta_tecnica), o bot PARA de responder', async () => {
    // Escala como a IA faz: transferir_humano → /api/agente/notificar
    const res = await POST(req({ telefone: TEL, motivo: 'pergunta_tecnica', tipo_evento: 'pergunta_tecnica' }))
    expect((await res.json()).sucesso).toBe(true)

    // A pausa foi gravada em `conversas` (não havia linha em `tutores` pra gravar).
    const conversa = db.conversas.find((c) => c.telefone === TEL)!
    expect(new Date(conversa.atendimento_humano_ate).getTime()).toBeGreaterThan(Date.now())

    // O histórico da conversa foi preservado (upsert não apagou nada).
    expect(conversa.historico).toHaveLength(1)

    // E o efeito que importa: o bot silencia nas próximas mensagens.
    expect(await botResponderia(TEL)).toBe(false)
  })

  it('a pausa expira sozinha depois do prazo, e o bot volta a responder', async () => {
    db.conversas[0].atendimento_humano_ate = new Date(Date.now() - 60_000).toISOString() // venceu há 1 min
    expect(await botResponderia(TEL)).toBe(true)
  })
})

describe('toda escalação da IA pausa o atendimento', () => {
  // transferir_humano só gera estes 4 motivos (orquestrador.ts), todos bloqueantes.
  for (const motivo of ['pergunta_tecnica', 'pergunta_laudo', 'erro_tecnico', 'ia_travou']) {
    it(`motivo "${motivo}" pausa o bot`, async () => {
      await POST(req({ telefone: TEL, motivo, tipo_evento: motivo }))
      expect(await botResponderia(TEL)).toBe(false)
    })
  }

  it('agendamento_clinica (aviso, não escalação) NÃO pausa o bot', async () => {
    await POST(req({ telefone: TEL, motivo: 'agendamento_clinica', tipo_evento: 'agendamento_clinica' }))
    expect(await botResponderia(TEL)).toBe(true)
  })
})
