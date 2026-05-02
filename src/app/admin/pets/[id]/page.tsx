'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { especieIcon } from '@/lib/especies'

interface Tutor { id: number; nome: string | null; telefone: string }
interface Pet {
  id:                    number
  nome:                  string
  especie:               string | null
  raca:                  string | null
  sexo:                  string | null
  criado_em:             string
  falecido:              boolean | null
  falecido_em:           string | null
  total_laudos:          number
  total_agendamentos:    number
  primeiro_atendimento:  string | null
  ultimo_atendimento:    string | null
  tutores:               Tutor | null
}

interface HistoricoItem {
  tipo:               'laudo' | 'agendamento'
  id:                 number
  data:               string
  tipo_exame:         string | null
  // laudo
  token?:             string
  emitido_por?:       string | null
  veterinario?:       string | null
  // agendamento
  status?:            string
  valor?:             number | null
  forma_pagamento?:   string | null
  status_pagamento?:  string | null
  responsavel?:       string | null
  laudo?:             { id: number; token: string } | null
}

interface ResumoExame { tipo_exame: string; total: number; ultima_data: string }

const STATUS_COLORS: Record<string, string> = {
  'pendente':       'bg-yellow-100 text-yellow-700',
  'agendado':       'bg-blue-100 text-blue-700',
  'em atendimento': 'bg-amber-100 text-amber-700',
  'concluído':      'bg-green-100 text-green-700',
  'cancelado':      'bg-red-100 text-red-600',
}


