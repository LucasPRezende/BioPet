'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface RevisaoConfig {
  id: number
  tipo_exame: string
  permite_revisao: boolean
  prazo_dias: number
  max_revisoes: number
  valor_horario_comercial: number
  valor_fora_comercial: number
  gera_laudo: boolean
  valor_laudo_extra: number
}

interface ExamePreco {
  id: number
  tipo_exame: string
}

interface Revisao {
  id: number
  tipo_exame: string
  data_hora: string
  status: string
  valor: number | null
  status_pagamento: string | null
  laudo_revisao_solicitado: boolean
  agendamento_original_id: number | null
  tutores: { nome: string; telefone: string } | null
  pets: { nome: string; especie: string } | null
  original: { id: number; data_hora: string; tipo_exame: string } | null
}

function fmtDT(s: string) {
  return new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const STATUS_LABEL: Record<string, string> = {
  pendente:        'Pendente',
  agendado:        'Agendado',
  'em atendimento': 'Em atendimento',
  'concluído':     'Concluído',
  cancelado:       'Cancelado',
}

const STATUS_COLOR: Record<string, string> = {
  pendente:        'bg-yellow-50 text-yellow-700',
  agendado:        'bg-blue-50 text-blue-700',
  'em atendimento': 'bg-purple-50 text-purple-700',
  'concluído':     'bg-green-50 text-green-700',
  cancelado:       'bg-red-50 text-red-700',
}

export default function RevisoesPage() {
  const router = useRouter()
  const [revisoes,  setRevisoes]  = useState<Revisao[]>([])
  const [configs,   setConfigs]   = useState<RevisaoConfig[]>([])
  const [loading,   setLoading]   = useState(true)
  const [statusFil, setStatusFil] = useState('')
  const [tab,       setTab]       = useState<'lista' | 'config'>('lista')
  const [savingCfg,      setSavingCfg]      = useState<number | null>(null)
  const [showImport,     setShowImport]     = useState(false)
  const [examesPrecos,   setExamesPrecos]   = useState<ExamePreco[]>([])
  const [selectedTipos,  setSelectedTipos]  = useState<Set<string>>(new Set())
  const [importing,      setImporting]      = useState(false)

  const loadRevisoes = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (statusFil) params.set('status', statusFil)
    const res = await fetch(`/api/revisoes?${params}`)
    if (res.status === 401) { router.push('/login'); return }
    if (res.ok) setRevisoes(await res.json())
    setLoading(false)
  }, [statusFil, router])

  useEffect(() => { loadRevisoes() }, [loadRevisoes])

  useEffect(() => {
    fetch('/api/revisoes/config')
      .then(r => r.ok ? r.json() : [])
      .then(setConfigs)
  }, [])

  async function saveConfig(cfg: RevisaoConfig) {
    setSavingCfg(cfg.id)
    await fetch('/api/revisoes/config', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(cfg),
    })
    setSavingCfg(null)
  }

  function updateConfig(id: number, field: string, value: unknown) {
    setConfigs(cs => cs.map(c => c.id === id ? { ...c, [field]: value } : c))
  }

  async function openImportModal() {
    const res = await fetch('/api/comissoes')
    if (res.ok) {
      const data: ExamePreco[] = await res.json()
      setExamesPrecos(data)
      const jaImportados = new Set(configs.map(c => c.tipo_exame))
      const novos = data.filter(e => !jaImportados.has(e.tipo_exame)).map(e => e.tipo_exame)
      setSelectedTipos(new Set(novos))
    }
    setShowImport(true)
  }

  function toggleTipo(tipo: string) {
    setSelectedTipos(prev => {
      const next = new Set(prev)
      next.has(tipo) ? next.delete(tipo) : next.add(tipo)
      return next
    })
  }

  async function importarExames() {
    if (selectedTipos.size === 0) return
    setImporting(true)
    const res = await fetch('/api/revisoes/config', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ tipos: Array.from(selectedTipos) }),
    })
    if (res.ok) {
      const updated = await fetch('/api/revisoes/config').then(r => r.ok ? r.json() : [])
      setConfigs(updated)
      setShowImport(false)
    }
    setImporting(false)
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#19202d]">Revisões</h1>
          <p className="text-xs text-gray-400 mt-0.5">Revisões de exames dentro do prazo</p>
        </div>
        <button onClick={() => router.push('/admin/revisoes/nova')}
          className="bg-[#19202d] hover:bg-[#232d3f] text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition">
          + Nova revisão
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-gray-100 p-1 rounded-lg w-fit">
        {(['lista', 'config'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${tab === t ? 'bg-white text-[#19202d] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t === 'lista' ? 'Revisões' : 'Configurações'}
          </button>
        ))}
      </div>

      {/* Lista */}
      {tab === 'lista' && (
        <>
          <div className="flex gap-2 mb-4">
            <select value={statusFil} onChange={e => setStatusFil(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36]">
              <option value="">Todos os status</option>
              {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>

          {loading ? (
            <div className="text-center py-16 text-gray-400">Carregando...</div>
          ) : revisoes.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl shadow-sm border">
              <div className="text-5xl mb-4">🔄</div>
              <p className="text-gray-500">Nenhuma revisão encontrada.</p>
              <button onClick={() => router.push('/admin/revisoes/nova')}
                className="mt-3 text-sm text-[#8a6e36] hover:underline">Criar primeira revisão</button>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <div className="h-1 bg-gold-stripe" />
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      {['Pet / Tutor', 'Exame', 'Original', 'Revisão', 'Laudo', 'Valor', 'Status', 'Situação'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-bold text-[#19202d] uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {revisoes.map(r => (
                      <tr key={r.id} className="hover:bg-amber-50/20 transition">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-[#19202d] text-sm">{r.pets?.nome ?? '—'}</p>
                          <p className="text-xs text-gray-400">{r.tutores?.nome}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">{r.tipo_exame}</td>
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {r.original ? fmtDT(r.original.data_hora) : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-700 whitespace-nowrap font-medium">{fmtDT(r.data_hora)}</td>
                        <td className="px-4 py-3 text-center">
                          {r.laudo_revisao_solicitado
                            ? <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">Sim</span>
                            : <span className="text-xs text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold">
                          {r.valor ? `R$ ${Number(r.valor).toFixed(2).replace('.',',')}` : <span className="text-green-600 text-xs">Gratuito</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${STATUS_COLOR[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
                            {STATUS_LABEL[r.status] ?? r.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {(() => {
                            if (!r.original) return <span className="text-xs text-gray-300">—</span>
                            const prazoLimite = new Date(new Date(r.original.data_hora).getTime() + 30 * 86400000)
                            const expirado    = new Date() > prazoLimite
                            return expirado
                              ? <span className="text-xs text-red-500 font-medium">Prazo expirado</span>
                              : <span className="text-xs text-green-600 font-medium">No prazo</span>
                          })()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Configurações */}
      {tab === 'config' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={openImportModal}
              className="flex items-center gap-1.5 text-sm bg-white border border-gray-200 hover:border-[#8a6e36] hover:text-[#8a6e36] text-gray-600 px-3 py-2 rounded-lg transition font-medium shadow-sm">
              <span className="text-base leading-none">↓</span>
              Importar exames de Preços
            </button>
          </div>
          {configs.length === 0 && (
            <div className="text-center py-16 bg-white rounded-xl shadow-sm border text-gray-400">
              Nenhum tipo de exame configurado ainda. Use o botão acima para importar.
            </div>
          )}
          {configs.map(cfg => (
            <div key={cfg.id} className="bg-white rounded-xl border shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h3 className="font-bold text-[#19202d]">{cfg.tipo_exame}</h3>
                  <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                    <input type="checkbox" checked={cfg.permite_revisao}
                      onChange={e => updateConfig(cfg.id, 'permite_revisao', e.target.checked)}
                      className="accent-[#8a6e36]" />
                    Permite revisão
                  </label>
                </div>
                <button onClick={() => saveConfig(cfg)} disabled={savingCfg === cfg.id}
                  className="text-xs bg-[#19202d] hover:bg-[#232d3f] text-white px-3 py-1.5 rounded-lg transition disabled:opacity-60">
                  {savingCfg === cfg.id ? 'Salvando...' : 'Salvar'}
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Prazo (dias)</label>
                  <input type="number" min={1} value={cfg.prazo_dias}
                    onChange={e => updateConfig(cfg.id, 'prazo_dias', Number(e.target.value))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36]" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Máx. revisões por exame</label>
                  <input type="number" min={1} max={10} value={cfg.max_revisoes}
                    onChange={e => updateConfig(cfg.id, 'max_revisoes', Number(e.target.value))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36]" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Valor comercial (R$)</label>
                  <input type="number" min={0} step={0.01} value={cfg.valor_horario_comercial}
                    onChange={e => updateConfig(cfg.id, 'valor_horario_comercial', Number(e.target.value))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36]" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Valor fora comercial (R$)</label>
                  <input type="number" min={0} step={0.01} value={cfg.valor_fora_comercial}
                    onChange={e => updateConfig(cfg.id, 'valor_fora_comercial', Number(e.target.value))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36]" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                    {cfg.gera_laudo ? 'Inclui laudo' : 'Valor laudo extra (R$)'}
                  </label>
                  {cfg.gera_laudo ? (
                    <p className="text-sm text-green-600 font-medium mt-1.5">Laudo incluído</p>
                  ) : (
                    <input type="number" min={0} step={0.01} value={cfg.valor_laudo_extra}
                      onChange={e => updateConfig(cfg.id, 'valor_laudo_extra', Number(e.target.value))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36]" />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {/* Modal importar exames de preços */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="font-bold text-[#19202d]">Importar exames de Preços</h2>
              <button onClick={() => setShowImport(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>

            <div className="px-6 py-3 overflow-y-auto flex-1">
              {examesPrecos.length === 0 ? (
                <p className="text-gray-400 text-sm py-4 text-center">Nenhum exame encontrado em Preços.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {examesPrecos.map(e => {
                    const jaExiste = configs.some(c => c.tipo_exame === e.tipo_exame)
                    return (
                      <li key={e.id} className="flex items-center gap-3 py-2.5">
                        <input
                          type="checkbox"
                          id={`imp-${e.id}`}
                          checked={jaExiste || selectedTipos.has(e.tipo_exame)}
                          disabled={jaExiste}
                          onChange={() => !jaExiste && toggleTipo(e.tipo_exame)}
                          className="accent-[#8a6e36] w-4 h-4 flex-shrink-0"
                        />
                        <label htmlFor={`imp-${e.id}`}
                          className={`text-sm flex-1 ${jaExiste ? 'text-gray-400 cursor-not-allowed' : 'text-[#19202d] cursor-pointer'}`}>
                          {e.tipo_exame}
                          {jaExiste && <span className="ml-2 text-xs text-green-600">(já importado)</span>}
                        </label>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <div className="px-6 py-4 border-t flex items-center justify-between gap-3">
              <p className="text-xs text-gray-400">
                {selectedTipos.size} selecionado{selectedTipos.size !== 1 ? 's' : ''}
              </p>
              <div className="flex gap-2">
                <button onClick={() => setShowImport(false)}
                  className="text-sm px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition">
                  Cancelar
                </button>
                <button onClick={importarExames} disabled={importing || selectedTipos.size === 0}
                  className="text-sm px-4 py-2 rounded-lg bg-[#19202d] hover:bg-[#232d3f] text-white font-semibold transition disabled:opacity-50">
                  {importing ? 'Importando...' : 'Importar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
