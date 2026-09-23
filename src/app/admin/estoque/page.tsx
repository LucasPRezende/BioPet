'use client'

import { Fragment, useState, useEffect, useCallback } from 'react'

interface Consumivel {
  id:               number
  nome:             string
  unidade:          string
  categoria:        string
  estoque_minimo:   number
  ativo:            boolean
  estoque:          number
  pendente:         number
  reservado:        number
  disponivel:       number
  reservas:         { agendamento_id: number; data_hora: string; pet_nome: string }[]
  valor_estoque:    number
  custo_atual:      number | null
  proxima_validade: string | null
  testes:           { id: number; nome: string }[]
}

interface TesteRapido { id: number; nome: string; consumivel_id: number | null }

interface Compra {
  id:             number
  consumivel_id:  number
  data_compra:    string
  quantidade:     number
  valor_total:    number
  custo_unitario: number
  saldo:          number
  fornecedor:     string | null
  validade:       string | null
  observacao:     string | null
  consumiveis:    { nome: string; unidade: string } | null
  system_users:   { nome: string } | null
}

interface Movimento {
  id:                 number
  consumivel_id:      number
  compra_id:          number | null
  tipo:               'consumo' | 'perda'
  quantidade:         number
  custo_unitario:     number
  laudo_id:           number | null
  origem_tipo:        string | null
  origem_id:          number | null
  observacao:         string | null
  criado_em:          string
  consumiveis:        { nome: string; unidade: string } | null
  laudos:             { nome_pet: string; tutor: string } | null
  system_users:       { nome: string } | null
  consumivel_compras: { data_compra: string } | null
}

type Aba = 'estoque' | 'compras' | 'saidas'

// Mesma lista de CATEGORIAS em lib/estoque (texto livre no banco)
const CATEGORIA_LABEL: Record<string, string> = {
  teste_rapido: 'Testes rápidos',
  tubo:         'Tubos de coleta',
  caixa:        'Caixas e envio',
  reagente:     'Reagentes',
  outro:        'Outros',
}
const ORDEM_CATEGORIAS = Object.keys(CATEGORIA_LABEL)

// Rótulo da origem de uma saída que não vem de laudo
const ORIGEM_LABEL: Record<string, string> = {
  pedido_lab: 'Pedido lab',
}

const INPUT = 'border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36] bg-white'

