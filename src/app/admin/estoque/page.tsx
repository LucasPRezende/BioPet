'use client'

import { useState, useEffect, useMemo, Fragment } from 'react'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Insumo {
  id:             number
  nome:           string
  tipo:           string
  cor_tubo:       string | null
  unidade:        string
  custo_unitario: number
  estoque_atual:  number
  estoque_minimo: number
  ativo:          boolean
}

interface ItemKit { insumo_id: number; quantidade: number }

interface CaixaPreset {
  id:             number
  nome:           string
  altura_cm:      number
  largura_cm:     number
  comprimento_cm: number
  peso_kg:        number
  kit_json:       ItemKit[] | null
  ativo:          boolean
}

const TIPO_LABEL: Record<string, string> = { tubo: 'Tubo', caixa: 'Caixa', outro: 'Outro' }

// ── Modal: novo insumo ───────────────────────────────────────────────────────

function NovoInsumoModal({ onClose, onCriado }: { onClose: () => void; onCriado: () => void }) {
  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState<'tubo' | 'caixa' | 'outro'>('tubo')
  const [corTubo, setCorTubo] = useState('')
  const [unidade, setUnidade] = useState('un')
  const [custo, setCusto] = useState('0')
  const [estoqueInicial, setEstoqueInicial] = useState('0')
  const [minimo, setMinimo] = useState('0')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  async function criar() {
    if (!nome.trim()) { setErro('Nome é obrigatório.'); return }
    setEnviando(true); setErro('')
    const res = await fetch('/api/estoque/insumos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: nome.trim(), tipo, cor_tubo: tipo === 'tubo' ? corTubo.trim() || null : null,
        unidade: unidade.trim() || 'un',
        custo_unitario: parseFloat(custo) || 0,
        estoque_atual:  parseFloat(estoqueInicial) || 0,
        estoque_minimo: parseFloat(minimo) || 0,
      }),
    })
    if (res.ok) { onCriado(); return }
    const d = await res.json()
    setErro(d.error ?? 'Erro ao criar insumo.')
    setEnviando(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="bg-[#19202d] px-6 py-4 flex items-center justify-between">
          <h3 className="text-white font-bold text-sm">Novo insumo</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
        </div>
        <div className="p-6 space-y-3">
          <input type="text" value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome (ex: Tubo Roxa EDTA)"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36]" />
          <div className="grid grid-cols-2 gap-2">
            <select value={tipo} onChange={e => setTipo(e.target.value as typeof tipo)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#8a6e36]">
              <option value="tubo">Tubo</option>
              <option value="caixa">Caixa</option>
              <option value="outro">Outro</option>
            </select>
            <input type="text" value={unidade} onChange={e => setUnidade(e.target.value)} placeholder="Unidade (un, mL...)"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36]" />
          </div>
          {tipo === 'tubo' && (
            <input type="text" value={corTubo} onChange={e => setCorTubo(e.target.value)}
              placeholder="Cor do tubo (ex: Roxa) — liga com a consolidação"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36]" />
          )}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Custo unit.</label>
              <input type="number" step="0.01" value={custo} onChange={e => setCusto(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36]" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Estoque inicial</label>
              <input type="number" step="0.01" value={estoqueInicial} onChange={e => setEstoqueInicial(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36]" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Mínimo</label>
              <input type="number" step="0.01" value={minimo} onChange={e => setMinimo(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36]" />
            </div>
          </div>
          {erro && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 border border-gray-200 text-gray-500 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition">
              Cancelar
            </button>
            <button type="button" onClick={criar} disabled={enviando}
              className="flex-1 bg-[#19202d] hover:bg-[#232d3f] text-white font-semibold py-2.5 rounded-lg text-sm transition disabled:opacity-40">
              {enviando ? 'Criando...' : 'Criar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Modal: registrar movimento ───────────────────────────────────────────────

function MovimentoModal({ insumo, onClose, onRegistrado }: { insumo: Insumo; onClose: () => void; onRegistrado: () => void }) {
  const [tipo, setTipo] = useState<'entrada' | 'ajuste'>('entrada')
  const [quantidade, setQuantidade] = useState('')
  const [custoUnitario, setCustoUnitario] = useState(String(insumo.custo_unitario))
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  async function registrar() {
    const qtd = parseFloat(quantidade)
    if (!qtd) { setErro('Informe a quantidade.'); return }
    setEnviando(true); setErro('')
    const res = await fetch(`/api/estoque/insumos/${insumo.id}/movimento`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tipo, quantidade: qtd,
        custo_unitario: tipo === 'entrada' ? (parseFloat(custoUnitario) || null) : null,
        motivo: motivo.trim() || null,
      }),
    })
    if (res.ok) { onRegistrado(); return }
    const d = await res.json()
    setErro(d.error ?? 'Erro ao registrar movimento.')
    setEnviando(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="bg-[#19202d] px-6 py-4 flex items-center justify-between">
          <h3 className="text-white font-bold text-sm">Movimento — {insumo.nome}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
        </div>
        <div className="p-6 space-y-3">
          <p className="text-xs text-gray-400">Estoque atual: <b className="text-[#19202d]">{insumo.estoque_atual} {insumo.unidade}</b></p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setTipo('entrada')}
              className={`py-2 rounded-lg text-sm font-semibold border transition ${tipo === 'entrada' ? 'bg-[#19202d] text-white border-[#19202d]' : 'border-gray-200 text-gray-500'}`}>
              Entrada (compra)
            </button>
            <button type="button" onClick={() => setTipo('ajuste')}
              className={`py-2 rounded-lg text-sm font-semibold border transition ${tipo === 'ajuste' ? 'bg-[#19202d] text-white border-[#19202d]' : 'border-gray-200 text-gray-500'}`}>
              Ajuste (correção)
            </button>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">
              Quantidade {tipo === 'ajuste' ? '(use negativo pra reduzir)' : ''}
            </label>
            <input type="number" step="0.01" value={quantidade} onChange={e => setQuantidade(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36]" />
          </div>
          {tipo === 'entrada' && (
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Custo unitário dessa compra</label>
              <input type="number" step="0.01" value={custoUnitario} onChange={e => setCustoUnitario(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36]" />
            </div>
          )}
          <input type="text" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo (opcional)"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36]" />
          {erro && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 border border-gray-200 text-gray-500 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition">
              Cancelar
            </button>
            <button type="button" onClick={registrar} disabled={enviando}
              className="flex-1 bg-[#19202d] hover:bg-[#232d3f] text-white font-semibold py-2.5 rounded-lg text-sm transition disabled:opacity-40">
              {enviando ? 'Registrando...' : 'Registrar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function EstoquePage() {
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [caixas,  setCaixas]  = useState<CaixaPreset[]>([])
  const [loading, setLoading] = useState(true)
  const [erro,    setErro]    = useState('')
  const [okMsg,   setOkMsg]   = useState('')

  const [edits,    setEdits]    = useState<Record<number, { custo_unitario?: string; estoque_minimo?: string; ativo?: boolean }>>({})
  const [salvando, setSalvando] = useState(false)
  const [modalNovo,      setModalNovo]      = useState(false)
  const [modalMovimento, setModalMovimento] = useState<Insumo | null>(null)

  function recarregar() {
    return Promise.all([
      fetch('/api/estoque/insumos').then(r => r.json()),
      fetch('/api/estoque/caixas').then(r => r.json()),
    ]).then(([i, c]) => {
      if (i.error) { setErro(i.error); return }
      setInsumos(i)
      setCaixas(Array.isArray(c) ? c : [])
    }).catch(() => setErro('Erro ao carregar estoque.'))
  }

  useEffect(() => {
    recarregar().finally(() => setLoading(false))
  }, [])

  function setEdit(id: number, patch: { custo_unitario?: string; estoque_minimo?: string; ativo?: boolean }) {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))
    setOkMsg('')
  }

  const pendentes = Object.keys(edits).length

  async function salvar() {
    setSalvando(true); setErro(''); setOkMsg('')
    const body = Object.entries(edits).map(([id, e]) => {
      const item: { id: number; custo_unitario?: number; estoque_minimo?: number; ativo?: boolean } = { id: Number(id) }
      if (e.custo_unitario !== undefined) item.custo_unitario = parseFloat(e.custo_unitario) || 0
      if (e.estoque_minimo !== undefined) item.estoque_minimo = parseFloat(e.estoque_minimo) || 0
      if (e.ativo !== undefined) item.ativo = e.ativo
      return item
    })
    const res = await fetch('/api/estoque/insumos', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) { setEdits({}); setOkMsg('Alterações salvas.'); recarregar() }
    else { const d = await res.json(); setErro(d.error ?? 'Erro ao salvar.') }
    setSalvando(false)
  }

  const porTipo = useMemo(() => {
    const grupos = new Map<string, Insumo[]>()
    for (const i of insumos) grupos.set(i.tipo, [...(grupos.get(i.tipo) ?? []), i])
    return Array.from(grupos.entries())
  }, [insumos])

  if (loading) return <div className="p-8 text-sm text-gray-400">Carregando estoque...</div>

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto">
      {modalNovo && (
        <NovoInsumoModal onClose={() => setModalNovo(false)} onCriado={() => { setModalNovo(false); setOkMsg('Insumo criado.'); recarregar() }} />
      )}
      {modalMovimento && (
        <MovimentoModal insumo={modalMovimento} onClose={() => setModalMovimento(null)}
          onRegistrado={() => { setModalMovimento(null); setOkMsg('Movimento registrado.'); recarregar() }} />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#19202d]">Estoque de Insumos</h1>
          <p className="text-sm text-gray-400">Tubos, caixas e outros consumíveis — baixa automática na coleta e no envio</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setModalNovo(true)}
            className="border border-gray-200 text-gray-600 font-semibold px-4 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition">
            + Novo insumo
          </button>
          <button onClick={salvar} disabled={pendentes === 0 || salvando}
            className="bg-[#19202d] hover:bg-[#232d3f] text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition disabled:opacity-40">
            {salvando ? 'Salvando...' : pendentes > 0 ? `Salvar (${pendentes})` : 'Salvar'}
          </button>
        </div>
      </div>

      {erro  && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{erro}</p>}
      {okMsg && <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-4">{okMsg}</p>}

      {/* Insumos */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-x-auto mb-8">
        <table className="w-full text-sm min-w-[820px]">
          <thead>
            <tr className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wide border-b border-gray-100">
              <th className="px-4 py-3">Tipo</th>
              <th className="px-2 py-3">Nome</th>
              <th className="px-2 py-3">Unid.</th>
              <th className="px-2 py-3 text-right">Custo unit.</th>
              <th className="px-2 py-3 text-right">Estoque</th>
              <th className="px-2 py-3 text-right">Mínimo</th>
              <th className="px-2 py-3 text-center">Ativo</th>
              <th className="px-4 py-3">Movimento</th>
            </tr>
          </thead>
          <tbody>
            {porTipo.map(([tipo, itens]) => (
              <Fragment key={tipo}>
                <tr className="bg-gray-50/60">
                  <td colSpan={8} className="px-4 py-1.5 text-[10px] font-bold text-[#8a6e36] uppercase tracking-wide">
                    {TIPO_LABEL[tipo] ?? tipo}
                  </td>
                </tr>
                {itens.map(i => {
                  const ed = edits[i.id]
                  const custo   = ed?.custo_unitario   ?? String(i.custo_unitario)
                  const minimo  = ed?.estoque_minimo   ?? String(i.estoque_minimo)
                  const ativo   = ed?.ativo             ?? i.ativo
                  const baixo   = i.estoque_atual < i.estoque_minimo
                  return (
                    <tr key={i.id} className={`border-b border-gray-50 hover:bg-gray-50/60 ${!ativo ? 'opacity-45' : ''}`}>
                      <td className="px-4 py-2 text-xs text-gray-400">{TIPO_LABEL[i.tipo] ?? i.tipo}</td>
                      <td className="px-2 py-2">
                        <p className="font-medium text-[#19202d] leading-tight">{i.nome}</p>
                        {i.cor_tubo && <p className="text-[11px] text-gray-400 leading-tight">cor: {i.cor_tubo}</p>}
                      </td>
                      <td className="px-2 py-2 text-xs text-gray-500">{i.unidade}</td>
                      <td className="px-2 py-2 text-right">
                        <input type="number" step="0.01" value={custo}
                          onChange={e => setEdit(i.id, { custo_unitario: e.target.value })}
                          className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-right focus:outline-none focus:ring-2 focus:ring-[#8a6e36]" />
                      </td>
                      <td className={`px-2 py-2 text-right text-sm font-semibold ${baixo ? 'text-red-600' : 'text-[#19202d]'}`}>
                        {i.estoque_atual} {baixo && <span title="Abaixo do mínimo">⚠</span>}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <input type="number" step="0.01" value={minimo}
                          onChange={e => setEdit(i.id, { estoque_minimo: e.target.value })}
                          className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-right focus:outline-none focus:ring-2 focus:ring-[#8a6e36]" />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <input type="checkbox" checked={ativo} onChange={e => setEdit(i.id, { ativo: e.target.checked })} className="rounded border-gray-300" />
                      </td>
                      <td className="px-4 py-2">
                        <button onClick={() => setModalMovimento(i)}
                          className="text-xs font-semibold text-[#8a6e36] hover:text-[#6f5729] transition">
                          + Registrar
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </Fragment>
            ))}
            {insumos.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-400">Nenhum insumo cadastrado ainda.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Presets de caixa */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Presets de caixa (frete)</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {caixas.map(c => (
            <div key={c.id} className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-4 ${!c.ativo ? 'opacity-45' : ''}`}>
              <p className="font-bold text-[#19202d]">{c.nome}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {c.altura_cm}×{c.largura_cm}×{c.comprimento_cm}cm · {c.peso_kg}kg
              </p>
              <p className="text-[11px] text-gray-400 mt-1">
                {(c.kit_json ?? []).length > 0
                  ? `${(c.kit_json ?? []).length} insumo(s) no kit`
                  : 'kit vazio — nenhuma baixa de insumo ao usar essa caixa'}
              </p>
            </div>
          ))}
          {caixas.length === 0 && <p className="text-sm text-gray-400">Nenhum preset de caixa cadastrado.</p>}
        </div>
        <p className="text-[11px] text-gray-400 mt-2">
          Edição de dimensões e kit ainda é só via banco/API — a Fase 4 usa sempre o primeiro preset ativo.
        </p>
      </div>
    </div>
  )
}