function fmt(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function fmtDT(d: string) {
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function PetHistoricoPage() {
  const params    = useParams()
  const router    = useRouter()
  const petId     = Number(params.id)

  const [pet,      setPet]      = useState<Pet | null>(null)
  const [itens,    setItens]    = useState<HistoricoItem[]>([])
  const [resumo,   setResumo]   = useState<ResumoExame[]>([])
  const [loading,  setLoading]  = useState(true)

  // Filtros
  const [filtroTipo,   setFiltroTipo]   = useState('')
  const [filtroExame,  setFiltroExame]  = useState('')
  const [filtroIni,    setFiltroIni]    = useState('')
  const [filtroFim,    setFiltroFim]    = useState('')

  // Modal falecimento
  const [falModal,     setFalModal]     = useState(false)
  const [falData,      setFalData]      = useState(new Date().toLocaleDateString('en-CA'))
  const [falSaving,    setFalSaving]    = useState(false)
  const [falErr,       setFalErr]       = useState('')

  const loadPet = useCallback(async () => {
    const res = await fetch(`/api/pets/${petId}`)
    if (res.status === 401) { router.push('/admin/login'); return }
    if (res.ok) setPet(await res.json())
  }, [petId, router])

  const loadHistorico = useCallback(async () => {
    const sp = new URLSearchParams()
    if (filtroTipo)  sp.set('tipo_evento', filtroTipo)
    if (filtroExame) sp.set('tipo_exame',  filtroExame)
    if (filtroIni)   sp.set('data_inicio', filtroIni)
    if (filtroFim)   sp.set('data_fim',    filtroFim)
    const res = await fetch(`/api/pets/${petId}/historico?${sp.toString()}`)
    if (res.ok) {
      const d = await res.json()
      setItens(d.itens ?? [])
      setResumo(d.resumo ?? [])
    }
    setLoading(false)
  }, [petId, filtroTipo, filtroExame, filtroIni, filtroFim])

  useEffect(() => {
    loadPet()
    loadHistorico()
  }, [loadPet, loadHistorico])

  async function registrarFalecimento(e: React.FormEvent) {
    e.preventDefault()
    setFalErr('')
    setFalSaving(true)
    const res = await fetch(`/api/pets/${petId}/falecimento`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ falecido: true, falecido_em: falData, registrado_por: 'admin' }),
    })
    if (res.ok) {
      setFalModal(false)
      await loadPet()
    } else {
      const d = await res.json()
      setFalErr(d.error ?? 'Erro ao registrar.')
    }
    setFalSaving(false)
  }

  if (loading && !pet) {
    return <div className="p-6 text-center text-gray-400">Carregando...</div>
  }
  if (!pet) {
    return <div className="p-6 text-center text-gray-500">Pet não encontrado.</div>
  }

  const icon = especieIcon(pet.especie)
  const tiposExame  = Array.from(new Set(resumo.map(r => r.tipo_exame)))

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">

      {/* Cabeçalho do pet */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="h-1 bg-gold-stripe" />
        <div className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-[#19202d] flex items-center justify-center text-2xl shrink-0">
                {icon}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-bold text-[#19202d]">{pet.nome}</h1>
                  {pet.falecido && (
                    <span className="text-xs bg-gray-100 text-gray-500 border border-gray-200 px-2 py-0.5 rounded-full">
                      Falecido em {fmt(pet.falecido_em)}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-0.5">
                  {[pet.especie, pet.raca].filter(Boolean).join(' · ')}
                  {pet.sexo && <span className="ml-1.5 text-gray-400">· {pet.sexo}</span>}
                </p>
                {pet.tutores && (
                  <Link href={`/admin/tutores`} className="text-xs text-[#8a6e36] hover:underline mt-0.5 block">
                    Tutor: {pet.tutores.nome ?? pet.tutores.telefone} · {pet.tutores.telefone}
                  </Link>
                )}
              </div>
            </div>
            {!pet.falecido && (
              <button
                onClick={() => { setFalData(new Date().toLocaleDateString('en-CA')); setFalErr(''); setFalModal(true) }}
                className="text-sm font-semibold text-gray-500 border border-gray-200 px-4 py-2 rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition"
              >
                Registrar falecimento
              </button>
            )}
          </div>

          {/* Cards resumo */}
          <div className="grid grid-cols-3 gap-3 mt-5">
            {[
              { label: 'Laudos',        value: pet.total_laudos },
              { label: 'Agendamentos',  value: pet.total_agendamentos },
              { label: 'Primeiro atend.', value: fmt(pet.primeiro_atendimento) },
            ].map(c => (
              <div key={c.label} className="bg-gray-50 rounded-lg p-3 text-center border border-gray-100">
                <p className="text-lg font-bold text-[#19202d]">{c.value}</p>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">{c.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Resumo por tipo de exame */}
      {resumo.length > 0 && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="h-1 bg-gold-stripe" />
          <div className="p-5">
            <h2 className="text-xs font-bold text-[#19202d] uppercase tracking-widest mb-3">Resumo por exame</h2>
            <div className="flex flex-wrap gap-2">
              {resumo.map(r => (
                <button
                  key={r.tipo_exame}
                  onClick={() => setFiltroExame(filtroExame === r.tipo_exame ? '' : r.tipo_exame)}
                  className={`text-sm px-3 py-1.5 rounded-lg border transition ${filtroExame === r.tipo_exame ? 'bg-[#19202d] text-white border-[#19202d]' : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-amber-50 hover:border-[#c4a35a]'}`}
                >
                  {r.tipo_exame}
                  <span className="ml-1.5 text-xs opacity-70">{r.total}×</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filtros da timeline */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="h-1 bg-gold-stripe" />
        <div className="p-4 flex gap-3 flex-wrap items-end">
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase block mb-1">Tipo</label>
            <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36]">
              <option value="">Todos</option>
              <option value="laudo">Laudos</option>
              <option value="agendamento">Agendamentos</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase block mb-1">De</label>
            <input type="date" value={filtroIni} onChange={e => setFiltroIni(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36]" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase block mb-1">Até</label>
            <input type="date" value={filtroFim} onChange={e => setFiltroFim(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36]" />
          </div>
          {(filtroTipo || filtroExame || filtroIni || filtroFim) && (
            <button
              onClick={() => { setFiltroTipo(''); setFiltroExame(''); setFiltroIni(''); setFiltroFim('') }}
              className="text-sm text-gray-500 border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50 transition"
            >
              Limpar
            </button>
          )}
        </div>
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Carregando histórico...</div>
      ) : itens.length === 0 ? (
        <div className="bg-white rounded-xl border shadow-sm p-12 text-center">
          <p className="text-3xl mb-2">📋</p>
          <p className="text-gray-500 text-sm">Nenhum registro encontrado.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {itens.map(item => (
            <div key={`${item.tipo}-${item.id}`} className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="h-1 bg-gold-stripe" />
              <div className="p-5">
                {item.tipo === 'laudo' ? (
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">📋</span>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded">Laudo</span>
                          <span className="font-semibold text-[#19202d]">{item.tipo_exame ?? 'Exame'}</span>
                        </div>
                        <p className="text-sm text-gray-400 mt-0.5">{fmtDT(item.data)}</p>
                        {item.emitido_por && <p className="text-xs text-gray-400 mt-0.5">Emitido por {item.emitido_por}</p>}
                        {item.veterinario  && <p className="text-xs text-gray-400">Vet: {item.veterinario}</p>}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {item.token && (
                        <>
                          <a href={`/laudo/${item.token}`} target="_blank" rel="noreferrer"
                            className="text-xs px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition">
                            Ver laudo
                          </a>
                          <a href={`/api/pdf/${item.token}?download=1`}
                            className="text-xs px-2.5 py-1.5 rounded-lg bg-[#19202d] text-white hover:bg-[#232d3f] transition">
                            ⬇ PDF
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">📅</span>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded ${STATUS_COLORS[item.status ?? ''] ?? 'bg-gray-100 text-gray-600'}`}>
                            {item.status ?? 'Agendamento'}
                          </span>
                          <span className="font-semibold text-[#19202d]">{item.tipo_exame ?? 'Exame'}</span>
                        </div>
                        <p className="text-sm text-gray-400 mt-0.5">{fmtDT(item.data)}</p>
                        {item.responsavel && <p className="text-xs text-gray-400 mt-0.5">Resp: {item.responsavel}</p>}
                        {item.valor != null && (
                          <p className="text-xs text-gray-400">
                            R$ {item.valor.toFixed(2)} · {item.forma_pagamento ?? '—'}
                            {item.status_pagamento && <span className="ml-1.5">({item.status_pagamento})</span>}
                          </p>
                        )}
                      </div>
                    </div>
                    {item.laudo && (
                      <a href={`/laudo/${item.laudo.token}`} target="_blank" rel="noreferrer"
                        className="text-xs px-2.5 py-1.5 rounded-lg bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition">
                        Ver laudo vinculado
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal falecimento */}
      {falModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-[#19202d] px-6 py-4 flex items-center justify-between">
              <h3 className="text-white font-bold text-sm">Registrar Falecimento</h3>
              <button onClick={() => setFalModal(false)} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
            </div>
            <form onSubmit={registrarFalecimento} className="p-6 space-y-4">
              <p className="text-sm text-gray-600">
                Confirma o registro de falecimento de <strong>{pet.nome}</strong>? Esta ação não pode ser desfeita pelo painel.
              </p>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Data do falecimento *</label>
                <input type="date" value={falData} onChange={e => setFalData(e.target.value)} required
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36]" />
              </div>
              {falErr && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{falErr}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setFalModal(false)}
                  className="flex-1 border border-gray-200 text-gray-500 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition">
                  Cancelar
                </button>
                <button type="submit" disabled={falSaving}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-lg text-sm transition disabled:opacity-60">
                  {falSaving ? 'Salvando...' : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