function brl(n: number | null | undefined) {
  return Number(n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtData(iso: string | null) {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

// Aceita "1.234,56", "1234,56" e "1234.56"
function parseValor(v: string) {
  const t = v.trim()
  return Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t)
}

function fmtDataHora(iso: string) {
  return `${fmtData(iso)} ${iso.slice(11, 16)}`
}

// Mesma regra do alerta do dashboard (precisaRepor em lib/estoque)
function precisaRepor(c: Consumivel) {
  return c.disponivel < 0 || (c.estoque_minimo > 0 && c.disponivel <= c.estoque_minimo)
}

function hojeISO() {
  return new Date().toLocaleDateString('en-CA')
}

function diasAte(iso: string) {
  return Math.round((new Date(iso + 'T12:00:00').getTime() - new Date(hojeISO() + 'T12:00:00').getTime()) / 86_400_000)
}

export default function EstoquePage() {
  const [aba,         setAba]         = useState<Aba>('estoque')
  const [consumiveis, setConsumiveis] = useState<Consumivel[]>([])
  const [testes,      setTestes]      = useState<TesteRapido[]>([])
  const [compras,     setCompras]     = useState<Compra[]>([])
  const [movimentos,  setMovimentos]  = useState<Movimento[]>([])
  const [loading,     setLoading]     = useState(true)
  const [erro,        setErro]        = useState('')
  const [msg,         setMsg]         = useState('')
  const [mostrarInativos, setMostrarInativos] = useState(false)
  const [filtro,      setFiltro]      = useState<number | ''>('')
  const [abertoReservas, setAbertoReservas] = useState<number | null>(null)

  const [editando,  setEditando]  = useState<Consumivel | 'novo' | null>(null)
  const [baixando,  setBaixando]  = useState<Consumivel | null>(null)

  // Formulário de compra
  const [fCons,   setFCons]   = useState<number | ''>('')
  const [fData,   setFData]   = useState(hojeISO())
  const [fQtd,    setFQtd]    = useState('')
  const [fValor,  setFValor]  = useState('')
  const [fForn,   setFForn]   = useState('')
  const [fVal,    setFVal]    = useState('')
  const [fObs,    setFObs]    = useState('')
  const [salvandoCompra, setSalvandoCompra] = useState(false)

  const carregar = useCallback(async () => {
    setLoading(true)
    const [rE, rC, rM] = await Promise.all([
      fetch('/api/estoque'),
      fetch('/api/estoque/compras'),
      fetch('/api/estoque/movimentos'),
    ])
    if (rE.ok) {
      const d = await rE.json()
      setConsumiveis(d.consumiveis ?? [])
      setTestes(d.testes ?? [])
    } else {
      const d = await rE.json().catch(() => ({}))
      setErro(d.error ?? 'Erro ao carregar o estoque.')
    }
    if (rC.ok) setCompras(await rC.json())
    if (rM.ok) setMovimentos(await rM.json())
    setLoading(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  function novaCompra(c?: Consumivel) {
    setFCons(c ? c.id : '')
    setAba('compras')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function salvarCompra(e: React.FormEvent) {
    e.preventDefault()
    setErro(''); setMsg('')
    setSalvandoCompra(true)
    const res = await fetch('/api/estoque/compras', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        consumivel_id: fCons,
        data_compra:   fData,
        quantidade:    Number(fQtd),
        valor_total:   parseValor(fValor),
        fornecedor:    fForn,
        validade:      fVal || null,
        observacao:    fObs,
      }),
    })
    if (res.ok) {
      setFQtd(''); setFValor(''); setFForn(''); setFVal(''); setFObs('')
      setMsg('Compra lançada.')
      await carregar()
    } else {
      const d = await res.json().catch(() => ({}))
      setErro(d.error ?? 'Erro ao lançar a compra.')
    }
    setSalvandoCompra(false)
  }

  async function excluirCompra(c: Compra) {
    if (!confirm(`Excluir a compra de ${c.quantidade} × ${c.consumiveis?.nome} em ${fmtData(c.data_compra)}?`)) return
    setErro(''); setMsg('')
    const res = await fetch(`/api/estoque/compras/${c.id}`, { method: 'DELETE' })
    if (res.ok) await carregar()
    else {
      const d = await res.json().catch(() => ({}))
      setErro(d.error ?? 'Erro ao excluir.')
    }
  }

  const ativos     = consumiveis.filter(c => c.ativo)
  const visiveis   = mostrarInativos ? consumiveis : ativos
  const grupos = Array.from(new Set(visiveis.map(c => c.categoria)))
    .sort((a, b) => (ORDEM_CATEGORIAS.indexOf(a) + 1 || 99) - (ORDEM_CATEGORIAS.indexOf(b) + 1 || 99))
    .map(cat => ({ cat, itens: visiveis.filter(c => c.categoria === cat) }))
  const valorTotal = ativos.reduce((s, c) => s + c.valor_estoque, 0)
  const paraRepor  = ativos.filter(precisaRepor).length

  // Custo que saiu do estoque nos últimos 30 dias (laudos + baixas)
  const corte30 = new Date(); corte30.setDate(corte30.getDate() - 30)
  const saidas30 = movimentos.filter(m => new Date(m.criado_em) >= corte30)
  const custo30  = saidas30.reduce((s, m) => s + m.quantidade * Number(m.custo_unitario), 0)
  const perdas30 = saidas30.filter(m => m.tipo === 'perda').reduce((s, m) => s + m.quantidade * Number(m.custo_unitario), 0)

  const custoUnitPreview = Number(fQtd) > 0 && fValor ? parseValor(fValor) / Number(fQtd) : null

  const comprasFiltradas    = filtro ? compras.filter(c => c.consumivel_id === filtro) : compras
  const movimentosFiltrados = filtro ? movimentos.filter(m => m.consumivel_id === filtro) : movimentos

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[#19202d]">Estoque de consumíveis</h1>
          <p className="text-sm text-gray-500 mt-1">
            Cada compra é um lote com custo próprio. Os laudos gastam primeiro o lote mais antigo, e o custo do laudo sai dele.
          </p>
        </div>
        <button onClick={() => setEditando('novo')}
          className="bg-[#19202d] text-white text-sm font-semibold px-4 py-2 rounded-lg">
          + Novo consumível
        </button>
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex justify-between">
          {erro}
          <button onClick={() => setErro('')} className="ml-4 font-bold">✕</button>
        </div>
      )}
      {msg && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700 flex justify-between">
          ✓ {msg}
          <button onClick={() => setMsg('')} className="ml-4 font-bold">✕</button>
        </div>
      )}

      {/* Resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Resumo label="Valor em estoque"        valor={brl(valorTotal)} />
        <Resumo label="Itens para repor"        valor={String(paraRepor)} destaque={paraRepor > 0} />
        <Resumo label="Custo das saídas (30d)"  valor={brl(custo30)} sub={`${saidas30.length} saída${saidas30.length === 1 ? '' : 's'}`} />
        <Resumo label="Perdas / baixas (30d)"   valor={brl(perdas30)} />
      </div>

      {/* Abas */}
      <div className="flex gap-1 border-b border-gray-200">
        {([['estoque', 'Estoque'], ['compras', 'Compras'], ['saidas', 'Saídas']] as [Aba, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setAba(k)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition ${
              aba === k ? 'border-[#8a6e36] text-[#19202d]' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}>
            {l}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">Carregando…</div>
      ) : aba === 'estoque' ? (
        <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex justify-between items-center">
            <h2 className="font-semibold text-[#19202d]">Situação atual</h2>
            <label className="text-xs text-gray-500 flex items-center gap-1.5">
              <input type="checkbox" checked={mostrarInativos} onChange={e => setMostrarInativos(e.target.checked)} />
              mostrar inativos
            </label>
          </div>
          {visiveis.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">Nenhum consumível cadastrado.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="text-left px-5 py-2">Consumível</th>
                    <th className="text-right px-3 py-2">Estoque</th>
                    <th className="text-right px-3 py-2">Agendados</th>
                    <th className="text-right px-3 py-2">Disponível</th>
                    <th className="text-right px-3 py-2">Mínimo</th>
                    <th className="text-right px-3 py-2">Custo atual</th>
                    <th className="text-right px-3 py-2">Valor</th>
                    <th className="text-left px-3 py-2">Validade</th>
                    <th className="px-5 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {grupos.map(({ cat, itens }) => (
                    <Fragment key={cat}>
                      {grupos.length > 1 && (
                        <tr className="bg-gray-50/70">
                          <td colSpan={9} className="px-5 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#8a6e36]">
                            {CATEGORIA_LABEL[cat] ?? cat}
                          </td>
                        </tr>
                      )}
                  {itens.map(c => {
                    const baixo = precisaRepor(c)
                    const dias  = c.proxima_validade ? diasAte(c.proxima_validade) : null
                    const aberto = abertoReservas === c.id
                    return (
                      <Fragment key={c.id}>
                      <tr className={c.ativo ? '' : 'opacity-50'}>
                        <td className="px-5 py-3">
                          <p className="font-semibold text-[#19202d]">{c.nome}{!c.ativo && ' (inativo)'}</p>
                          <p className="text-[11px] text-gray-400">
                            {c.testes.length > 0
                              ? `Usado em: ${c.testes.map(t => t.nome).join(', ')}`
                              : c.categoria === 'teste_rapido' ? 'Sem teste vinculado — não dá baixa automática' : c.unidade}
                          </p>
                          {c.pendente > 0 && (
                            <p className="text-[11px] text-red-600 mt-0.5">
                              {c.pendente} {c.unidade} saíram sem estoque — o custo é acertado na próxima compra
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right whitespace-nowrap">
                          <span className={`font-semibold ${c.estoque < 0 ? 'text-red-600' : 'text-gray-700'}`}>{c.estoque}</span>{' '}
                          <span className="text-xs text-gray-400">{c.unidade}</span>
                        </td>
                        <td className="px-3 py-3 text-right">
                          {c.reservado > 0 ? (
                            <button onClick={() => setAbertoReservas(aberto ? null : c.id)}
                              className="text-[#8a6e36] font-semibold hover:underline" title="Ver agendamentos">
                              {c.reservado} {aberto ? '▴' : '▾'}
                            </button>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-3 text-right whitespace-nowrap">
                          <span className={`font-bold ${c.disponivel < 0 ? 'text-red-600' : baixo ? 'text-orange-600' : 'text-[#19202d]'}`}>
                            {c.disponivel}
                          </span>
                          {c.disponivel < 0 && <p className="text-[10px] text-red-600 font-semibold">faltam {-c.disponivel}</p>}
                        </td>
                        <td className="px-3 py-3 text-right text-gray-500">{c.estoque_minimo || '—'}</td>
                        <td className="px-3 py-3 text-right text-gray-700 whitespace-nowrap">{c.custo_atual !== null ? brl(c.custo_atual) : '—'}</td>
                        <td className="px-3 py-3 text-right text-gray-700 whitespace-nowrap">{brl(c.valor_estoque)}</td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {c.proxima_validade ? (
                            <span className={dias !== null && dias < 0 ? 'text-red-600 font-semibold' : dias !== null && dias <= 30 ? 'text-amber-600 font-semibold' : 'text-gray-500'}>
                              {fmtData(c.proxima_validade)}
                            </span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex gap-1.5 justify-end">
                            {c.ativo && (
                              <>
                                <button onClick={() => novaCompra(c)} className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-[#8a6e36] text-white whitespace-nowrap">+ Compra</button>
                                <button onClick={() => setBaixando(c)} className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 whitespace-nowrap">Baixa</button>
                              </>
                            )}
                            <button onClick={() => setEditando(c)} className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600">✏️</button>
                          </div>
                        </td>
                      </tr>
                      {aberto && (
                        <tr className="bg-amber-50/40">
                          <td colSpan={9} className="px-5 py-2">
                            <p className="text-[11px] font-semibold text-gray-500 mb-1">Agendamentos que vão usar este consumível (ainda sem laudo):</p>
                            <div className="flex flex-wrap gap-1.5">
                              {c.reservas.map(r => (
                                <a key={r.agendamento_id} href={`/admin/agenda?data=${r.data_hora.slice(0, 10)}&abrir=${r.agendamento_id}`}
                                  className="text-[11px] bg-white border border-gray-200 rounded-full px-2.5 py-0.5 text-gray-700 hover:border-[#8a6e36]">
                                  {fmtDataHora(r.data_hora)} · {r.pet_nome}
                                </a>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    )
                  })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : aba === 'compras' ? (
        <div className="space-y-5">
          <form onSubmit={salvarCompra} className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
            <h2 className="font-semibold text-[#19202d]">Lançar compra</h2>
            <p className="text-xs text-gray-500">
              Para começar a usar o controle, lance o estoque que já existe hoje como uma compra (com o valor pago nele).
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Campo label="Consumível *">
                <select value={fCons} onChange={e => setFCons(e.target.value ? Number(e.target.value) : '')} className={`${INPUT} w-full`} required>
                  <option value="">Selecione…</option>
                  {ativos.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </Campo>
              <Campo label="Data da compra *">
                <input type="date" value={fData} onChange={e => setFData(e.target.value)} className={`${INPUT} w-full`} required />
              </Campo>
              <Campo label="Quantidade *">
                <input type="number" min={1} step={1} value={fQtd} onChange={e => setFQtd(e.target.value)} className={`${INPUT} w-full`} required />
              </Campo>
              <Campo label="Valor total pago (R$) *">
                <input type="text" inputMode="decimal" value={fValor} onChange={e => setFValor(e.target.value)} placeholder="0,00" className={`${INPUT} w-full`} required />
              </Campo>
              <Campo label="Fornecedor">
                <input type="text" value={fForn} onChange={e => setFForn(e.target.value)} className={`${INPUT} w-full`} />
              </Campo>
              <Campo label="Validade do lote">
                <input type="date" value={fVal} onChange={e => setFVal(e.target.value)} className={`${INPUT} w-full`} />
              </Campo>
              <div className="sm:col-span-2">
                <Campo label="Observação">
                  <input type="text" value={fObs} onChange={e => setFObs(e.target.value)} placeholder="Ex.: nota fiscal, frete incluso…" className={`${INPUT} w-full`} />
                </Campo>
              </div>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <button type="submit" disabled={salvandoCompra}
                className="bg-[#19202d] text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-40">
                {salvandoCompra ? 'Salvando…' : 'Lançar compra'}
              </button>
              {custoUnitPreview !== null && Number.isFinite(custoUnitPreview) && (
                <span className="text-sm text-gray-600">Custo por unidade: <strong>{brl(custoUnitPreview)}</strong></span>
              )}
            </div>
          </form>

          <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex justify-between items-center gap-3 flex-wrap">
              <h2 className="font-semibold text-[#19202d]">Compras (lotes)</h2>
              <FiltroConsumivel consumiveis={consumiveis} valor={filtro} onChange={setFiltro} />
            </div>
            {comprasFiltradas.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-gray-400">Nenhuma compra lançada.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="text-left px-5 py-2">Data</th>
                      <th className="text-left px-3 py-2">Consumível</th>
                      <th className="text-right px-3 py-2">Qtd</th>
                      <th className="text-right px-3 py-2">Total</th>
                      <th className="text-right px-3 py-2">Custo/un</th>
                      <th className="text-right px-3 py-2">Restam</th>
                      <th className="text-left px-3 py-2">Validade</th>
                      <th className="text-left px-3 py-2">Fornecedor</th>
                      <th className="px-5 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {comprasFiltradas.map(c => (
                      <tr key={c.id}>
                        <td className="px-5 py-2.5 whitespace-nowrap text-gray-600">{fmtData(c.data_compra)}</td>
                        <td className="px-3 py-2.5">
                          <p className="font-medium text-[#19202d]">{c.consumiveis?.nome}</p>
                          {(c.observacao || c.system_users?.nome) && (
                            <p className="text-[11px] text-gray-400">{[c.observacao, c.system_users?.nome && `por ${c.system_users.nome}`].filter(Boolean).join(' · ')}</p>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">{c.quantidade}</td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">{brl(c.valor_total)}</td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap font-semibold">{brl(c.custo_unitario)}</td>
                        <td className="px-3 py-2.5 text-right">
                          <span className={c.saldo === 0 ? 'text-gray-300' : 'text-[#19202d] font-semibold'}>{c.saldo}</span>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-gray-500">{fmtData(c.validade)}</td>
                        <td className="px-3 py-2.5 text-gray-500">{c.fornecedor ?? '—'}</td>
                        <td className="px-5 py-2.5 text-right">
                          {c.saldo === c.quantidade && (
                            <button onClick={() => excluirCompra(c)} title="Excluir (só compras ainda não usadas)"
                              className="text-xs text-red-500 hover:text-red-700">Excluir</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      ) : (
        <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex justify-between items-center gap-3 flex-wrap">
            <h2 className="font-semibold text-[#19202d]">Saídas</h2>
            <FiltroConsumivel consumiveis={consumiveis} valor={filtro} onChange={setFiltro} />
          </div>
          {movimentosFiltrados.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">Nenhuma saída registrada.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="text-left px-5 py-2">Data</th>
                    <th className="text-left px-3 py-2">Consumível</th>
                    <th className="text-left px-3 py-2">Motivo</th>
                    <th className="text-right px-3 py-2">Qtd</th>
                    <th className="text-right px-3 py-2">Custo</th>
                    <th className="text-left px-5 py-2">Lote</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {movimentosFiltrados.map(m => (
                    <tr key={m.id}>
                      <td className="px-5 py-2.5 whitespace-nowrap text-gray-600">{fmtData(m.criado_em)}</td>
                      <td className="px-3 py-2.5 font-medium text-[#19202d]">{m.consumiveis?.nome}</td>
                      <td className="px-3 py-2.5">
                        {m.tipo === 'consumo' && m.laudo_id ? (
                          <span className="text-gray-700">
                            Laudo — {m.laudos?.nome_pet ?? `#${m.laudo_id}`}
                            {m.laudos?.tutor && <span className="text-gray-400"> ({m.laudos.tutor})</span>}
                          </span>
                        ) : m.tipo === 'consumo' ? (
                          <span className="text-gray-700">
                            {m.origem_tipo ? `${ORIGEM_LABEL[m.origem_tipo] ?? m.origem_tipo} #${m.origem_id}` : 'Consumo'}
                            {m.observacao && <span className="text-gray-400"> — {m.observacao}</span>}
                          </span>
                        ) : (
                          <span className="text-gray-700">
                            <span className="text-[10px] font-bold bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded mr-1.5">BAIXA</span>
                            {m.observacao}
                            {m.system_users?.nome && <span className="text-gray-400"> · {m.system_users.nome}</span>}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">{m.quantidade}</td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">{brl(m.quantidade * Number(m.custo_unitario))}</td>
                      <td className="px-5 py-2.5 whitespace-nowrap text-xs">
                        {m.compra_id
                          ? <span className="text-gray-500">compra de {fmtData(m.consumivel_compras?.data_compra ?? null)}</span>
                          : <span className="text-red-600 font-semibold">sem estoque (custo estimado)</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {editando && (
        <ModalConsumivel
          consumivel={editando === 'novo' ? null : editando}
          testes={testes}
          onClose={() => setEditando(null)}
          onSaved={async () => { setEditando(null); await carregar() }}
        />
      )}
      {baixando && (
        <ModalBaixa
          consumivel={baixando}
          onClose={() => setBaixando(null)}
          onSaved={async () => { setBaixando(null); setMsg('Baixa registrada.'); await carregar() }}
        />
      )}
    </div>
  )
}

function Resumo({ label, valor, sub, destaque }: { label: string; valor: string; sub?: string; destaque?: boolean }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${destaque ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-200'}`}>
      <p className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">{label}</p>
      <p className={`text-lg font-extrabold mt-0.5 ${destaque ? 'text-orange-700' : 'text-[#19202d]'}`}>{valor}</p>
      {sub && <p className="text-[11px] text-gray-400">{sub}</p>}
    </div>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  )
}

function FiltroConsumivel({ consumiveis, valor, onChange }: {
  consumiveis: Consumivel[]; valor: number | ''; onChange: (v: number | '') => void
}) {
  return (
    <select value={valor} onChange={e => onChange(e.target.value ? Number(e.target.value) : '')} className={`${INPUT} py-1.5 text-xs`}>
      <option value="">Todos os consumíveis</option>
      {consumiveis.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
    </select>
  )
}

function Modal({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center">
          <h3 className="font-semibold text-[#19202d]">{titulo}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 font-bold">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function ModalConsumivel({ consumivel, testes, onClose, onSaved }: {
  consumivel: Consumivel | null
  testes:     TesteRapido[]
  onClose:    () => void
  onSaved:    () => void
}) {
  const [nome,    setNome]    = useState(consumivel?.nome ?? '')
  const [unidade, setUnidade] = useState(consumivel?.unidade ?? 'un')
  const [categoria, setCategoria] = useState(consumivel?.categoria ?? 'teste_rapido')
  const [minimo,  setMinimo]  = useState(String(consumivel?.estoque_minimo ?? 0))
  const [ativo,   setAtivo]   = useState(consumivel?.ativo ?? true)
  const [vinculo, setVinculo] = useState<number[]>(consumivel?.testes.map(t => t.id) ?? [])
  const [salvando, setSalvando] = useState(false)
  const [erro,    setErro]    = useState('')

  function toggle(id: number) {
    setVinculo(v => v.includes(id) ? v.filter(x => x !== id) : [...v, id])
  }

  async function salvar() {
    if (!nome.trim()) { setErro('Informe o nome.'); return }
    setSalvando(true); setErro('')
    const res = await fetch(consumivel ? `/api/estoque/consumiveis/${consumivel.id}` : '/api/estoque/consumiveis', {
      method:  consumivel ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome, unidade, categoria, estoque_minimo: Number(minimo), ativo,
        testes_ids: categoria === 'teste_rapido' ? vinculo : [],
      }),
    })
    if (res.ok) onSaved()
    else {
      const d = await res.json().catch(() => ({}))
      setErro(d.error ?? 'Erro ao salvar.')
      setSalvando(false)
    }
  }

  return (
    <Modal titulo={consumivel ? 'Editar consumível' : 'Novo consumível'} onClose={onClose}>
      <Campo label="Nome *">
        <input type="text" value={nome} onChange={e => setNome(e.target.value)} className={`${INPUT} w-full`} />
      </Campo>
      <Campo label="Categoria">
        <select value={categoria} onChange={e => setCategoria(e.target.value)} className={`${INPUT} w-full`}>
          {ORDEM_CATEGORIAS.map(k => <option key={k} value={k}>{CATEGORIA_LABEL[k]}</option>)}
        </select>
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Unidade">
          <input type="text" value={unidade} onChange={e => setUnidade(e.target.value)} placeholder="teste, un, caixa…" className={`${INPUT} w-full`} />
        </Campo>
        <Campo label="Estoque mínimo (alerta)">
          <input type="number" min={0} step={1} value={minimo} onChange={e => setMinimo(e.target.value)} className={`${INPUT} w-full`} />
        </Campo>
      </div>
      {categoria === 'teste_rapido' && (
      <div>
        <p className="text-xs text-gray-500 mb-1.5">Testes rápidos que gastam 1 unidade deste consumível</p>
        <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-56 overflow-y-auto">
          {testes.map(t => {
            const outro = t.consumivel_id && t.consumivel_id !== consumivel?.id && !vinculo.includes(t.id)
            return (
              <label key={t.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
                <input type="checkbox" checked={vinculo.includes(t.id)} onChange={() => toggle(t.id)} />
                <span className="flex-1">{t.nome}</span>
                {outro && <span className="text-[10px] text-amber-600">vinculado a outro</span>}
              </label>
            )
          })}
        </div>
        <p className="text-[11px] text-gray-400 mt-1">Um teste só gasta de um consumível; marcar aqui tira ele do anterior.</p>
      </div>
      )}
      {consumivel && (
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} />
          Ativo {!ativo && <span className="text-xs text-gray-400">(inativar desvincula os testes)</span>}
        </label>
      )}
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg border border-gray-200 text-gray-600">Cancelar</button>
        <button onClick={salvar} disabled={salvando} className="bg-[#19202d] text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-40">
          {salvando ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </Modal>
  )
}

const MOTIVOS = ['Teste repetido', 'Kit com defeito', 'Vencido', 'Perda / quebra', 'Uso interno', 'Ajuste de contagem']

function ModalBaixa({ consumivel, onClose, onSaved }: {
  consumivel: Consumivel
  onClose:    () => void
  onSaved:    () => void
}) {
  const [qtd,    setQtd]    = useState('1')
  const [motivo, setMotivo] = useState(MOTIVOS[0])
  const [detalhe, setDetalhe] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro,   setErro]   = useState('')

  async function salvar() {
    setSalvando(true); setErro('')
    const res = await fetch('/api/estoque/movimentos', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        consumivel_id: consumivel.id,
        quantidade:    Number(qtd),
        observacao:    detalhe.trim() ? `${motivo} — ${detalhe.trim()}` : motivo,
      }),
    })
    if (res.ok) onSaved()
    else {
      const d = await res.json().catch(() => ({}))
      setErro(d.error ?? 'Erro ao registrar a baixa.')
      setSalvando(false)
    }
  }

  return (
    <Modal titulo={`Baixa — ${consumivel.nome}`} onClose={onClose}>
      <p className="text-xs text-gray-500">
        Para saídas que não são de laudo. A unidade sai do lote mais antigo, com o custo dele. Em estoque: <strong>{consumivel.estoque} {consumivel.unidade}</strong>
        {consumivel.reservado > 0 && <> ({consumivel.reservado} já agendado{consumivel.reservado > 1 ? 's' : ''})</>}.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Quantidade">
          <input type="number" min={1} step={1} value={qtd} onChange={e => setQtd(e.target.value)} className={`${INPUT} w-full`} />
        </Campo>
        <Campo label="Motivo">
          <select value={motivo} onChange={e => setMotivo(e.target.value)} className={`${INPUT} w-full`}>
            {MOTIVOS.map(m => <option key={m}>{m}</option>)}
          </select>
        </Campo>
      </div>
      <Campo label="Detalhe (opcional)">
        <input type="text" value={detalhe} onChange={e => setDetalhe(e.target.value)} placeholder="Ex.: paciente Thor, resultado inconclusivo" className={`${INPUT} w-full`} />
      </Campo>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg border border-gray-200 text-gray-600">Cancelar</button>
        <button onClick={salvar} disabled={salvando || !(Number(qtd) > 0)} className="bg-[#19202d] text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-40">
          {salvando ? 'Salvando…' : 'Registrar baixa'}
        </button>
      </div>
    </Modal>
  )
}
