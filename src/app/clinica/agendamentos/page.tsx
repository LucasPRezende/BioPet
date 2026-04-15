'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Agendamento {
  id:          number
  tipo_exame:  string
  data_hora:   string
  status:      string
  observacoes: string | null
  criado_em:   string
  tutores:     { nome: string | null; telefone: string } | null
  pets:        { nome: string; especie: string | null; raca: string | null } | null
  veterinarios: { nome: string } | null
}

const STATUS_LABEL: Record<string, string> = {
  pendente:        'Pendente',
  agendado:        'Confirmado',
  'em atendimento':'Em atendimento',
  'concluído':     'Concluído',
  cancelado:       'Cancelado',
}

const STATUS_COLOR: Record<string, string> = {
  pendente:        'bg-yellow-100 text-yellow-700 border-yellow-200',
  agendado:        'bg-green-100 text-green-700 border-green-200',
  'em atendimento':'bg-blue-100 text-blue-700 border-blue-200',
  'concluído':     'bg-gray-100 text-gray-600 border-gray-200',
  cancelado:       'bg-red-100 text-red-600 border-red-200',
}

const STATUS_ICON: Record<string, string> = {
  pendente:        '🟡',
  agendado:        '🟢',
  'em atendimento':'🔵',
  'concluído':     '⚪',
  cancelado:       '🔴',
}

const FILTROS = [
  { label: 'Todos',     value: '' },
  { label: '🟡 Pendentes', value: 'pendente' },
  { label: '🟢 Confirmados', value: 'agendado' },
  { label: '⚪ Concluídos', value: 'concluído' },
  { label: '🔴 Cancelados', value: 'cancelado' },
]

function formatDataHora(iso: string) {
  const [datePart, timePart = ''] = iso.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const d  = new Date(year, month - 1, day)
  const dd = String(day).padStart(2, '0')
  const mm = String(month).padStart(2, '0')
  const hora = timePart.substring(0, 5)
  const semana = d.toLocaleDateString('pt-BR', { weekday: 'short' })
  return `${semana}, ${dd}/${mm}${hora ? ` às ${hora}` : ''}`
}

export default function AgendamentosClinicaPage() {
  const router = useRouter()
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([])
  const [loading,      setLoading]      = useState(true)
  const [filtro,       setFiltro]       = useState('')
  const [cancelando,   setCancelando]   = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const url = filtro ? `/api/clinica/agendamentos?status=${filtro}` : '/api/clinica/agendamentos'
    const res = await fetch(url)
    if (res.status === 401) { router.push('/clinica/login'); return }
    if (res.ok) {
      const d = await res.json()
      setAgendamentos(d.agendamentos ?? [])
    }
    setLoading(false)
  }, [filtro, router])

  useEffect(() => { load() }, [load])

  async function cancelar(id: number) {
    if (!confirm('Cancelar este agendamento?')) return
    setCancelando(id)
    await fetch(`/api/clinica/agendamentos/${id}`, { method: 'PATCH' })
    await load()
    setCancelando(null)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">

        {/* Cabeçalho */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#19202d]">Agendamentos</h1>
            {!loading && (
              <p className="text-sm text-gray-500 mt-0.5">{agendamentos.length} registro{agendamentos.length !== 1 ? 's' : ''}</p>
            )}
          </div>
          <Link
            href="/clinica/novo-agendamento"
            className="bg-[#c4a35a] hover:bg-[#a88a47] text-white font-bold px-4 py-2.5 rounded-lg text-sm transition"
          >
            + Novo agendamento
          </Link>
        </div>

        {/* Filtros de status */}
        <div className="flex gap-2 flex-wrap mb-5">
          {FILTROS.map(f => (
            <button
              key={f.value}
              onClick={() => setFiltro(f.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                filtro === f.value
                  ? 'bg-[#19202d] text-white border-[#19202d]'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Lista */}
        {loading ? (
          <div className="text-center py-16 text-gray-400">Carregando...</div>
        ) : agendamentos.length === 0 ? (
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="h-1 bg-gold-stripe" />
            <div className="text-center py-16 text-gray-400">
              <p className="text-4xl mb-2">📅</p>
              <p className="font-medium text-sm">Nenhum agendamento encontrado</p>
              <Link href="/clinica/novo-agendamento"
                className="mt-4 inline-block bg-[#c4a35a] hover:bg-[#a88a47] text-white font-semibold px-4 py-2 rounded-lg text-sm transition">
                Solicitar agendamento
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {agendamentos.map(ag => {
              const tutor = Array.isArray(ag.tutores)     ? ag.tutores[0]     : ag.tutores
              const pet   = Array.isArray(ag.pets)        ? ag.pets[0]        : ag.pets
              const vet   = Array.isArray(ag.veterinarios) ? ag.veterinarios[0] : ag.veterinarios
              const podeCancelar = ['pendente', 'agendado'].includes(ag.status)

              return (
                <div key={ag.id} className="bg-white rounded-xl border shadow-sm overflow-hidden">
                  <div className="h-1 bg-gold-stripe" />
                  <div className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        {/* Pet + status */}
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="text-base">{STATUS_ICON[ag.status] ?? '⚪'}</span>
                          <span className="font-bold text-[#19202d]">{pet?.nome ?? '—'}</span>
                          {pet?.especie && (
                            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                              {pet.especie}{pet.raca ? ` · ${pet.raca}` : ''}
                            </span>
                          )}
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLOR[ag.status] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                            {STATUS_LABEL[ag.status] ?? ag.status}
                          </span>
                        </div>

                        {/* Tutor */}
                        <p className="text-sm text-gray-600 mb-1">
                          <span className="font-medium">{tutor?.nome ?? 'Resp. legal não informado'}</span>
                          {tutor?.telefone && <span className="text-gray-400 ml-2 text-xs">{tutor.telefone}</span>}
                        </p>

                        {/* Exame + data */}
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                          <span className="font-semibold text-[#8a6e36] bg-amber-50 px-2 py-0.5 rounded">
                            {ag.tipo_exame}
                          </span>
                          <span className="font-medium">{formatDataHora(ag.data_hora)}</span>
                          {vet && <span className="text-gray-400">Vet: {vet.nome}</span>}
                        </div>

                        {ag.observacoes && (
                          <p className="text-xs text-gray-400 mt-1.5 italic border-l-2 border-gray-200 pl-2">
                            {ag.observacoes}
                          </p>
                        )}
                      </div>

                      {/* Ação cancelar */}
                      {podeCancelar && (
                        <button
                          onClick={() => cancelar(ag.id)}
                          disabled={cancelando === ag.id}
                          className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 transition disabled:opacity-50"
                        >
                          {cancelando === ag.id ? '...' : 'Cancelar'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
