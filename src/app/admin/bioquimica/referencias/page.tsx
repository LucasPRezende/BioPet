'use client'

import { useState, useEffect, useCallback } from 'react'
import { ESPECIES_REF as ESPECIES } from '@/lib/especies'

interface Exame { id: number; nome: string; codigo: string }
interface Referencia {
  id:           number
  exame_id:     number
  codigo:       string
  nome:         string
  faixa_etaria: string
  metodo:       string
  valor_min:    number | null
  valor_max:    number | null
  unidade:      string | null
  observacao:   string | null
}

const FAIXAS: { label: string; value: string }[] = [
  { label: 'Todos',   value: 'todos' },
  { label: 'Filhote', value: 'filhote' },
  { label: 'Adulto',  value: 'adulto' },
  { label: 'Idoso',   value: 'idoso' },
]

const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36] bg-white'

export default function ReferenciasPage() {
  const [especie,     setEspecie]     = useState('cao')
  const [faixa,       setFaixa]       = useState('adulto')
  const [refs,        setRefs]        = useState<Referencia[]>([])
  const [exames,      setExames]      = useState<Exame[]>([])
  const [loading,     setLoading]     = useState(false)
  const [saving,      setSaving]      = useState<number | null>(null)
  const [saved,       setSaved]       = useState<number | null>(null)
  const [editRow,     setEditRow]     = useState<Record<number, Partial<Referencia>>>({})
  const [novaModal,   setNovaModal]   = useState(false)
  const [novaForm,    setNovaForm]    = useState({ bioquimica_exame_id: '', faixa_etaria: faixa, metodo: '', valor_min: '', valor_max: '', unidade: '', observacao: '' })
  const [novaErr,     setNovaErr]     = useState('')
  const [novaSaving,  setNovaSaving]  = useState(false)
  const [confirmDel,  setConfirmDel]  = useState<number | null>(null)
  const [deleting,    setDeleting]    = useState(false)
  const [editingFallback, setEditingFallback] = useState<Set<number>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    const [refsRes, examesRes] = await Promise.all([
      fetch(`/api/bioquimica/referencia?especie=${especie}&faixa_etaria=${faixa}`),
      fetch('/api/bioquimica/exames'),
    ])
    if (refsRes.ok) {
      const d = await refsRes.json()
      setRefs(d.referencias ?? [])
    }
    if (examesRes.ok) setExames(await examesRes.json())
    setEditRow({})
    setEditingFallback(new Set())
    setLoading(false)
  }, [especie, faixa])

  useEffect(() => { load() }, [load])

  function edit(ref: Referencia, field: keyof Referencia, value: string) {
    setEditRow(prev => ({
      ...prev,
      [ref.id]: { ...(prev[ref.id] ?? {}), [field]: value === '' ? null : value },
    }))
  }

  function getVal(ref: Referencia, field: keyof Referencia): string {
    const overridden = editRow[ref.id]
    if (overridden && field in overridden) {
      const v = overridden[field]
      return v === null || v === undefined ? '' : String(v)
    }
    const v = ref[field]
    return v === null || v === undefined ? '' : String(v)
  }

  async function salvar(ref: Referencia) {
    const changes = editRow[ref.id]
    if (!changes) return
    setSaving(ref.id)

    const isFallback = ref.faixa_etaria === 'todos' && faixa !== 'todos'

    let ok = false
    if (isFallback) {
      // Cria registro específico para a faixa atual em vez de alterar o 'todos'
      const res = await fetch('/api/bioquimica/referencia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bioquimica_exame_id: ref.exame_id,
          especie,
          faixa_etaria: faixa,
          metodo:     changes.metodo    !== undefined ? changes.metodo    : ref.metodo,
          valor_min:  changes.valor_min !== undefined ? (changes.valor_min === null ? null : Number(changes.valor_min)) : ref.valor_min,
          valor_max:  changes.valor_max !== undefined ? (changes.valor_max === null ? null : Number(changes.valor_max)) : ref.valor_max,
          unidade:    changes.unidade   !== undefined ? changes.unidade   : ref.unidade,
          observacao: changes.observacao !== undefined ? changes.observacao : ref.observacao,
        }),
      })
      ok = res.ok
    } else {
      const res = await fetch(`/api/bioquimica/referencia/${ref.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metodo:     changes.metodo     !== undefined ? changes.metodo     : ref.metodo,
          valor_min:  changes.valor_min  !== undefined ? (changes.valor_min  === null ? null : Number(changes.valor_min))  : ref.valor_min,
          valor_max:  changes.valor_max  !== undefined ? (changes.valor_max  === null ? null : Number(changes.valor_max))  : ref.valor_max,
          unidade:    changes.unidade    !== undefined ? changes.unidade    : ref.unidade,
          observacao: changes.observacao !== undefined ? changes.observacao : ref.observacao,
        }),
      })
      ok = res.ok
    }

    if (ok) {
      setSaved(ref.id)
      setTimeout(() => setSaved(null), 2000)
      setEditRow(prev => { const n = { ...prev }; delete n[ref.id]; return n })
      await load()
    }
    setSaving(null)
  }

  async function deletarReferencia(id: number) {
    setDeleting(true)
    await fetch(`/api/bioquimica/referencia/${id}`, { method: 'DELETE' })
    setConfirmDel(null)
    setDeleting(false)
    await load()
  }

  async function criarReferencia(e: React.FormEvent) {
    e.preventDefault()
    setNovaErr('')
    if (!novaForm.bioquimica_exame_id) { setNovaErr('Selecione o exame.'); return }
    setNovaSaving(true)
    const res = await fetch('/api/bioquimica/referencia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bioquimica_exame_id: Number(novaForm.bioquimica_exame_id),
        especie,
        faixa_etaria: novaForm.faixa_etaria,
        metodo:     novaForm.metodo     || '',
        valor_min:  novaForm.valor_min  ? Number(novaForm.valor_min)  : null,
        valor_max:  novaForm.valor_max  ? Number(novaForm.valor_max)  : null,
        unidade:    novaForm.unidade    || null,
        observacao: novaForm.observacao || null,
      }),
    })
    if (res.ok) {
      setNovaModal(false)
      setNovaForm({ bioquimica_exame_id: '', faixa_etaria: faixa, metodo: '', valor_min: '', valor_max: '', unidade: '', observacao: '' })
      await load()
    } else {
      const d = await res.json()
      setNovaErr(d.error ?? 'Erro ao criar.')
    }
    setNovaSaving(false)
  }

  // Exames que ainda não têm referência para espécie+faixa selecionados
  const examesComRef = new Set(refs.map(r => r.exame_id))
  const examesSemRef = exames.filter(e => !examesComRef.has(e.id))

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#19202d]">Valores de Referência — Bioquímica</h1>
          <p className="text-sm text-gray-400 mt-0.5">Revise e ajuste os valores com Andreza/Luciana conforme protocolo clínico.</p>
        </div>
        <button
          onClick={() => { setNovaForm(f => ({ ...f, faixa_etaria: faixa })); setNovaErr(''); setNovaModal(true) }}
          className="bg-[#c4a35a] hover:bg-[#a88a47] text-white font-bold px-4 py-2.5 rounded-lg text-sm transition"
        >
          + Nova referência
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden mb-5">
        <div className="h-1 bg-gold-stripe" />
        <div className="p-4 flex flex-col gap-4">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase mb-1.5">Espécie</p>
            <div className="flex gap-1.5">
              {ESPECIES.map(e => (
                <button key={e.value}
                  onClick={() => setEspecie(e.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition ${especie === e.value ? 'bg-[#19202d] text-white border-[#19202d]' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}>
                  {e.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase mb-1.5">Faixa etária</p>
            <div className="flex gap-1.5">
              {FAIXAS.map(f => (
                <button key={f.value}
                  onClick={() => setFaixa(f.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition ${faixa === f.value ? 'bg-[#19202d] text-white border-[#19202d]' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Carregando...</div>
      ) : (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="h-1 bg-gold-stripe" />

          {examesSemRef.length > 0 && (
            <div className="px-5 py-4 bg-amber-50 border-b border-amber-100">
              <p className="text-xs font-semibold text-amber-700 mb-2">Adicionar referência rápida:</p>
              <div className="flex flex-wrap gap-2">
                {examesSemRef.map(e => (
                  <button
                    key={e.id}
                    onClick={() => {
                      setNovaForm(f => ({ ...f, bioquimica_exame_id: String(e.id), faixa_etaria: faixa }))
                      setNovaErr('')
                      setNovaModal(true)
                    }}
                    className="text-xs font-mono font-semibold px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-700 hover:bg-amber-100 hover:border-amber-400 transition"
                  >
                    + {e.codigo}
                  </button>
                ))}
              </div>
            </div>
          )}

          {refs.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-3xl mb-2">📊</p>
              <p className="text-sm">Nenhuma referência cadastrada para {ESPECIES.find(e => e.value === especie)?.label} / {FAIXAS.find(f => f.value === faixa)?.label}.</p>
            </div>
          ) : (
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {refs.map(ref => {
                const dirty         = !!editRow[ref.id]
                const isSaving      = saving === ref.id
                const isSaved       = saved  === ref.id
                const isFallback    = ref.faixa_etaria === 'todos' && faixa !== 'todos'
                const isOverriding  = isFallback && editingFallback.has(ref.id)
                const inputDisabled = isFallback && !isOverriding
                const faixaLabel    = FAIXAS.find(f => f.value === faixa)?.label ?? faixa
                return (
                  <div
                    key={ref.id}
                    className={`rounded-xl border p-4 flex flex-col gap-3 transition ${
                      isFallback
                        ? 'border-blue-100 bg-blue-50/40'
                        : dirty
                          ? 'border-amber-300 bg-amber-50/40'
                          : 'border-gray-200 bg-white'
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-[#19202d] text-sm leading-snug">{ref.nome}</p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-500">{ref.codigo}</span>
                          {isFallback
                            ? <span className="text-xs bg-blue-50 text-blue-500 border border-blue-200 px-2 py-0.5 rounded font-medium">Herda de Todos</span>
                            : <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded capitalize">{ref.faixa_etaria}</span>
                          }
                        </div>
                      </div>
                      {!isFallback && (
                        <button
                          onClick={() => setConfirmDel(ref.id)}
                          className="text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg p-1.5 transition flex-shrink-0"
                          title="Excluir referência"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        </button>
                      )}
                    </div>

                    {/* Método */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Método</label>
                      <input
                        type="text"
                        value={getVal(ref, 'metodo')}
                        onChange={e => edit(ref, 'metodo', e.target.value)}
                        disabled={inputDisabled}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36] bg-white disabled:bg-gray-50 disabled:text-gray-400"
                        placeholder="Ex: Cinético (IFCC)"
                      />
                    </div>

                    {/* Mín / Máx / Unidade */}
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Mín</label>
                        <input
                          type="number"
                          step="0.001"
                          value={getVal(ref, 'valor_min')}
                          onChange={e => edit(ref, 'valor_min', e.target.value)}
                          disabled={inputDisabled}
                          className={`w-full border rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#8a6e36] disabled:bg-gray-50 disabled:text-gray-400 ${
                            getVal(ref, 'valor_min') === '' && !isFallback ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'
                          }`}
                          placeholder="—"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Máx</label>
                        <input
                          type="number"
                          step="0.001"
                          value={getVal(ref, 'valor_max')}
                          onChange={e => edit(ref, 'valor_max', e.target.value)}
                          disabled={inputDisabled}
                          className={`w-full border rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#8a6e36] disabled:bg-gray-50 disabled:text-gray-400 ${
                            getVal(ref, 'valor_max') === '' && !isFallback ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'
                          }`}
                          placeholder="—"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Unidade</label>
                        <input
                          type="text"
                          value={getVal(ref, 'unidade')}
                          onChange={e => edit(ref, 'unidade', e.target.value)}
                          disabled={inputDisabled}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36] bg-white disabled:bg-gray-50 disabled:text-gray-400"
                          placeholder="U/L"
                        />
                      </div>
                    </div>

                    {/* Observação */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Observação</label>
                      <input
                        type="text"
                        value={getVal(ref, 'observacao')}
                        onChange={e => edit(ref, 'observacao', e.target.value)}
                        disabled={inputDisabled}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36] bg-white disabled:bg-gray-50 disabled:text-gray-400"
                        placeholder="Opcional"
                      />
                    </div>

                    {/* Footer */}
                    <div className="pt-1">
                      {isFallback && !isOverriding ? (
                        <button
                          onClick={() => {
                            setEditingFallback(prev => new Set(prev).add(ref.id))
                            setEditRow(prev => ({
                              ...prev,
                              [ref.id]: {
                                metodo:     ref.metodo,
                                valor_min:  ref.valor_min,
                                valor_max:  ref.valor_max,
                                unidade:    ref.unidade,
                                observacao: ref.observacao,
                              },
                            }))
                          }}
                          className="w-full text-sm font-semibold px-4 py-2 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition"
                        >
                          Definir valores específicos para {faixaLabel}
                        </button>
                      ) : (
                        <button
                          onClick={() => salvar(ref)}
                          disabled={!dirty || isSaving}
                          className={`w-full text-sm font-semibold px-4 py-2 rounded-lg transition ${
                            isSaved ? 'bg-green-100 text-green-700 border border-green-200'
                            : dirty  ? 'bg-[#19202d] text-white hover:bg-[#232d3f]'
                            : 'bg-gray-100 text-gray-400 cursor-default'
                          }`}
                        >
                          {isSaving ? 'Salvando...' : isSaved ? '✓ Salvo' : isOverriding ? `Criar para ${faixaLabel}` : 'Salvar alterações'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal nova referência */}
      {novaModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-[#19202d] px-6 py-4 flex items-center justify-between">
              <h3 className="text-white font-bold text-sm">Nova Referência — {ESPECIES.find(e => e.value === especie)?.label}</h3>
              <button onClick={() => setNovaModal(false)} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
            </div>
            <form onSubmit={criarReferencia} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Exame *</label>
                <select value={novaForm.bioquimica_exame_id} onChange={e => setNovaForm(f => ({ ...f, bioquimica_exame_id: e.target.value }))} className={INPUT} required>
                  <option value="">Selecione...</option>
                  {exames.map(e => <option key={e.id} value={e.id}>{e.nome} ({e.codigo})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Faixa etária *</label>
                <select value={novaForm.faixa_etaria} onChange={e => setNovaForm(f => ({ ...f, faixa_etaria: e.target.value }))} className={INPUT}>
                  {FAIXAS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Método</label>
                <input type="text" value={novaForm.metodo} onChange={e => setNovaForm(f => ({ ...f, metodo: e.target.value }))} className={INPUT} placeholder="Ex: Cinético (IFCC)" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Mín</label>
                  <input type="number" step="0.001" value={novaForm.valor_min} onChange={e => setNovaForm(f => ({ ...f, valor_min: e.target.value }))} className={INPUT} placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Máx</label>
                  <input type="number" step="0.001" value={novaForm.valor_max} onChange={e => setNovaForm(f => ({ ...f, valor_max: e.target.value }))} className={INPUT} placeholder="0.00" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Unidade</label>
                <input type="text" value={novaForm.unidade} onChange={e => setNovaForm(f => ({ ...f, unidade: e.target.value }))} className={INPUT} placeholder="Ex: U/L" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Observação</label>
                <input type="text" value={novaForm.observacao} onChange={e => setNovaForm(f => ({ ...f, observacao: e.target.value }))} className={INPUT} placeholder="Opcional" />
              </div>
              {novaErr && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{novaErr}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setNovaModal(false)} className="flex-1 border border-gray-200 text-gray-500 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition">Cancelar</button>
                <button type="submit" disabled={novaSaving} className="flex-1 bg-[#19202d] hover:bg-[#232d3f] text-white font-semibold py-2.5 rounded-lg text-sm transition disabled:opacity-60">
                  {novaSaving ? 'Salvando...' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de confirmação de exclusão */}
      {confirmDel !== null && (() => {
        const ref = refs.find(r => r.id === confirmDel)
        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
              <div className="bg-red-600 px-6 py-4">
                <h3 className="text-white font-bold text-sm">Excluir referência</h3>
              </div>
              <div className="p-6">
                <p className="text-sm text-[#19202d] mb-1">
                  Tem certeza que deseja excluir a referência de <span className="font-semibold">{ref?.nome}</span>?
                </p>
                {ref && (
                  <p className="text-xs text-gray-400 mt-1">
                    {ref.metodo && <span className="mr-2">Método: {ref.metodo}</span>}
                    {ref.faixa_etaria !== 'todos' && <span>Faixa: {ref.faixa_etaria}</span>}
                  </p>
                )}
                <p className="text-xs text-red-500 mt-3">Esta ação não pode ser desfeita.</p>
                <div className="flex gap-3 mt-5">
                  <button
                    onClick={() => setConfirmDel(null)}
                    disabled={deleting}
                    className="flex-1 border border-gray-200 text-gray-500 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => deletarReferencia(confirmDel)}
                    disabled={deleting}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-lg text-sm transition disabled:opacity-60"
                  >
                    {deleting ? 'Excluindo...' : 'Sim, excluir'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
