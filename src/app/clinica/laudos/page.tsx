'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface Laudo {
  id: number
  nome_pet: string
  especie: string
  tutor: string
  tipo: string
  original_name: string
  token: string
  created_at: string
  veterinario_id: number
}

interface Vet {
  id: number
  nome: string
}

export default function ClinicaLaudosPage() {
  const [laudos,  setLaudos]  = useState<Laudo[]>([])
  const [vets,    setVets]    = useState<Vet[]>([])
  const [loading, setLoading] = useState(true)
  const [busca,   setBusca]   = useState('')
  const [vetId,   setVetId]   = useState('')
  const [tipo,    setTipo]    = useState('')
  const [dataIni, setDataIni] = useState('')
  const [dataFim, setDataFim] = useState('')
  const router = useRouter()

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (busca)   params.set('busca',    busca)
    if (vetId)   params.set('vet_id',   vetId)
    if (tipo)    params.set('tipo',     tipo)
    if (dataIni) params.set('data_ini', dataIni)
    if (dataFim) params.set('data_fim', dataFim)

    const [laudosRes, vetsRes] = await Promise.all([
      fetch(`/api/clinica/laudos?${params.toString()}`),
      fetch('/api/clinica/veterinarios'),
    ])

    if (laudosRes.status === 401) { router.push('/clinica/login'); return }

    if (laudosRes.ok) setLaudos(await laudosRes.json())
    if (vetsRes.ok)   setVets(await vetsRes.json())
    setLoading(false)
  }, [busca, vetId, tipo, dataIni, dataFim, router])

  useEffect(() => { load() }, [load])

  function fmt(d: string) {
    return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    load()
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-[#19202d]">
          Laudos
          {!loading && <span className="ml-2 text-sm font-normal text-gray-400">({laudos.length})</span>}
        </h1>
      </div>

      {/* Filtros */}
      <form onSubmit={handleSearch} className="bg-white rounded-xl border shadow-sm p-4 mb-5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            type="text"
            placeholder="Buscar por pet ou tutor..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36] sm:col-span-1"
          />
          <select
            value={vetId}
            onChange={e => setVetId(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36] text-gray-600"
          >
            <option value="">Todos os veterinários</option>
            {vets.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
          </select>
          <select
            value={tipo}
            onChange={e => setTipo(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36] text-gray-600"
          >
            <option value="">Todos os tipos</option>
            <option value="gerado">Gerado</option>
            <option value="upload">Upload</option>
          </select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="flex items-center gap-2 sm:col-span-2">
            <label className="text-xs text-gray-400 whitespace-nowrap">De</label>
            <input
              type="date"
              value={dataIni}
              onChange={e => setDataIni(e.target.value)}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36]"
            />
            <label className="text-xs text-gray-400 whitespace-nowrap">até</label>
            <input
              type="date"
              value={dataFim}
              onChange={e => setDataFim(e.target.value)}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36]"
            />
          </div>
          <button
            type="submit"
            className="bg-[#19202d] hover:bg-[#232d3f] text-white text-sm font-semibold py-2 rounded-lg transition"
          >
            Filtrar
          </button>
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
                  {['Data', 'Pet', 'Tutor', 'Exame', 'Veterinário', 'Ações'].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-bold text-[#19202d] uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {laudos.map(l => {
                  const vet = vets.find(v => v.id === l.veterinario_id)
                  return (
                    <tr key={l.id} className="hover:bg-amber-50/30 transition">
                      <td className="px-5 py-4 text-gray-400 text-sm whitespace-nowrap">{fmt(l.created_at)}</td>
                      <td className="px-5 py-4 font-semibold text-[#19202d]">{l.nome_pet}</td>
                      <td className="px-5 py-4 text-gray-700">{l.tutor}</td>
                      <td className="px-5 py-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          l.tipo === 'gerado'
                            ? 'bg-amber-50 text-[#8a6e36] border border-[#8a6e36]/20'
                            : 'bg-gray-100 text-gray-500'
                        }`}>
                          {l.tipo === 'gerado' ? 'Gerado' : 'Upload'}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-gray-500 text-sm">{vet?.nome ?? '—'}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <a
                            href={`/laudo/${l.token}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition whitespace-nowrap"
                          >
                            Ver
                          </a>
                          <a
                            href={`/api/pdf/${l.id}?download=1`}
                            className="text-xs px-3 py-1.5 rounded-lg bg-[#19202d] text-white hover:bg-[#232d3f] transition whitespace-nowrap"
                          >
                            ⬇ PDF
                          </a>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
