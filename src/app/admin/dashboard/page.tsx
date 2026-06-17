'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Resumo {
  total_agendamentos: number
  receita_total:      number
  total_recebido:     number
  total_a_receber:    number
  total_gratuitos:    number
  valor_gratuitos:    number
  total_antecipados:  number
  valor_antecipados:  number
  total_descontos:    number
  total_clientes:          number
  total_concluidos:        number
  a_receber_vencido:       number
  a_receber_vencido_valor: number
  breakdown: {
    pix_presencial_rec:    number
    pix_link_rec:          number
    cartao_presencial_rec: number
    cartao_link_rec:       number
    clinica_rec:           number
    a_receber_presencial:  number
    a_receber_link:        number
    a_receber_clinica:     number
  }
  porDia: { data: string; quantidade: number; receita: number }[]
}

interface Alertas {
  laudos_sem_agendamento:      number
  falta_laudo:                 number
  falta_laudo_lista:           { id: number; tipo_exame: string; data_hora: string; pet_nome: string }[]
  falta_pagamento:             number
  falta_pagamento_valor:       number
  falta_pagamento_lista:       { id: number; tipo_exame: string; valor: number; status_pagamento: string; data_hora: string; pet_nome: string }[]
}

interface VetEntry {
  user_id:               number
  nome:                  string
  recebe_comissao:       boolean
  quantidade:            number
  laudos_vinculados:     number
  laudos_sem_agendamento: number
  receita:               number
  comissao:              number
  lucro:                 number
}

interface LaudoStats {
  total:    number
  receita:  number
  custo:    number
  comissao: number
  lucro:    number
  porTipo: {
    tipo_exame: string; quantidade: number; receita: number
    custo: number; comissao: number; lucro: number; percentual: number
  }[]
  porDia:  { data: string; quantidade: number }[]
  porVet:  VetEntry[]
}

interface AgClinica {
  id:                    number
  tipo_exame:            string
  data_hora:             string
  valor:                 number | null
  status_pagamento:      string
  pet_nome:              string
  tutor_nome:            string
  pagamento_responsavel: string | null
  repasse_confirmado:    boolean
  repasse_em:            string | null
}

interface ClinicaRow {
  clinica_id:      number
  clinica_nome:    string
  total:           number
  total_valor:     number
  a_receber:       number
  recebido:        number
  repasse_pendente: number
  pendente_mp:     number
  agendamentos:    AgClinica[]
}

type Periodo = 'hoje' | 'semana' | 'mes' | 'personalizado'

