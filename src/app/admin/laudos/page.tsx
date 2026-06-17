'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface Laudo {
  id: number
  pet_id: number | null
  nome_pet: string
  especie: string
  tutor: string
  telefone: string
  token: string
  tipo: string
  tipo_exame: string | null
  criado_em: string
  agendamento_id: number | null
  agendamento_dispensado: boolean
  veterinarios: { nome: string } | null
  system_users: { nome: string } | null
}

interface Vet { id: number; nome: string }

type WaStatus = 'idle' | 'sending' | 'sent' | 'error'
type Destino  = 'tutor' | 'vet' | 'ambos'

export default function LaudosPage() {
  const [laudos,   setLaudos]   = useState<Laudo[]>([])
  const [vets,     setVets]     = useState<Vet[]>([])
  const [loading,  setLoading]  = useState(true)
  const [isAdmin,  setIsAdmin]  = useState(false)
  const [copied,   setCopied]   = useState<number | null>(null)
  const [waStatus, setWaStatus] = useState<Record<number, WaStatus>>({})
  const [waModal,      setWaModal]      = useState<Laudo | null>(null)
  const [dispensando,  setDispensando]  = useState<number | null>(null)
  const [dispensados,  setDispensados]  = useState<Set<number>>(new Set())

  // Filtros
  const [busca,   setBusca]   = useState('')
  const [tipo,    setTipo]    = useState('')
  const [vetId,   setVetId]   = useState('')
  const [dataIni, setDataIni] = useState('')
  const [dataFim, setDataFim] = useState('')

  const router = useRouter()

  const load = useCallback(async (filters?: {
    busca?: string; tipo?: string; vetId?: string; dataIni?: string; dataFim?: string
  }) => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filters?.busca)   params.set('busca',    filters.busca)
    if (filters?.tipo)    params.set('tipo',     filters.tipo)
    if (filters?.vetId)   params.set('vet_id',   filters.vetId)
    if (filters?.dataIni) params.set('data_ini', filters.dataIni)
    if (filters?.dataFim) params.set('data_fim', filters.dataFim)

    const [meRes, laudosRes, vetsRes] = await Promise.all([
      fetch('/api/auth/me'),
      fetch(`/api/laudos?${params.toString()}`),
      fetch('/api/veterinarios'),
    ])
    if (laudosRes.status === 401) { router.push('/login'); return }
    if (meRes.ok)     setIsAdmin((await meRes.json()).role === 'admin')
    if (laudosRes.ok) setLaudos(await laudosRes.json())
    if (vetsRes.ok)   setVets(await vetsRes.json())
    setLoading(false)
  }, [router])

  useEffect(() => { load() }, [load])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    load({ busca, tipo, vetId, dataIni, dataFim })
  }

  function handleClear() {
    setBusca(''); setTipo(''); setVetId(''); setDataIni(''); setDataFim('')
    load()
  }

  function copyLink(laudo: Laudo) {
    navigator.clipboard.writeText(`${window.location.origin}/laudo/${laudo.token}`)
    setCopied(laudo.id)
    setTimeout(() => setCopied(null), 2500)
  }

  async function dispensarLaudo(laudo: Laudo) {
    setDispensando(laudo.id)
    try {
      const res = await fetch(`/api/laudos/${laudo.id}/dispensar`, { method: 'PATCH' })
      if (res.ok) setDispensados(s => new Set(s).add(laudo.id))
    } finally {
      setDispensando(null)
    }
  }

  // ── Vincular laudo a um agendamento ───────────────────────────────────────────
  const [vincModal,    setVincModal]    = useState<Laudo | null>(null)
  const [candidatos,   setCandidatos]   = useState<{ id: number; tipo_exame: string; data_hora: string; status: string; tem_laudo: boolean; match_tipo: boolean; score: number }[]>([])
  const [sugeridoId,   setSugeridoId]   = useState<number | null>(null)
  const [loadingCand,  setLoadingCand]  = useState(false)
  const [vinculandoId, setVinculandoId] = useState<number | null>(null)

  async function abrirVincular(laudo: Laudo) {
    setVincModal(laudo)
    setCandidatos([])
    setSugeridoId(null)
    setLoadingCand(true)
    try {
      const res = await fetch(`/api/laudos/${laudo.id}/vincular`)
      if (res.ok) {
        const d = await res.json()
        setCandidatos(d.candidatos ?? [])
        setSugeridoId(d.sugerido_id ?? null)
      }
    } finally {
      setLoadingCand(false)
    }
  }

  async function vincular(agendamentoId: number) {
    if (!vincModal) return
    setVinculandoId(agendamentoId)
    try {
      const res = await fetch(`/api/laudos/${vincModal.id}/vincular`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agendamento_id: agendamentoId }),
      })
      if (res.ok) {
        setLaudos(prev => prev.map(l => l.id === vincModal.id ? { ...l, agendamento_id: agendamentoId } : l))
        setVincModal(null)
      } else {
        alert((await res.json()).error ?? 'Erro ao vincular.')
      }
    } finally {
      setVinculandoId(null)
    }
  }

  async function sendWhatsApp(laudo: Laudo, destino: Destino) {
    setWaModal(null)
    setWaStatus(s => ({ ...s, [laudo.id]: 'sending' }))
    try {
      const res = await fetch(`/api/laudos/${laudo.id}/whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destino }),
      })
      setWaStatus(s => ({ ...s, [laudo.id]: res.ok ? 'sent' : 'error' }))
    } catch {
      setWaStatus(s => ({ ...s, [laudo.id]: 'error' }))
    }
    setTimeout(() => setWaStatus(s => ({ ...s, [laudo.id]: 'idle' })), 3000)
  }

  function fmt(d: string) {
    return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-[#19202d]">
          {isAdmin ? 'Todos os Laudos' : 'Meus Laudos'}
          {!loading && <span className="ml-2 text-sm font-normal text-gray-400">({laudos.length})</span>}
        </h1>
      </div>

      {/* Filtros */}
      <form onSubmit={handleSearch} className="bg-white rounded-xl border shadow-sm p-4 mb-5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            type="text"
            placeholder="Buscar por pet, tutor ou telefone..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36] sm:col-span-1"
          />
          <select
            value={tipo}
            onChange={e => setTipo(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36] text-gray-600"
          >
            <option value="">Todos os tipos</option>
            <option value="gerado">Gerado</option>
            <option value="upload">Upload</option>
          </select>
          {isAdmin && (
            <select
              value={vetId}
              onChange={e => setVetId(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36] text-gray-600"
            >
              <option value="">Todos os veterinários</option>
              {vets.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
            </select>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="flex items-center gap-2 sm:col-span-2">
            <label className="text-xs text-gray-400 whitespace-nowrap">De</label>
            <input type="date" value={dataIni} onChange={e => setDataIni(e.target.value)}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36]" />
            <label className="text-xs text-gray-400 whitespace-nowrap">até</label>
            <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36]" />
          </div>
          <div className="flex gap-2">
            <button type="submit"
              className="flex-1 bg-[#19202d] hover:bg-[#232d3f] text-white text-sm font-semibold py-2 rounded-lg transition">
              Filtrar
            </button>
            {(busca || tipo || vetId || dataIni || dataFim) && (
              <button type="button" onClick={handleClear}
                className="px-3 py-2 border border-gray-200 text-gray-500 hover:bg-gray-50 text-sm rounded-lg transition">
                Limpar
              </button>
            )}
          </div>
        </div>
      </form>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Carregando...</div>
      ) : laudos.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl shadow-sm border">
          <div className="text-5xl mb-4">📋</div>
          <p className="text-gray-500">Nenhum laudo encontrado.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="h-1 bg-gold-stripe" />
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Data', 'Pet', 'Resp. Legal', 'Telefone', 'Veterinário', isAdmin ? 'Emitido por' : null, 'Tipo Exame', 'Ações']
                    .filter(Boolean).map(h => (
                    <th key={h!} className="text-left px-4 py-3 text-xs font-bold text-[#19202d] uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {laudos.map(laudo => (
                  <tr key={laudo.id} className="hover:bg-amber-50/30 transition">
                    <td className="px-4 py-4 text-gray-400 text-sm whitespace-nowrap">{fmt(laudo.criado_em)}</td>
                    <td className="px-4 py-4">
                      <a href={laudo.pet_id ? `/admin/pets/${laudo.pet_id}` : '#'}
                        className="font-semibold text-[#19202d] hover:text-[#8a6e36] hover:underline">{laudo.nome_pet}</a>
                      {laudo.tipo === 'gerado' && (
                        <span className="ml-2 text-[10px] bg-amber-50 text-[#8a6e36] border border-[#8a6e36]/20 px-1.5 py-0.5 rounded">
                          Gerado
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-gray-700">{laudo.tutor}</td>
                    <td className="px-4 py-4 text-gray-500 text-sm">{laudo.telefone}</td>
                    <td className="px-4 py-4 text-gray-500 text-sm">
                      {laudo.veterinarios?.nome ?? <span className="text-gray-300">—</span>}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-4 text-gray-500 text-sm">
                        {laudo.system_users?.nome?.split(' ')[0] ?? <span className="text-gray-300">—</span>}
                      </td>
                    )}
                    <td className="px-4 py-4 text-gray-500 text-sm">
                      {laudo.tipo_exame ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <a href={`/laudo/${laudo.token}`} target="_blank" rel="noreferrer"
                          className="text-xs px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition whitespace-nowrap">
                          Ver
                        </a>
                        <a href={`/api/pdf/${laudo.token}?download=1`}
                          className="text-xs px-2.5 py-1.5 rounded-lg bg-[#19202d] text-white hover:bg-[#232d3f] transition whitespace-nowrap">
                          ⬇ PDF
                        </a>
                        <button onClick={() => copyLink(laudo)}
                          className={`text-xs px-2.5 py-1.5 rounded-lg font-medium transition border whitespace-nowrap ${
                            copied === laudo.id
                              ? 'bg-green-50 text-green-700 border-green-200'
                              : 'bg-amber-50 text-[#8a6e36] border-[#8a6e36]/20 hover:bg-amber-100'
                          }`}>
                          {copied === laudo.id ? '✓' : '🔗'}
                        </button>
                        <button onClick={() => setWaModal(laudo)}
                          disabled={waStatus[laudo.id] === 'sending' || waStatus[laudo.id] === 'sent'}
                          className={`text-xs px-2.5 py-1.5 rounded-lg font-medium transition whitespace-nowrap ${
                            waStatus[laudo.id] === 'sent'    ? 'bg-green-100 text-green-700 cursor-default'
                            : waStatus[laudo.id] === 'error'   ? 'bg-red-50 text-red-600 border border-red-200'
                            : waStatus[laudo.id] === 'sending' ? 'bg-green-400 text-white cursor-wait'
                            : 'bg-green-500 hover:bg-green-600 text-white'
                          }`}>
                          {waStatus[laudo.id] === 'sending' ? '...'
                            : waStatus[laudo.id] === 'sent'  ? '✓'
                            : waStatus[laudo.id] === 'error' ? '!'
                            : 'WA'}
                        </button>
                        {isAdmin && laudo.agendamento_id === null && !laudo.agendamento_dispensado && !dispensados.has(laudo.id) && (
                          <button
                            onClick={() => abrirVincular(laudo)}
                            title="Vincular este laudo a um agendamento existente"
                            className="text-xs px-2.5 py-1.5 rounded-lg font-medium transition whitespace-nowrap bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100">
                            Vincular
                          </button>
                        )}
                        {isAdmin && laudo.agendamento_id === null && !laudo.agendamento_dispensado && !dispensados.has(laudo.id) && (
                          <button
                            onClick={() => dispensarLaudo(laudo)}
                            disabled={dispensando === laudo.id}
                            title="Marcar como sem agendamento justificado — remove do alerta do dashboard"
                            className="text-xs px-2.5 py-1.5 rounded-lg font-medium transition whitespace-nowrap bg-orange-50 text-orange-600 border border-orange-200 hover:bg-orange-100 disabled:opacity-50">
                            {dispensando === laudo.id ? '...' : 'Dispensar'}
                          </button>
                        )}
                        {isAdmin && (laudo.agendamento_dispensado || dispensados.has(laudo.id)) && laudo.agendamento_id === null && (
                          <span className="text-xs px-2.5 py-1.5 rounded-lg text-gray-400 border border-gray-100 whitespace-nowrap">
                            Dispensado
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de vincular laudo a agendamento */}
      {vincModal && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center px-4 py-6 overflow-y-auto" onClick={() => setVincModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md my-auto overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-[#19202d] px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-white font-bold text-sm">Vincular laudo a um agendamento</p>
                <p className="text-gray-400 text-xs mt-0.5">{vincModal.nome_pet} · {vincModal.tipo_exame ?? 'laudo'}</p>
              </div>
              <button onClick={() => setVincModal(null)} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
            </div>
            <div className="p-5">
              {loadingCand ? (
                <p className="text-sm text-gray-400 text-center py-6">Carregando agendamentos...</p>
              ) : candidatos.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6">Nenhum agendamento encontrado para este pet.</p>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500 mb-1">
                    {sugeridoId ? 'Sugestão em destaque (mesmo exame e data próxima):' : `Agendamentos do pet ${vincModal.nome_pet}:`}
                  </p>
                  {candidatos.map(c => {
                    const sugerido = c.id === sugeridoId
                    return (
                    <button
                      key={c.id}
                      onClick={() => vincular(c.id)}
                      disabled={vinculandoId !== null}
                      className={`w-full flex items-center justify-between text-left px-3 py-2.5 rounded-lg border transition disabled:opacity-50 ${sugerido ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-200' : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50'}`}>
                      <div>
                        <p className="text-sm font-medium text-[#19202d] flex items-center gap-1.5 flex-wrap">
                          Ag.{c.id} · {c.tipo_exame}
                          {sugerido && <span className="text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded-full">✨ Provável</span>}
                          {c.match_tipo && !sugerido && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">mesmo exame</span>}
                        </p>
                        <p className="text-xs text-gray-400">{new Date(c.data_hora).toLocaleDateString('pt-BR')} · {c.status}{c.tem_laudo ? ' · já tem laudo (parcial)' : ''}</p>
                      </div>
                      <span className="text-xs text-blue-600 font-semibold shrink-0">{vinculandoId === c.id ? '...' : 'Vincular →'}</span>
                    </button>
                  )})}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de destino do WhatsApp */}
      {waModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setWaModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-80 mx-4"
            onClick={e => e.stopPropagation()}>
            <p className="text-sm font-semibold text-[#19202d] mb-1">Enviar laudo via WhatsApp</p>
            <p className="text-xs text-gray-400 mb-5">
              <span className="font-medium text-gray-600">{waModal.nome_pet}</span> — para quem deseja enviar?
            </p>
            <div className="flex flex-col gap-2">
              <button onClick={() => sendWhatsApp(waModal, 'tutor')}
                className="w-full py-2.5 rounded-xl bg-[#19202d] hover:bg-[#232d3f] text-white text-sm font-semibold transition">
                Tutor
              </button>
              <button onClick={() => sendWhatsApp(waModal, 'vet')}
                className="w-full py-2.5 rounded-xl border border-[#8a6e36]/30 bg-amber-50 hover:bg-amber-100 text-[#8a6e36] text-sm font-semibold transition">
                Veterinário
              </button>
              <button onClick={() => sendWhatsApp(waModal, 'ambos')}
                className="w-full py-2.5 rounded-xl bg-green-500 hover:bg-green-600 text-white text-sm font-semibold transition">
                Ambos
              </button>
              <button onClick={() => setWaModal(null)}
                className="w-full py-2 text-xs text-gray-400 hover:text-gray-600 transition">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
