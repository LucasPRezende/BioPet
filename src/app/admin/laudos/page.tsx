'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface Laudo {
  id: number
  nome_pet: string
  especie: string
  tutor: string
  telefone: string
  token: string
  tipo: string
  tipo_exame: string | null
  created_at: string
  veterinarios: { nome: string } | null
  system_users: { nome: string } | null
}

interface Vet { id: number; nome: string }

type WaStatus = 'idle' | 'sending' | 'sent' | 'error'

export default function LaudosPage() {
  const [laudos,   setLaudos]   = useState<Laudo[]>([])
  const [vets,     setVets]     = useState<Vet[]>([])
  const [loading,  setLoading]  = useState(true)
  const [isAdmin,  setIsAdmin]  = useState(false)
  const [copied,   setCopied]   = useState<number | null>(null)
  const [waStatus, setWaStatus] = useState<Record<number, WaStatus>>({})

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

  async function sendWhatsApp(laudo: Laudo) {
    setWaStatus(s => ({ ...s, [laudo.id]: 'sending' }))
    try {
      const res = await fetch(`/api/laudos/${laudo.id}/whatsapp`, { method: 'POST' })
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
                  {['Data', 'Pet', 'Tutor', 'Telefone', 'Veterinário', isAdmin ? 'Emitido por' : null, 'Tipo Exame', 'Ações']
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
                    <td className="px-4 py-4 text-gray-400 text-sm whitespace-nowrap">{fmt(laudo.created_at)}</td>
                    <td className="px-4 py-4">
                      <span className="font-semibold text-[#19202d]">{laudo.nome_pet}</span>
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
                        <a href={`/api/pdf/${laudo.id}?download=1`}
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
                        <button onClick={() => sendWhatsApp(laudo)}
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
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