function formatBRL(n: number | null | undefined) {
  return Number(n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(d: string) {
  const [, m, day] = d.split('-')
  return `${day}/${m}`
}

function formatDateTime(dt: string) {
  const d = new Date(dt)
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function getRange(periodo: Periodo, inicio: string, fim: string) {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  if (periodo === 'hoje')   { const t = toISO(now); return { inicio: t, fim: t } }
  if (periodo === 'semana') {
    const dom = new Date(now); dom.setDate(now.getDate() - now.getDay())
    return { inicio: toISO(dom), fim: toISO(now) }
  }
  if (periodo === 'mes') {
    const y = now.getFullYear(), m = now.getMonth()
    return { inicio: toISO(new Date(y, m, 1)), fim: toISO(new Date(y, m + 1, 0)) }
  }
  return { inicio, fim }
}

function StatCard({ label, value, sub, color, highlight, onClick }: {
  label: string; value: string; sub?: string; color?: string; highlight?: boolean; onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl border shadow-sm overflow-hidden ${highlight ? 'ring-2 ring-amber-300' : ''} ${onClick ? 'cursor-pointer hover:shadow-md transition' : ''}`}
    >
      <div className="h-1 bg-gold-stripe" />
      <div className="p-5">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
        <p className={`text-2xl font-bold ${color ?? 'text-[#19202d]'}`}>{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      </div>
    </div>
  )
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <div className="h-px flex-1 bg-gray-200" />
      <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">{label}</span>
      <div className="h-px flex-1 bg-gray-200" />
    </div>
  )
}

function Comparativo({ label, atual, anterior, brl }: { label: string; atual: number; anterior: number; brl?: boolean }) {
  const pct = anterior > 0 ? Math.round(((atual - anterior) / anterior) * 100) : (atual > 0 ? 100 : 0)
  const up  = pct >= 0
  return (
    <span className="flex items-center gap-1">
      <span className="text-gray-500">{label}:</span>
      <span className="font-semibold text-[#19202d]">{brl ? formatBRL(atual) : atual}</span>
      <span className={up ? 'text-green-600 font-semibold' : 'text-red-500 font-semibold'}>{up ? '▲' : '▼'}{Math.abs(pct)}%</span>
    </span>
  )
}

function BarChart({ data, brl }: { data: { data: string; valor: number }[]; brl?: boolean }) {
  if (data.length === 0) return (
    <div className="flex items-center justify-center h-32 text-gray-300 text-sm">Sem dados no período</div>
  )
  const max  = Math.max(...data.map(d => d.valor), 1)
  const lbl  = (v: number) => brl ? (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v))) : String(v)
  const barW = Math.max(8, Math.min(40, Math.floor(560 / data.length) - 4))
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${Math.max(600, data.length * (barW + 4))} 110`} className="w-full" style={{ minHeight: 110 }}>
        {data.map((d, i) => {
          const barH = Math.max(4, Math.round((d.valor / max) * 80))
          const x = i * (barW + 4)
          return (
            <g key={d.data}>
              <rect x={x} y={90 - barH} width={barW} height={barH} rx={3} fill={brl ? '#16a34a' : '#c4a35a'} opacity={0.85} />
              <text x={x + barW / 2} y={88 - barH} textAnchor="middle" fontSize={9} fill={brl ? '#15803d' : '#8a6e36'} fontWeight="600">
                {d.valor > 0 ? lbl(d.valor) : ''}
              </text>
              <text x={x + barW / 2} y={104} textAnchor="middle" fontSize={8} fill="#9ca3af">
                {formatDate(d.data)}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function VetModal({ userId, nome, inicio, fim, onClose }: {
  userId: number; nome: string; inicio: string; fim: string; onClose: () => void
}) {
  const [data, setData] = useState<{ com_agendamento: LaudoDetalhe[]; sem_agendamento: LaudoDetalhe[] } | null>(null)
  const [loading, setLoading] = useState(true)

  type LaudoDetalhe = {
    id: number; tipo_exame: string; criado_em: string; pet_nome: string; tutor_nome: string
    preco_exame: number; valor_comissao: number; agendamento_id: number | null
  }

  useEffect(() => {
    fetch(`/api/admin/dashboard/laudos-usuario?usuario_id=${userId}&inicio=${inicio}&fim=${fim}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setData(d); setLoading(false) })
  }, [userId, inicio, fim])

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center px-4 py-6 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="bg-[#19202d] px-5 py-4 flex items-center justify-between shrink-0">
          <div>
            <p className="text-white font-bold text-sm">Laudos — {nome}</p>
            <p className="text-gray-400 text-xs mt-0.5">{inicio.split('-').reverse().join('/')} a {fim.split('-').reverse().join('/')}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
        </div>
        <div className="overflow-y-auto flex-1 p-6 space-y-6">
          {loading ? (
            <p className="text-center text-gray-400 py-8">Carregando...</p>
          ) : !data ? (
            <p className="text-center text-red-500 py-8">Erro ao carregar dados.</p>
          ) : (
            <>
              {data.com_agendamento.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                    Vinculados a agendamento ({data.com_agendamento.length})
                  </h4>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-gray-400 uppercase">
                        <th className="text-left py-2 px-2">Pet</th>
                        <th className="text-left py-2 px-2">Exame</th>
                        <th className="text-left py-2 px-2">Data</th>
                        <th className="text-right py-2 px-2">Valor</th>
                        <th className="text-right py-2 px-2">Comissão</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {data.com_agendamento.map(l => (
                        <tr key={l.id} className="hover:bg-gray-50">
                          <td className="py-2 px-2 font-medium text-[#19202d]">{l.pet_nome}</td>
                          <td className="py-2 px-2 text-gray-600">{l.tipo_exame}</td>
                          <td className="py-2 px-2 text-gray-500">{formatDateTime(l.criado_em)}</td>
                          <td className="py-2 px-2 text-right text-blue-700">{formatBRL(l.preco_exame)}</td>
                          <td className="py-2 px-2 text-right text-amber-600">{formatBRL(l.valor_comissao)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {data.sem_agendamento.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-orange-500 uppercase tracking-wide mb-2">
                    Sem agendamento vinculado ({data.sem_agendamento.length})
                  </h4>
                  <p className="text-xs text-orange-400 mb-3">Laudos avulsos — verificar rastreabilidade ou aprovar comissão manualmente.</p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-gray-400 uppercase">
                        <th className="text-left py-2 px-2">Pet / Nome</th>
                        <th className="text-left py-2 px-2">Exame</th>
                        <th className="text-left py-2 px-2">Data</th>
                        <th className="text-right py-2 px-2">Valor</th>
                        <th className="text-right py-2 px-2">Comissão</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {data.sem_agendamento.map(l => (
                        <tr key={l.id} className="hover:bg-orange-50/30">
                          <td className="py-2 px-2 font-medium text-[#19202d]">{l.pet_nome}</td>
                          <td className="py-2 px-2 text-gray-600">{l.tipo_exame}</td>
                          <td className="py-2 px-2 text-gray-500">{formatDateTime(l.criado_em)}</td>
                          <td className="py-2 px-2 text-right text-blue-700">{formatBRL(l.preco_exame)}</td>
                          <td className="py-2 px-2 text-right text-amber-600">{formatBRL(l.valor_comissao)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {data.com_agendamento.length === 0 && data.sem_agendamento.length === 0 && (
                <p className="text-center text-gray-400 py-8">Nenhum laudo no período.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function ClinicaModal({ clinica, onClose, onRepasseConfirmado }: {
  clinica: ClinicaRow; onClose: () => void; onRepasseConfirmado: () => void
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  const pendentes  = clinica.agendamentos.filter(ag => !ag.repasse_confirmado && ag.pagamento_responsavel === 'clinica')
  const diretos    = clinica.agendamentos.filter(ag => !ag.repasse_confirmado && ag.pagamento_responsavel !== 'clinica')
  const confirmados = clinica.agendamentos.filter(ag => ag.repasse_confirmado)

  const PAG_LABELS: Record<string, string> = {
    'a_receber': 'A receber', 'pendente': 'Pendente',
    'pago': 'Pago', 'pago_clinica': 'Pago (clínica)',
  }

  function togglePendente(id: number) {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  function toggleAll() {
    setSelected(selected.size === pendentes.length ? new Set() : new Set(pendentes.map(ag => ag.id)))
  }

  const selectedTotal = Array.from(selected).reduce((s, id) => s + (pendentes.find(ag => ag.id === id)?.valor ?? 0), 0)

  async function confirmarRepasse() {
    if (!selected.size) return
    setSaving(true); setError('')
    const res = await fetch(`/api/admin/clinicas/${clinica.clinica_id}/repasse`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agendamento_ids: Array.from(selected) }),
    })
    if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Erro ao confirmar.') }
    else { onRepasseConfirmado() }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center px-4 py-6 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="bg-[#19202d] px-5 py-4 flex items-center justify-between shrink-0">
          <div>
            <p className="text-white font-bold text-sm">{clinica.clinica_nome}</p>
            <p className="text-gray-400 text-xs mt-0.5">{clinica.total} agendamento{clinica.total !== 1 ? 's' : ''} — total {formatBRL(clinica.total_valor)}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
        </div>
        <div className="overflow-y-auto flex-1 p-6 space-y-6">

          {/* Repasse pendente */}
          {pendentes.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-wide">
                  Repasse pendente — {formatBRL(clinica.repasse_pendente)}
                </h4>
                <button onClick={toggleAll} className="text-xs text-[#8a6e36] hover:underline">
                  {selected.size === pendentes.length ? 'Desmarcar todos' : 'Selecionar todos'}
                </button>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-gray-400 uppercase">
                    <th className="py-2 px-2 w-8" />
                    <th className="text-left py-2 px-2">Pet</th>
                    <th className="text-left py-2 px-2">Exame</th>
                    <th className="text-left py-2 px-2">Data</th>
                    <th className="text-right py-2 px-2">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pendentes.map(ag => (
                    <tr key={ag.id} onClick={() => togglePendente(ag.id)} className="hover:bg-indigo-50/30 cursor-pointer">
                      <td className="py-2 px-2">
                        <input type="checkbox" checked={selected.has(ag.id)} onChange={() => togglePendente(ag.id)} onClick={e => e.stopPropagation()} />
                      </td>
                      <td className="py-2 px-2 font-medium text-[#19202d]">{ag.pet_nome}</td>
                      <td className="py-2 px-2 text-gray-600">{ag.tipo_exame}</td>
                      <td className="py-2 px-2 text-gray-500">{formatDateTime(ag.data_hora)}</td>
                      <td className="py-2 px-2 text-right text-indigo-700">{formatBRL(ag.valor ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
              <div className="mt-3">
                <button onClick={confirmarRepasse} disabled={!selected.size || saving}
                  className="px-4 py-2 bg-[#19202d] text-white text-sm font-semibold rounded-lg disabled:opacity-40 hover:bg-[#232d3f] transition">
                  {saving
                    ? 'Confirmando...'
                    : `Confirmar repasse — ${selected.size} selecionado${selected.size !== 1 ? 's' : ''} (${formatBRL(selectedTotal)})`}
                </button>
              </div>
            </div>
          )}

          {/* Pagamentos diretos à BioPet */}
          {diretos.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">
                Pagamento direto à BioPet ({diretos.length})
              </h4>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-gray-400 uppercase">
                    <th className="text-left py-2 px-2">Pet</th>
                    <th className="text-left py-2 px-2">Exame</th>
                    <th className="text-left py-2 px-2">Data</th>
                    <th className="text-left py-2 px-2">Status</th>
                    <th className="text-right py-2 px-2">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {diretos.map(ag => (
                    <tr key={ag.id} className="hover:bg-gray-50">
                      <td className="py-2 px-2 font-medium text-[#19202d]">{ag.pet_nome}</td>
                      <td className="py-2 px-2 text-gray-600">{ag.tipo_exame}</td>
                      <td className="py-2 px-2 text-gray-500">{formatDateTime(ag.data_hora)}</td>
                      <td className="py-2 px-2">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
                          {PAG_LABELS[ag.status_pagamento] ?? ag.status_pagamento}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right text-gray-700">{formatBRL(ag.valor ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Repasse confirmado */}
          {confirmados.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-green-600 uppercase tracking-wide mb-2">
                Repasse confirmado ({confirmados.length})
              </h4>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-gray-400 uppercase">
                    <th className="text-left py-2 px-2">Pet</th>
                    <th className="text-left py-2 px-2">Exame</th>
                    <th className="text-left py-2 px-2">Confirmado em</th>
                    <th className="text-right py-2 px-2">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {confirmados.map(ag => (
                    <tr key={ag.id} className="hover:bg-green-50/20">
                      <td className="py-2 px-2 font-medium text-[#19202d]">{ag.pet_nome}</td>
                      <td className="py-2 px-2 text-gray-600">{ag.tipo_exame}</td>
                      <td className="py-2 px-2 text-gray-500">{ag.repasse_em ? formatDateTime(ag.repasse_em) : '—'}</td>
                      <td className="py-2 px-2 text-right text-green-700">{formatBRL(ag.valor ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {clinica.agendamentos.length === 0 && (
            <p className="text-center text-gray-400 py-8">Nenhum agendamento no período.</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const [resumo,         setResumo]         = useState<Resumo | null>(null)
  const [resumoAnterior, setResumoAnterior] = useState<Resumo | null>(null)
  const [alertas,        setAlertas]        = useState<Alertas | null>(null)
  const [laudoStats,     setLaudoStats]     = useState<LaudoStats | null>(null)
  const [clinicas,       setClinicas]       = useState<ClinicaRow[]>([])
  const [loading,        setLoading]        = useState(true)
  const [periodo,        setPeriodo]        = useState<Periodo>('mes')
  const [inicioCustom,   setInicioCustom]   = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toLocaleDateString('en-CA')
  })
  const [fimCustom,      setFimCustom]      = useState(() => new Date().toLocaleDateString('en-CA'))
  const [vetModal,       setVetModal]       = useState<{ userId: number; nome: string } | null>(null)
  const [clinicaModal,   setClinicaModal]   = useState<ClinicaRow | null>(null)
  const [showFaltaLaudo, setShowFaltaLaudo] = useState(false)
  const [showFaltaPag,   setShowFaltaPag]   = useState(false)
  const [comissoesLaudo, setComissoesLaudo] = useState<{ usuario_id: number; nome: string; a_pagar: number; pago: number; qtd_a_pagar: number }[]>([])
  const [extracaoVet,    setExtracaoVet]    = useState<{ vet_id: number; nome: string; devido: number; qtd: number }[]>([])
  const [marcandoCom,    setMarcandoCom]    = useState<number | null>(null)
  const router = useRouter()

  const { inicio, fim } = getRange(periodo, inicioCustom, fimCustom)

  const fetchAlertas = useCallback(async () => {
    const res = await fetch('/api/admin/dashboard/alertas')
    if (res.status === 401 || res.status === 403) { router.push('/login'); return }
    if (res.ok) setAlertas(await res.json())
  }, [router])

  const fetchStats = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    const [resumoRes, laudosRes, clinRes, comRes] = await Promise.all([
      fetch(`/api/admin/dashboard/resumo?inicio=${inicio}&fim=${fim}`),
      fetch(`/api/laudos/stats?inicio=${inicio}&fim=${fim}`),
      fetch(`/api/admin/relatorio/clinicas?inicio=${inicio}&fim=${fim}`),
      fetch(`/api/admin/comissoes-pagamento?inicio=${inicio}&fim=${fim}`),
    ])
    if (resumoRes.status === 401) { router.push('/login'); return }
    if (resumoRes.ok) setResumo(await resumoRes.json())

    // Período anterior (mesmo tamanho) para comparativo
    const dIni = new Date(`${inicio}T12:00:00`), dFim = new Date(`${fim}T12:00:00`)
    const dias = Math.round((dFim.getTime() - dIni.getTime()) / 86_400_000)
    const antFim = new Date(dIni); antFim.setDate(antFim.getDate() - 1)
    const antIni = new Date(antFim); antIni.setDate(antIni.getDate() - dias)
    const toISO = (d: Date) => d.toLocaleDateString('en-CA')
    fetch(`/api/admin/dashboard/resumo?inicio=${toISO(antIni)}&fim=${toISO(antFim)}`)
      .then(r => r.ok ? r.json() : null).then(d => setResumoAnterior(d)).catch(() => {})
    if (laudosRes.ok) setLaudoStats(await laudosRes.json())
    let newClinicas: ClinicaRow[] = []
    if (clinRes.ok) { newClinicas = (await clinRes.json()).clinicas ?? []; setClinicas(newClinicas) }
    if (comRes.ok)  { const dc = await comRes.json(); setComissoesLaudo(dc.laudo_por_usuario ?? []); setExtracaoVet(dc.extracao_por_vet ?? []) }
    if (!silent) setLoading(false)
    return newClinicas
  }, [inicio, fim, router])

  async function marcarComissaoPaga(usuarioId: number, desmarcar = false) {
    setMarcandoCom(usuarioId)
    try {
      await fetch('/api/admin/comissoes-pagamento', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario_id: usuarioId, inicio, fim, pago: !desmarcar }),
      })
      await fetchStats(true)
    } finally {
      setMarcandoCom(null)
    }
  }

  useEffect(() => {
    fetchAlertas()
    fetchStats()
    const interval = setInterval(() => { fetchAlertas(); fetchStats(true) }, 30_000)
    return () => clearInterval(interval)
  }, [fetchAlertas, fetchStats])

  const fmtRange = inicio === fim
    ? inicio.split('-').reverse().join('/')
    : `${inicio.split('-').reverse().join('/')} — ${fim.split('-').reverse().join('/')}`

  const hasAlertas = alertas && (alertas.laudos_sem_agendamento > 0 || alertas.falta_laudo > 0 || alertas.falta_pagamento > 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">

        {/* Alertas operacionais */}
        {alertas && hasAlertas && (
          <div className="space-y-2">
            <SectionDivider label="Alertas operacionais" />
            {alertas.laudos_sem_agendamento > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3 flex items-start gap-3">
                <span className="text-red-500 text-lg mt-0.5">⚠️</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-red-700">
                    {alertas.laudos_sem_agendamento} laudo{alertas.laudos_sem_agendamento > 1 ? 's' : ''} emitido{alertas.laudos_sem_agendamento > 1 ? 's' : ''} sem agendamento vinculado
                  </p>
                  <p className="text-xs text-red-500 mt-0.5">Problema de rastreabilidade — verifique e corrija no histórico de laudos.</p>
                </div>
                <Link href="/admin/laudos" className="text-xs text-red-600 underline font-semibold whitespace-nowrap">Ver laudos →</Link>
              </div>
            )}
            {alertas.falta_laudo > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-amber-500 text-lg">📋</span>
                  <p className="text-sm font-semibold text-amber-700">
                    {alertas.falta_laudo} exame{alertas.falta_laudo > 1 ? 's' : ''} aguardando laudo há +2 dias úteis
                  </p>
                  <button onClick={() => setShowFaltaLaudo(v => !v)} className="ml-auto text-xs text-amber-700 underline shrink-0">
                    {showFaltaLaudo ? 'Ocultar' : 'Ver lista'}
                  </button>
                </div>
                {showFaltaLaudo && (
                  <div className="mt-3 space-y-1.5 pl-8">
                    {alertas.falta_laudo_lista.map(ag => (
                      <div key={ag.id} className="flex items-center gap-2 text-xs text-amber-800 flex-wrap">
                        <Link href={`/admin/agenda?data=${(ag.data_hora ?? '').slice(0, 10)}&abrir=${ag.id}`} className="font-semibold text-amber-700 hover:underline">Ag.{ag.id}</Link>
                        <span>{ag.tipo_exame}</span>
                        <span>—</span>
                        <span className="font-medium">{ag.pet_nome}</span>
                        <span className="text-amber-500">{formatDateTime(ag.data_hora)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {alertas.falta_pagamento > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-5 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-yellow-500 text-lg">💸</span>
                  <p className="text-sm font-semibold text-yellow-800">
                    {alertas.falta_pagamento} pagamento{alertas.falta_pagamento > 1 ? 's' : ''} pendente{alertas.falta_pagamento > 1 ? 's' : ''} — {formatBRL(alertas.falta_pagamento_valor)}
                  </p>
                  <button onClick={() => setShowFaltaPag(v => !v)} className="ml-auto text-xs text-yellow-700 underline shrink-0">
                    {showFaltaPag ? 'Ocultar' : 'Ver lista'}
                  </button>
                </div>
                {showFaltaPag && (
                  <div className="mt-3 space-y-1.5 pl-8">
                    {alertas.falta_pagamento_lista.map(ag => (
                      <div key={ag.id} className="flex items-center gap-2 text-xs text-yellow-800 flex-wrap">
                        <Link href={`/admin/agenda?data=${(ag.data_hora ?? '').slice(0, 10)}&abrir=${ag.id}`} className="font-semibold text-yellow-700 hover:underline">Ag.{ag.id}</Link>
                        <span>{ag.tipo_exame}</span>
                        <span>—</span>
                        <span className="font-medium">{ag.pet_nome}</span>
                        <span className="font-semibold text-yellow-700">{formatBRL(ag.valor)}</span>
                        <span className="bg-yellow-200 text-yellow-800 px-1.5 py-0.5 rounded text-xs">{ag.status_pagamento}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Filtro de período */}
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="h-1 bg-gold-stripe" />
          <div className="p-4 flex flex-wrap items-center gap-3">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Período:</span>
            {(['hoje', 'semana', 'mes', 'personalizado'] as Periodo[]).map(p => (
              <button key={p} onClick={() => setPeriodo(p)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${periodo === p ? 'bg-[#19202d] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                {p === 'hoje' ? 'Hoje' : p === 'semana' ? 'Esta semana' : p === 'mes' ? 'Este mês' : 'Personalizado'}
              </button>
            ))}
            {periodo === 'personalizado' && (
              <div className="flex items-center gap-2 ml-2">
                <input type="date" value={inicioCustom} onChange={e => setInicioCustom(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36]" />
                <span className="text-gray-400 text-sm">até</span>
                <input type="date" value={fimCustom} onChange={e => setFimCustom(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36]" />
              </div>
            )}
            <span className="text-xs text-gray-400 ml-auto">{fmtRange}</span>
            <button onClick={() => { fetchAlertas(); fetchStats() }} disabled={loading}
              className="ml-2 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-500 hover:bg-gray-50 transition disabled:opacity-40">
              {loading ? '⟳' : '↺ Atualizar'}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400">Carregando...</div>
        ) : (
          <>
            {/* Resumo financeiro de agendamentos */}
            {resumo && (
              <>
                <SectionDivider label={`Agendamentos — ${fmtRange}`} />

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <StatCard label="Total agendamentos" value={String(resumo.total_agendamentos)} />
                  <StatCard label="Receita total"      value={formatBRL(resumo.receita_total)}  color="text-blue-700" />
                  <StatCard label="Total recebido"     value={formatBRL(resumo.total_recebido)} color="text-green-600" />
                  <StatCard label="A receber"          value={formatBRL(resumo.total_a_receber)} color="text-amber-600"
                    highlight={resumo.total_a_receber > 0} />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <StatCard label="Ticket médio" value={formatBRL(resumo.total_agendamentos > 0 ? resumo.receita_total / resumo.total_agendamentos : 0)} />
                  <StatCard label="% Recebido"   value={`${resumo.receita_total > 0 ? Math.round(resumo.total_recebido / resumo.receita_total * 100) : 0}%`} color="text-green-600" />
                  <StatCard label="Taxa de conclusão" value={`${resumo.total_agendamentos > 0 ? Math.round(resumo.total_concluidos / resumo.total_agendamentos * 100) : 0}%`} sub={`${resumo.total_concluidos} concluídos`} />
                  <StatCard label="Clientes" value={String(resumo.total_clientes)} sub="atendidos no período" />
                </div>

                {resumoAnterior && (
                  <div className="bg-white rounded-xl border shadow-sm px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
                    <span className="font-bold text-gray-400 uppercase tracking-wide">vs período anterior</span>
                    <Comparativo label="Receita"      atual={resumo.receita_total}      anterior={resumoAnterior.receita_total} brl />
                    <Comparativo label="Recebido"     atual={resumo.total_recebido}     anterior={resumoAnterior.total_recebido} brl />
                    <Comparativo label="Agendamentos" atual={resumo.total_agendamentos} anterior={resumoAnterior.total_agendamentos} />
                  </div>
                )}

                {resumo.a_receber_vencido > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3 flex items-center gap-3">
                    <span className="text-red-500 text-lg">⏰</span>
                    <p className="text-sm font-semibold text-red-700 flex-1">
                      {resumo.a_receber_vencido} pagamento{resumo.a_receber_vencido > 1 ? 's' : ''} a receber vencido{resumo.a_receber_vencido > 1 ? 's' : ''} — {formatBRL(resumo.a_receber_vencido_valor)}
                    </p>
                    <span className="text-xs text-red-500">cobrança em atraso</span>
                  </div>
                )}

                {(resumo.total_antecipados > 0 || resumo.total_gratuitos > 0 || resumo.total_descontos > 0) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {resumo.total_antecipados > 0 && (
                      <StatCard
                        label="Antecipados (futuros já pagos)"
                        value={formatBRL(resumo.valor_antecipados)}
                        sub={`${resumo.total_antecipados} agendamento${resumo.total_antecipados > 1 ? 's' : ''} futuros já pagos`}
                        color="text-violet-600"
                      />
                    )}
                    {resumo.total_gratuitos > 0 && (
                      <StatCard
                        label="Gratuitos no período"
                        value={String(resumo.total_gratuitos)}
                        sub={`Valor dispensado: ${formatBRL(resumo.valor_gratuitos)}`}
                      />
                    )}
                    {resumo.total_descontos > 0 && (
                      <StatCard
                        label="Descontos concedidos"
                        value={formatBRL(resumo.total_descontos)}
                        sub="Total descontado no período (já refletido na receita)"
                        color="text-amber-600"
                      />
                    )}
                  </div>
                )}

                {/* Breakdown por forma de pagamento */}
                <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                  <div className="h-1 bg-gold-stripe" />
                  <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <p className="text-xs font-bold text-green-600 uppercase tracking-wide mb-3">Recebido por forma</p>
                      <div className="space-y-2.5">
                        {([
                          { label: 'Pix / dinheiro presencial', value: resumo.breakdown.pix_presencial_rec },
                          { label: 'Pix link',                  value: resumo.breakdown.pix_link_rec },
                          { label: 'Cartão presencial',         value: resumo.breakdown.cartao_presencial_rec },
                          { label: 'Cartão link',               value: resumo.breakdown.cartao_link_rec },
                          { label: 'Clínica (pago_clinica)',    value: resumo.breakdown.clinica_rec },
                        ] as { label: string; value: number }[]).filter(r => r.value > 0).map(({ label, value }) => (
                          <div key={label} className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">{label}</span>
                            <span className="font-semibold text-green-700">{formatBRL(value)}</span>
                          </div>
                        ))}
                        {[
                          resumo.breakdown.pix_presencial_rec, resumo.breakdown.pix_link_rec,
                          resumo.breakdown.cartao_presencial_rec, resumo.breakdown.cartao_link_rec,
                          resumo.breakdown.clinica_rec,
                        ].every(v => v === 0) && (
                          <p className="text-xs text-gray-400">Nenhum recebimento no período.</p>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-amber-600 uppercase tracking-wide mb-3">A receber por origem</p>
                      <div className="space-y-2.5">
                        {([
                          { label: 'Presencial (a confirmar)', value: resumo.breakdown.a_receber_presencial },
                          { label: 'Link (aguardando pag.)',   value: resumo.breakdown.a_receber_link },
                          { label: 'Clínica (repasse devido)', value: resumo.breakdown.a_receber_clinica },
                        ] as { label: string; value: number }[]).map(({ label, value }) => (
                          value > 0 ? (
                            <div key={label} className="flex items-center justify-between text-sm">
                              <span className="text-gray-600">{label}</span>
                              <span className="font-semibold text-amber-700">{formatBRL(value)}</span>
                            </div>
                          ) : null
                        ))}
                        {resumo.breakdown.a_receber_presencial === 0 && resumo.breakdown.a_receber_link === 0 && resumo.breakdown.a_receber_clinica === 0 && (
                          <p className="text-xs text-green-600 font-medium">Tudo recebido no período.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Gráficos por dia */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                    <div className="h-1 bg-gold-stripe" />
                    <div className="p-6">
                      <h3 className="text-sm font-bold text-[#19202d] uppercase tracking-wide mb-4">Agendamentos por Dia</h3>
                      <BarChart data={resumo.porDia.map(d => ({ data: d.data, valor: d.quantidade }))} />
                    </div>
                  </div>
                  <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                    <div className="h-1 bg-gold-stripe" />
                    <div className="p-6">
                      <h3 className="text-sm font-bold text-[#19202d] uppercase tracking-wide mb-4">Receita por Dia</h3>
                      <BarChart data={resumo.porDia.map(d => ({ data: d.data, valor: d.receita }))} brl />
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Laudos */}
            {laudoStats && (
              <>
                <SectionDivider label="Laudos" />

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <StatCard label="Total de laudos" value={String(laudoStats.total)} />
                  <StatCard label="Custo total"     value={formatBRL(laudoStats.custo)}    color="text-red-500" />
                  <StatCard label="Comissões"       value={formatBRL(laudoStats.comissao)} color="text-amber-600" sub="a pagar" />
                  <StatCard
                    label="Lucro BioPet (est.)"
                    value={formatBRL(resumo ? resumo.total_recebido - laudoStats.custo - laudoStats.comissao : laudoStats.lucro)}
                    color={(resumo ? resumo.total_recebido - laudoStats.custo - laudoStats.comissao : laudoStats.lucro) >= 0 ? 'text-green-600' : 'text-red-500'}
                    sub="recebido − custo − comissão"
                  />
                </div>

                {comissoesLaudo.length > 0 && (
                  <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                    <div className="h-1 bg-gold-stripe" />
                    <div className="p-6">
                      <h3 className="text-sm font-bold text-[#19202d] uppercase tracking-wide mb-4">Comissões de laudo a pagar — {fmtRange}</h3>
                      <div className="space-y-2">
                        {comissoesLaudo.map(c => (
                          <div key={c.usuario_id} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-gray-100 hover:bg-amber-50/30 transition flex-wrap">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-[#19202d]">{c.nome}</p>
                              <p className="text-xs text-gray-400">
                                A pagar: <span className="text-amber-600 font-semibold">{formatBRL(c.a_pagar)}</span>
                                {c.pago > 0 && <> · Pago: <span className="text-green-600 font-semibold">{formatBRL(c.pago)}</span></>}
                              </p>
                            </div>
                            {c.a_pagar > 0 ? (
                              <button
                                onClick={() => marcarComissaoPaga(c.usuario_id)}
                                disabled={marcandoCom === c.usuario_id}
                                className="text-xs px-3 py-1.5 rounded-lg font-semibold bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 disabled:opacity-50 whitespace-nowrap">
                                {marcandoCom === c.usuario_id ? '...' : `Marcar pago (${c.qtd_a_pagar})`}
                              </button>
                            ) : c.pago > 0 ? (
                              <button
                                onClick={() => marcarComissaoPaga(c.usuario_id, true)}
                                disabled={marcandoCom === c.usuario_id}
                                className="text-xs px-3 py-1.5 rounded-lg text-gray-400 border border-gray-100 hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap">
                                {marcandoCom === c.usuario_id ? '...' : '✓ Pago · desfazer'}
                              </button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                      <p className="text-[11px] text-gray-400 mt-3">Confirma a comissão dos laudos deste usuário no período selecionado.</p>
                    </div>
                  </div>
                )}

                {extracaoVet.length > 0 && (
                  <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                    <div className="h-1 bg-gold-stripe" />
                    <div className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-[#19202d] uppercase tracking-wide">Extrações devidas — {fmtRange}</h3>
                        <Link href="/admin/extracoes" className="text-xs text-[#8a6e36] hover:underline">Gerenciar →</Link>
                      </div>
                      <div className="space-y-2">
                        {extracaoVet.map(e => (
                          <div key={e.vet_id} className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-gray-100">
                            <p className="text-sm font-semibold text-[#19202d]">{e.nome} <span className="text-xs text-gray-400 font-normal">· {e.qtd} extração{e.qtd > 1 ? 'ões' : ''}</span></p>
                            <span className="text-sm font-bold text-amber-600">{formatBRL(e.devido)}</span>
                          </div>
                        ))}
                      </div>
                      <p className="text-[11px] text-gray-400 mt-3">Comissões de extração ainda não pagas. Confirme o pagamento em Extrações.</p>
                    </div>
                  </div>
                )}

                {laudoStats.porTipo.length > 0 && (
                  <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                    <div className="h-1 bg-gold-stripe" />
                    <div className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-[#19202d] uppercase tracking-wide">Por Tipo de Exame</h3>
                        <Link href="/admin/comissoes" className="text-xs text-[#8a6e36] hover:underline">Editar preços →</Link>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b">
                              {['Tipo', 'Qtd', '%', 'Receita', 'Custo', 'Comissão', 'Lucro'].map(h => (
                                <th key={h} className="text-left py-2 px-3 text-xs font-bold text-gray-400 uppercase tracking-wide">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {laudoStats.porTipo.map(row => (
                              <tr key={row.tipo_exame} className="hover:bg-amber-50/20 transition">
                                <td className="py-3 px-3 font-medium text-[#19202d] text-sm">{row.tipo_exame}</td>
                                <td className="py-3 px-3 text-gray-600 text-sm">{row.quantidade}</td>
                                <td className="py-3 px-3">
                                  <div className="flex items-center gap-1.5">
                                    <div className="w-12 bg-gray-100 rounded-full h-1.5">
                                      <div className="bg-[#c4a35a] h-1.5 rounded-full" style={{ width: `${row.percentual}%` }} />
                                    </div>
                                    <span className="text-xs text-gray-500">{row.percentual}%</span>
                                  </div>
                                </td>
                                <td className="py-3 px-3 text-gray-700 text-sm font-medium">{formatBRL(row.receita)}</td>
                                <td className="py-3 px-3 text-red-500 text-sm">{formatBRL(row.custo)}</td>
                                <td className="py-3 px-3 text-amber-600 text-sm">{formatBRL(row.comissao)}</td>
                                <td className={`py-3 px-3 text-sm font-semibold ${row.lucro >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                  {formatBRL(row.lucro)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Exames por clínica */}
            {clinicas.length > 0 && (
              <>
                <SectionDivider label="Exames por Clínica" />
                <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                  <div className="h-1 bg-gold-stripe" />
                  <div className="p-6">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            {['Clínica', 'Encaminhados', 'Repasse pendente', 'Recebido', ''].map(h => (
                              <th key={h} className="text-left py-2 px-3 text-xs font-bold text-gray-400 uppercase tracking-wide">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {clinicas.map(row => (
                            <tr key={row.clinica_id} className="hover:bg-amber-50/20 transition">
                              <td className="py-3 px-3 font-semibold text-[#19202d] text-sm">{row.clinica_nome}</td>
                              <td className="py-3 px-3 text-gray-600 text-sm">{row.total}</td>
                              <td className="py-3 px-3 text-sm">
                                {row.repasse_pendente > 0
                                  ? <span className="font-semibold px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-700 border border-amber-200">{formatBRL(row.repasse_pendente)}</span>
                                  : <span className="text-gray-300 text-xs">—</span>}
                              </td>
                              <td className="py-3 px-3 text-sm">
                                {row.recebido > 0
                                  ? <span className="font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full text-xs">{formatBRL(row.recebido)}</span>
                                  : <span className="text-gray-300 text-xs">—</span>}
                              </td>
                              <td className="py-3 px-3">
                                <button onClick={() => setClinicaModal(row)} className="text-xs text-[#8a6e36] hover:underline font-medium">
                                  Ver detalhes →
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-gray-200 bg-gray-50">
                            <td className="py-3 px-3 text-xs font-bold text-gray-500 uppercase">Total</td>
                            <td className="py-3 px-3 text-sm font-bold text-gray-700">{clinicas.reduce((s, r) => s + r.total, 0)}</td>
                            <td className="py-3 px-3 text-sm font-bold text-amber-700">{formatBRL(clinicas.reduce((s, r) => s + r.repasse_pendente, 0))}</td>
                            <td className="py-3 px-3 text-sm font-bold text-blue-700">{formatBRL(clinicas.reduce((s, r) => s + r.recebido, 0))}</td>
                            <td />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Desempenho por usuário */}
            {laudoStats && laudoStats.porVet.length > 0 && (
              <>
                <SectionDivider label="Desempenho por Usuário" />
                <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                  <div className="h-1 bg-gold-stripe" />
                  <div className="p-6 overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          {['Usuário', 'Laudos', 'Com ag.', 'Sem ag.', 'Comissão a pagar', 'Lucro gerado', ''].map(h => (
                            <th key={h} className="text-left py-2 px-3 text-xs font-bold text-gray-400 uppercase tracking-wide">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {laudoStats.porVet.map(row => (
                          <tr key={row.user_id} className="hover:bg-amber-50/20 transition">
                            <td className="py-3 px-3 font-semibold text-[#19202d]">{row.nome}</td>
                            <td className="py-3 px-3 text-gray-600">{row.quantidade}</td>
                            <td className="py-3 px-3 text-gray-600">{row.laudos_vinculados}</td>
                            <td className="py-3 px-3">
                              {row.laudos_sem_agendamento > 0 ? (
                                <span className="bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full text-xs font-semibold">
                                  {row.laudos_sem_agendamento}
                                </span>
                              ) : (
                                <span className="text-gray-400 text-sm">0</span>
                              )}
                            </td>
                            <td className="py-3 px-3">
                              {row.recebe_comissao ? (
                                <span className="bg-amber-50 text-[#8a6e36] border border-[#8a6e36]/20 px-2 py-1 rounded text-sm font-semibold">
                                  {formatBRL(row.comissao)}
                                </span>
                              ) : (
                                <span className="bg-gray-100 text-gray-400 px-2 py-1 rounded text-xs">Salário fixo</span>
                              )}
                            </td>
                            <td className={`py-3 px-3 font-semibold ${row.lucro >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                              {formatBRL(row.lucro)}
                            </td>
                            <td className="py-3 px-3">
                              <button onClick={() => setVetModal({ userId: row.user_id, nome: row.nome })}
                                className="text-xs text-[#8a6e36] hover:underline font-medium">
                                Ver laudos →
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </main>

      {vetModal && (
        <VetModal
          userId={vetModal.userId}
          nome={vetModal.nome}
          inicio={inicio}
          fim={fim}
          onClose={() => setVetModal(null)}
        />
      )}
      {clinicaModal && (
        <ClinicaModal
          clinica={clinicaModal}
          onClose={() => setClinicaModal(null)}
          onRepasseConfirmado={async () => {
            const novas = await fetchStats(true)
            if (novas && clinicaModal) {
              const atualizada = novas.find(c => c.clinica_id === clinicaModal.clinica_id)
              if (atualizada) setClinicaModal(atualizada)
            }
          }}
        />
      )}
    </div>
  )
}
