'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AgendamentoForm } from '@/components/AgendamentoForm'

interface Tutor { id: number; nome: string | null; telefone: string }
interface Pet   { id: number; nome: string; especie: string | null; raca: string | null }

interface BioquimicaSubExame {
  id:                number
  valor_pix:         number
  valor_cartao:      number
  bioquimica_exames: { nome: string; codigo: string | null } | null
}

interface AgExame {
  tipo_exame: string
  valor:      number | null
}

interface Agendamento {
  id:                    number
  tipo_exame:            string
  data_hora:             string
  duracao_minutos:       number | null
  valor:                 number | null
  forma_pagamento:       string | null
  entrega_pagamento:     string | null
  status:                string
  observacoes:           string | null
  origem:                string | null
  sedacao_necessaria:    boolean | null
  pet_internado:         boolean | null
  pagamento_responsavel: string | null
  status_pagamento:      string | null
  encaixe:               boolean | null
  mp_init_point:         string | null
  veterinario_id:        number | null
  clinica_id:            number | null
  is_revisao:            boolean | null
  tutores:               Tutor | null
  pets:                  Pet | null
  system_users:          { nome: string } | null
  clinicas:              { nome: string } | null
  laudos:                { id: number; token: string }[] | null
  agendamento_exames?:   AgExame[] | null
  agendamento_bioquimica?: BioquimicaSubExame[] | null
}

const STATUS_LABELS: Record<string, string> = {
  'pendente':       'Pendente',
  'agendado':       'Agendado',
  'em atendimento': 'Em atendimento',
  'concluído':      'Concluído',
  'cancelado':      'Cancelado',
}
const STATUS_COLORS: Record<string, string> = {
  'pendente':       'bg-yellow-100 text-yellow-700 border-yellow-200',
  'agendado':       'bg-blue-100 text-blue-700 border-blue-200',
  'em atendimento': 'bg-amber-100 text-amber-700 border-amber-200',
  'concluído':      'bg-green-100 text-green-700 border-green-200',
  'cancelado':      'bg-red-100 text-red-600 border-red-200',
}
const STATUS_TRANSITIONS: Record<string, string[]> = {
  'pendente':       ['pendente'],
  'agendado':       ['agendado', 'em atendimento', 'concluído'],
  'em atendimento': ['agendado', 'em atendimento', 'concluído'],
  'concluído':      ['concluído'],
  'cancelado':      ['cancelado'],
}
const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MESES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const MESES_LONGO = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']
function toDateStr(d: Date): string { return d.toLocaleDateString('en-CA') }
function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function getSunday(d: Date): Date { const r = new Date(d); r.setDate(r.getDate() - r.getDay()); return r }
function formatHora(iso: string): string {
  return iso.includes('T') ? iso.split('T')[1].substring(0, 5) : iso.substring(0, 5)
}
function formatBRL(n: number | null): string {
  if (n == null) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
// ── Helpers de UI ──────────────────────────────────────────────────────────────

function SimNaoBtn({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex gap-1">
      {([true, false] as const).map(v => (
        <button key={String(v)} type="button" onClick={() => onChange(v)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
            value === v ? 'bg-[#19202d] text-white border-[#19202d]' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
          }`}>
          {v ? 'Sim' : 'Não'}
        </button>
      ))}
    </div>
  )
}

// ── EditLaudoModal ─────────────────────────────────────────────────────────────

function EditLaudoModal({ laudo, petNome, onClose }: {
  laudo:   { id: number; token: string }
  petNome: string
  onClose: () => void
}) {
  const fileRef               = useRef<HTMLInputElement>(null)
  const [file,    setFile]    = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [done,    setDone]    = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    setLoading(true); setError('')
    const data = new FormData()
    data.append('pdf', file)
    const res = await fetch(`/api/laudos/${laudo.id}`, { method: 'PATCH', body: data })
    if (res.ok) { setDone(true) }
    else { const d = await res.json(); setError(d.error ?? 'Erro ao substituir.') }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="bg-[#19202d] px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-white font-bold text-sm">Editar laudo</p>
            <p className="text-gray-400 text-xs mt-0.5">{petNome}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
        </div>
        {done ? (
          <div className="p-6 text-center space-y-4">
            <div className="text-4xl">✅</div>
            <p className="font-semibold text-[#19202d]">PDF substituído com sucesso!</p>
            <div className="flex gap-3">
              <a href={`/laudo/${laudo.token}`} target="_blank" rel="noopener noreferrer"
                className="flex-1 bg-[#19202d] text-white font-semibold py-2.5 rounded-lg text-sm text-center hover:bg-[#232d3f] transition">
                Ver laudo
              </a>
              <button onClick={onClose}
                className="flex-1 border border-gray-200 text-gray-500 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition">
                Fechar
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <p className="text-xs text-gray-500">
              Selecione um novo PDF para substituir o laudo atual. O link público continua o mesmo.
            </p>
            <div onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition ${
                file ? 'border-[#8a6e36] bg-amber-50' : 'border-gray-200 hover:border-[#8a6e36] hover:bg-amber-50/40'
              }`}>
              {file ? (
                <>
                  <p className="text-2xl mb-1">📄</p>
                  <p className="font-semibold text-sm text-[#19202d]">{file.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{(file.size / 1024 / 1024).toFixed(2)} MB · clique para trocar</p>
                </>
              ) : (
                <>
                  <p className="text-2xl mb-1">📎</p>
                  <p className="text-sm text-gray-500 font-medium">Clique para selecionar o PDF</p>
                </>
              )}
            </div>
            <input ref={fileRef} type="file" accept=".pdf,application/pdf"
              onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f) }} className="hidden" />
            <div className="flex gap-2 text-xs">
              <a href={`/laudo/${laudo.token}`} target="_blank" rel="noopener noreferrer"
                className="text-[#8a6e36] hover:underline">
                Ver laudo atual →
              </a>
            </div>
            {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose}
                className="flex-1 border border-gray-200 text-gray-500 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition">
                Cancelar
              </button>
              <button type="submit" disabled={!file || loading}
                className="flex-1 bg-[#19202d] hover:bg-[#232d3f] text-white font-semibold py-2.5 rounded-lg text-sm transition disabled:opacity-40">
                {loading ? 'Enviando...' : 'Substituir PDF'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ── EditAgendamentoModal ───────────────────────────────────────────────────────

function EditAgendamentoModal({ ag, onClose, onSaved }: {
  ag:      Agendamento
  onClose: () => void
  onSaved: (updated: Partial<Agendamento>) => void
}) {
  const dataStr  = ag.data_hora.split('T')[0]
  const horaStr  = ag.encaixe ? '' : (ag.data_hora.split('T')[1] ?? '').substring(0, 5)

  const [data,      setData]      = useState(dataStr)
  const [hora,      setHora]      = useState(horaStr)
  const [formaPag,  setFormaPag]  = useState(ag.forma_pagamento ?? '')
  const [entrega,   setEntrega]   = useState(ag.entrega_pagamento ?? 'link')
  const [pagResp,   setPagResp]   = useState(ag.pagamento_responsavel ?? 'tutor')
  const [sedacao,   setSedacao]   = useState(ag.sedacao_necessaria ?? false)
  const [internado, setInternado] = useState(ag.pet_internado ?? false)
  const [vetId,     setVetId]     = useState(String(ag.veterinario_id ?? ''))
  const [obs,       setObs]       = useState(ag.observacoes ?? '')
  const [vets,      setVets]      = useState<{ id: number; nome: string }[]>([])
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')

  useEffect(() => { fetch('/api/veterinarios').then(r => r.ok ? r.json() : []).then(setVets) }, [])

  const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36] bg-white'

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    const dataHora = ag.encaixe ? `${data}T00:00:00` : `${data}T${hora}:00`
    const body: Record<string, unknown> = {
      data_hora: dataHora, forma_pagamento: formaPag || null,
      entrega_pagamento: entrega, pagamento_responsavel: pagResp,
      sedacao_necessaria: sedacao, pet_internado: internado,
      veterinario_id: vetId || '', observacoes: obs.trim() || null,
    }
    const res = await fetch(`/api/agendamentos/${ag.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (res.ok) { onSaved({ ...body, data_hora: dataHora }); onClose() }
    else { const d = await res.json(); setError(d.error ?? 'Erro ao salvar.') }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center px-4 py-6 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md my-auto overflow-hidden">
        <div className="bg-[#19202d] px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-white font-bold text-sm">Editar agendamento</p>
            <p className="text-gray-400 text-xs mt-0.5">{ag.pets?.nome ?? '—'} · #{ag.id}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
        </div>
        <form onSubmit={handleSave} className="p-5 space-y-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-500 mb-1">Data</label>
              <input type="date" value={data} onChange={e => setData(e.target.value)} required className={INPUT} />
            </div>
            {!ag.encaixe && (
              <div className="w-28">
                <label className="block text-xs font-semibold text-gray-500 mb-1">Hora</label>
                <input type="time" value={hora} onChange={e => setHora(e.target.value)} required className={INPUT} />
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Veterinário responsável</label>
            <select value={vetId} onChange={e => setVetId(e.target.value)} className={INPUT}>
              <option value="">Não informado</option>
              {vets.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
            </select>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-500 mb-1">Forma de pagamento</label>
              <select value={formaPag} onChange={e => setFormaPag(e.target.value)} className={INPUT}>
                <option value="">A confirmar</option>
                <option value="pix">Pix / Dinheiro</option>
                <option value="cartao_debito">Cartão débito</option>
                <option value="cartao_credito">Cartão crédito</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-500 mb-1">Entrega</label>
              <select value={entrega} onChange={e => setEntrega(e.target.value)} className={INPUT}>
                <option value="link">Por link</option>
                <option value="presencial">Presencial</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Pagamento responsável</label>
            <select value={pagResp} onChange={e => setPagResp(e.target.value)} className={INPUT}>
              <option value="tutor">Tutor</option>
              <option value="clinica">Clínica</option>
            </select>
          </div>
          <div className="flex gap-6">
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1.5">Sedação necessária?</p>
              <SimNaoBtn value={sedacao} onChange={setSedacao} />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1.5">Pet internado?</p>
              <SimNaoBtn value={internado} onChange={setInternado} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Observações</label>
            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2}
              className={INPUT + ' resize-none'} placeholder="Opcional" />
          </div>
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-500 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 bg-[#19202d] hover:bg-[#232d3f] text-white font-semibold py-2.5 rounded-lg text-sm transition disabled:opacity-40">
              {saving ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── NovoAgendamentoModal ───────────────────────────────────────────────────────

function NovoAgendamentoModal({ dataPadrao, onClose, onCreated }: {
  dataPadrao: string
  onClose:    () => void
  onCreated:  () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4 py-6 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-auto overflow-hidden">
        <div className="bg-[#19202d] px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-white font-bold text-sm">Novo agendamento</p>
            <p className="text-gray-400 text-xs mt-0.5">Cadastro manual</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
        </div>
        <AgendamentoForm modo="admin" dataPadrao={dataPadrao} onClose={onClose} onCreated={onCreated} />
      </div>
    </div>
  )
}

// ── DetalhesAgendamentoModal ───────────────────────────────────────────────────

function DetalhesAgendamentoModal({ ag, onClose, onEditar, onUpdated, laudosPermitidos }: {
  ag:               Agendamento
  onClose:          () => void
  onEditar:         (ag: Agendamento) => void
  onUpdated:        (id: number, updates: Partial<Agendamento>) => void
  laudosPermitidos: string[] | null  // null = sem restrição
}) {
  const [status,        setStatus]        = useState(ag.status)
  const [confirming,    setConfirming]    = useState(false)
  const [refusing,      setRefusing]      = useState(false)
  const [reenviarLink,  setReenviarLink]  = useState(false)
  const [confirmingPag, setConfirmingPag] = useState(false)
  const [editandoLaudo, setEditandoLaudo] = useState<{ laudo: { id: number; token: string }; petNome: string } | null>(null)

  useEffect(() => { setStatus(ag.status) }, [ag.status])

  const statusPag    = ag.status_pagamento
  const isClinica    = ag.pagamento_responsavel === 'clinica' || statusPag === 'pago_clinica' || ag.clinica_id != null
  const isPix        = isClinica || !ag.forma_pagamento?.includes('cartao')
  const exames       = ag.agendamento_exames ?? []
  const bioRows      = ag.agendamento_bioquimica ?? []

  // Um botão de emitir laudo por exame individual, filtrado pelas permissões do usuário
  const todosExames: string[] = exames.length > 0
    ? exames.map(e => e.tipo_exame)
    : ag.tipo_exame.split(',').map(s => s.trim()).filter(Boolean)
  const examesParaLaudo = laudosPermitidos === null
    ? todosExames
    : todosExames.filter(tipo =>
        laudosPermitidos.some(p => tipo.toLowerCase().includes(p.toLowerCase()) || p.toLowerCase().includes(tipo.toLowerCase()))
      )

  let totalExames = 0
  const examesComVal = exames.map(ex => {
    const isBio = ex.tipo_exame === 'Bioquímica' && bioRows.length > 0
    const val   = isBio ? bioRows.reduce((s, b) => s + Number(isPix ? b.valor_pix : b.valor_cartao), 0) : (ex.valor ?? 0)
    totalExames += val
    return { ...ex, val, isBio }
  })
  const repasse = totalExames > 0 ? totalExames : (ag.valor ?? 0)

  async function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const s = e.target.value; setStatus(s)
    await fetch(`/api/agendamentos/${ag.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: s }) })
    onUpdated(ag.id, { status: s })
  }
  async function handleConfirmar() {
    setConfirming(true)
    const res = await fetch(`/api/admin/agendamentos/${ag.id}/confirmar`, { method: 'POST' })
    if (res.ok) { setStatus('agendado'); onUpdated(ag.id, { status: 'agendado' }) }
    setConfirming(false)
  }
  async function handleRecusar() {
    const motivo = window.prompt('Motivo da recusa (opcional):')
    if (motivo === null) return
    setRefusing(true)
    const res = await fetch(`/api/admin/agendamentos/${ag.id}/recusar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motivo: motivo.trim() || null }) })
    if (res.ok) { setStatus('cancelado'); onUpdated(ag.id, { status: 'cancelado' }) }
    setRefusing(false)
  }
  async function handleCancelar() {
    const ok = window.confirm('Cancelar este agendamento? Esta ação não pode ser desfeita.')
    if (!ok) return
    const res = await fetch(`/api/agendamentos/${ag.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'cancelado' }) })
    if (res.ok) { setStatus('cancelado'); onUpdated(ag.id, { status: 'cancelado' }) }
  }
  async function handleConfirmarPagamento() {
    setConfirmingPag(true)
    const res = await fetch(`/api/admin/agendamentos/${ag.id}/confirmar-pagamento`, { method: 'POST' })
    if (res.ok) { const { status_pagamento } = await res.json(); onUpdated(ag.id, { status_pagamento }) }
    setConfirmingPag(false)
  }
  async function handleReenviarLink() {
    setReenviarLink(true)
    await fetch('/api/pagamentos/reenviar-link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agendamento_id: ag.id }) })
    setReenviarLink(false)
  }

  const LABEL = 'text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2'
  const SECTION = 'space-y-1.5'

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center px-0 sm:px-4">
        <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col">

          {/* Header */}
          <div className="bg-[#19202d] px-5 py-4 flex items-center justify-between rounded-t-2xl shrink-0">
            <div>
              <p className="text-white font-bold">{ag.pets?.nome ?? '—'}</p>
              <p className="text-gray-400 text-xs mt-0.5">
                {[ag.pets?.especie, ag.pets?.raca].filter(Boolean).join(' · ')}
                {ag.pets?.especie || ag.pets?.raca ? ' · ' : ''}#{ag.id}
              </p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
          </div>

          {/* Scrollable body */}
          <div className="overflow-y-auto flex-1 p-5 space-y-5">

            {/* Horário + tutor */}
            <div className="flex items-start gap-4">
              <div className="shrink-0 bg-[#19202d] text-white rounded-xl px-3 py-2.5 text-center min-w-[64px]">
                <p className="text-xl font-bold leading-none">{formatHora(ag.data_hora)}</p>
                {ag.duracao_minutos && <p className="text-[10px] text-gray-400 mt-0.5">{ag.duracao_minutos}min</p>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[#19202d]">{ag.tutores?.nome ?? 'Resp. legal não informado'}</p>
                {ag.tutores?.telefone && <p className="text-xs text-gray-400 mt-0.5">{ag.tutores.telefone}</p>}
                {ag.system_users && <p className="text-xs text-gray-400">por {ag.system_users.nome}</p>}
                {ag.clinicas && <p className="text-xs text-blue-600 font-semibold mt-0.5">🏥 {ag.clinicas.nome}</p>}
              </div>
            </div>

            {/* Badges */}
            <div className="flex flex-wrap gap-1.5">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${STATUS_COLORS[status] ?? STATUS_COLORS['agendado']}`}>
                {STATUS_LABELS[status] ?? status}
              </span>
              {ag.encaixe      && <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 border border-gray-200">Encaixe</span>}
              {ag.is_revisao   && <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-violet-100 text-violet-700 border border-violet-200">🔄 Revisão</span>}
              {ag.sedacao_necessaria && <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-orange-50 text-orange-700 border border-orange-200">💉 Sedação</span>}
              {ag.pet_internado && <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200">🏥 Internado</span>}
              {statusPag === 'pago' && <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">🟢 Pago</span>}
              {statusPag === 'pago_clinica' && <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">🔵 Pago (Clínica)</span>}
              {statusPag === 'a_receber' && ag.pagamento_responsavel === 'clinica' && <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">🔵 A receber (Clínica)</span>}
              {statusPag === 'a_receber' && ag.pagamento_responsavel !== 'clinica' && <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200">🟡 A receber</span>}
            </div>

            {ag.observacoes && (
              <p className="text-sm text-gray-500 italic border-l-2 border-gray-200 pl-3">{ag.observacoes}</p>
            )}

            {/* Exames */}
            <div>
              <p className={LABEL}>Exames</p>
              <div className={SECTION}>
                {exames.length === 0 ? (
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-semibold text-[#8a6e36] bg-amber-50 px-2 py-0.5 rounded">{ag.tipo_exame}</span>
                    {repasse > 0 && <span className="text-gray-600 font-medium tabular-nums">{formatBRL(repasse)}</span>}
                  </div>
                ) : (
                  <>
                    {examesComVal.map((ex, i) => (
                      <div key={i}>
                        <div className="flex justify-between items-center text-sm">
                          <span className="font-semibold text-[#8a6e36] bg-amber-50 px-2 py-0.5 rounded">{ex.tipo_exame}</span>
                          {ex.val > 0 && <span className="text-gray-600 font-medium tabular-nums">{formatBRL(ex.val)}</span>}
                        </div>
                        {ex.isBio && (
                          <div className="pl-3 mt-0.5 border-l-2 border-amber-200 space-y-0.5">
                            {bioRows.map(b => {
                              const nome = (b.bioquimica_exames as { nome: string } | null)?.nome ?? '—'
                              const bVal = Number(isPix ? b.valor_pix : b.valor_cartao)
                              return (
                                <p key={b.id} className="text-xs text-gray-500 flex justify-between gap-4">
                                  <span>• {nome}</span>
                                  {bVal > 0 && <span className="tabular-nums">{formatBRL(bVal)}</span>}
                                </p>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                    {exames.length > 1 && repasse > 0 && (
                      <div className="flex justify-between items-center pt-1 border-t border-gray-100 text-sm">
                        <span className="text-gray-400">Total</span>
                        <span className="font-bold text-gray-700 tabular-nums">{formatBRL(repasse)}</span>
                      </div>
                    )}
                    {isClinica && repasse > 0 && (
                      <div className="flex justify-between items-center bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-1.5 text-sm">
                        <span className="text-indigo-600 font-semibold">Repasse clínica</span>
                        <span className="text-indigo-700 font-bold tabular-nums">{formatBRL(repasse)}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Pagamento */}
            {ag.forma_pagamento && ag.forma_pagamento !== 'a confirmar' && (
              <div>
                <p className={LABEL}>Pagamento</p>
                <p className="text-sm text-gray-600 capitalize">{ag.forma_pagamento}</p>
              </div>
            )}

            {/* Ações de status */}
            <div>
              <p className={LABEL}>Alterar status</p>
              <div className="flex flex-wrap gap-2">
                <select value={status} onChange={handleStatusChange}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#8a6e36] cursor-pointer">
                  {(STATUS_TRANSITIONS[status] ?? Object.keys(STATUS_LABELS)).map(v => (
                    <option key={v} value={v}>{STATUS_LABELS[v]}</option>
                  ))}
                </select>
                {status !== 'cancelado' && status !== 'concluído' && (
                  <button onClick={handleCancelar}
                    className="border border-red-200 hover:bg-red-50 text-red-500 text-sm font-semibold px-3 py-1.5 rounded-lg transition">
                    Cancelar agendamento
                  </button>
                )}
              </div>

              {status === 'pendente' && (
                <div className="flex gap-2 mt-2">
                  <button onClick={handleConfirmar} disabled={confirming || refusing}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm font-bold px-3 py-2 rounded-lg transition disabled:opacity-50">
                    {confirming ? '...' : '✅ Confirmar'}
                  </button>
                  <button onClick={handleRecusar} disabled={confirming || refusing}
                    className="flex-1 bg-red-500 hover:bg-red-600 text-white text-sm font-bold px-3 py-2 rounded-lg transition disabled:opacity-50">
                    {refusing ? '...' : '❌ Recusar'}
                  </button>
                </div>
              )}

              {statusPag === 'a_receber' && status !== 'cancelado' && (
                <div className="flex gap-2 mt-2">
                  <button onClick={handleConfirmarPagamento} disabled={confirmingPag}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm font-bold px-3 py-2 rounded-lg transition disabled:opacity-50">
                    {confirmingPag ? '...' : ag.pagamento_responsavel === 'clinica' ? '💰 Clínica pagou' : '💰 Confirmar recebimento'}
                  </button>
                  {ag.mp_init_point && (
                    <button onClick={handleReenviarLink} disabled={reenviarLink}
                      className="border border-yellow-300 bg-yellow-50 hover:bg-yellow-100 text-yellow-700 text-sm font-semibold px-3 py-2 rounded-lg transition disabled:opacity-50">
                      {reenviarLink ? '...' : '🔔 Reenviar link'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Laudos */}
            <div>
              <p className={LABEL}>Laudos</p>

              {/* Laudos já emitidos */}
              {ag.laudos && ag.laudos.length > 0 && (
                <div className="space-y-1.5 mb-3">
                  {ag.laudos.map((l, i) => (
                    <div key={l.id} className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5">
                      <span className="text-sm font-medium text-[#19202d]">
                        📄 Laudo {ag.laudos!.length > 1 ? `#${i + 1}` : ''}
                        {examesParaLaudo[i] && (
                          <span className="text-xs text-gray-400 font-normal ml-1">— {examesParaLaudo[i]}</span>
                        )}
                      </span>
                      <div className="flex gap-3">
                        <a href={`/laudo/${l.token}`} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-[#8a6e36] font-bold hover:underline">Ver →</a>
                        <button onClick={() => setEditandoLaudo({ laudo: l, petNome: ag.pets?.nome ?? '' })}
                          className="text-xs text-gray-500 font-semibold hover:underline">Editar PDF</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Um botão de emitir por exame individual */}
              {status !== 'cancelado' && status !== 'pendente' && (
                <div className="space-y-2">
                  {examesParaLaudo.length > 0 ? examesParaLaudo.map((tipo, i) => {
                    const isBio = tipo.toLowerCase().includes('bioqu')
                    const href  = isBio
                      ? `/admin/novo-bioquimica?agendamento_id=${ag.id}`
                      : `/admin/novo?agendamento_id=${ag.id}`
                    return (
                      <Link key={i} href={href}
                        className={`flex items-center justify-between w-full font-bold text-sm px-4 py-3 rounded-xl transition ${
                          isBio
                            ? 'bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700'
                            : 'bg-[#c4a35a]/10 hover:bg-[#c4a35a]/20 border border-[#c4a35a]/40 text-[#8a6e36]'
                        }`}
                        onClick={onClose}>
                        <span>{isBio ? '🧪' : '📋'} Emitir laudo — {tipo}</span>
                        <span>→</span>
                      </Link>
                    )
                  }) : (
                    <Link href={`/admin/novo?agendamento_id=${ag.id}`}
                      className="flex items-center justify-between w-full bg-[#c4a35a]/10 hover:bg-[#c4a35a]/20 border border-[#c4a35a]/40 text-[#8a6e36] font-bold text-sm px-4 py-3 rounded-xl transition"
                      onClick={onClose}>
                      <span>📋 Emitir laudo</span>
                      <span>→</span>
                    </Link>
                  )}
                </div>
              )}

              {(!ag.laudos?.length && (status === 'cancelado' || status === 'pendente')) && (
                <p className="text-xs text-gray-400">Nenhum laudo emitido.</p>
              )}
            </div>
          </div>

          {/* Footer fixo */}
          <div className="px-5 py-4 border-t border-gray-100 flex gap-3 shrink-0">
            <button onClick={() => onEditar(ag)}
              className="flex-1 border border-gray-200 text-gray-600 font-semibold py-2.5 rounded-xl text-sm hover:bg-gray-50 transition">
              ✏️ Editar agendamento
            </button>
            <button onClick={onClose}
              className="flex-1 bg-[#19202d] text-white font-semibold py-2.5 rounded-xl text-sm hover:bg-[#232d3f] transition">
              Fechar
            </button>
          </div>
        </div>
      </div>

      {/* EditLaudoModal aninhado */}
      {editandoLaudo && (
        <EditLaudoModal
          laudo={editandoLaudo.laudo}
          petNome={editandoLaudo.petNome}
          onClose={() => setEditandoLaudo(null)}
        />
      )}
    </>
  )
}

// ── Página principal ───────────────────────────────────────────────────────────

export default function AgendaPage() {
  const router = useRouter()
  const hoje   = new Date().toLocaleDateString('en-CA')

  const [selectedDate, setSelectedDate] = useState(hoje)
  const [weekStart,    setWeekStart]    = useState(() => getSunday(new Date()))
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([])
  const [loading,      setLoading]      = useState(true)
  const [statusMap,    setStatusMap]    = useState<Record<number, string>>({})
  const [diasMap,      setDiasMap]      = useState<Record<string, number>>({})
  const [agMap,        setAgMap]        = useState<Record<number, Partial<Agendamento>>>({})
  const [novoModal,    setNovoModal]    = useState(false)
  const [detalhesAg,   setDetalhesAg]   = useState<Agendamento | null>(null)
  const [editingAg,    setEditingAg]    = useState<Agendamento | null>(null)
  const [laudosPermitidos, setLaudosPermitidos] = useState<string[] | null>(null)

  const fetchDias = useCallback(async () => {
    const inicio = toDateStr(weekStart)
    const fim    = toDateStr(addDays(weekStart, 6))
    const res = await fetch(`/api/agendamentos/dias?inicio=${inicio}&fim=${fim}`)
    if (res.ok) setDiasMap(await res.json())
  }, [weekStart])

  const fetchAgendamentos = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    const res = await fetch(`/api/agendamentos?data=${selectedDate}`)
    if (res.status === 401) { router.push('/login'); return }
    if (res.ok) {
      const rows: Agendamento[] = await res.json()
      setAgendamentos(rows)
      if (silent) {
        setAgMap(prev => {
          const next = { ...prev }
          rows.forEach(a => { next[a.id] = { ...(next[a.id] ?? {}), status_pagamento: a.status_pagamento } })
          return next
        })
      } else {
        setAgMap({})
        const map: Record<number, string> = {}
        rows.forEach(a => { map[a.id] = a.status })
        setStatusMap(map)
      }
    }
    if (!silent) setLoading(false)
  }, [selectedDate, router])

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(u => {
      if (!u) return
      if (u.role === 'admin') { setLaudosPermitidos(null); return }
      const exames = (u.permissoes as { laudos_exames?: string[] } | null)?.laudos_exames
      setLaudosPermitidos(exames && exames.length > 0 ? exames : null)
    })
  }, [])

  useEffect(() => { fetchDias() }, [fetchDias])
  useEffect(() => {
    fetchAgendamentos()
    const interval = setInterval(() => fetchAgendamentos(true), 30_000)
    return () => clearInterval(interval)
  }, [fetchAgendamentos])

  function selectDate(d: string) {
    setSelectedDate(d)
    const date = new Date(`${d}T12:00:00`)
    const sun  = getSunday(date)
    if (toDateStr(sun) !== toDateStr(weekStart)) setWeekStart(sun)
  }

  function getAg(ag: Agendamento): Agendamento {
    return { ...ag, ...(agMap[ag.id] ?? {}) }
  }

  function handleUpdated(id: number, updates: Partial<Agendamento>) {
    setAgMap(prev => ({ ...prev, [id]: { ...(prev[id] ?? {}), ...updates } }))
    if (updates.status) setStatusMap(prev => ({ ...prev, [id]: updates.status! }))
    // Atualiza detalhesAg se estiver aberto para este agendamento
    setDetalhesAg(prev => prev && prev.id === id ? { ...prev, ...updates } : prev)
  }

  // Monta os 7 dias da semana
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(weekStart, i)
    const str = toDateStr(d)
    return { str, day: d.getDate(), weekday: DIAS_SEMANA[d.getDay()], month: d.getMonth(), count: diasMap[str] ?? 0 }
  })

  const weekLabel = (() => {
    const s = weekDays[0], e = weekDays[6]
    return s.month === e.month
      ? `${s.day} a ${e.day} de ${MESES_CURTO[s.month]}`
      : `${s.day} ${MESES_CURTO[s.month]} — ${e.day} ${MESES_CURTO[e.month]}`
  })()

  const selectedDateObj = new Date(`${selectedDate}T12:00:00`)
  const fmtData = `${DIAS_SEMANA[selectedDateObj.getDay()]}, ${selectedDateObj.getDate()} de ${MESES_LONGO[selectedDateObj.getMonth()]} de ${selectedDateObj.getFullYear()}`
  const totalDia = agendamentos.length

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-4">

        {/* Calendário semanal */}
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="h-1 bg-gold-stripe" />
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <button onClick={() => setWeekStart(addDays(weekStart, -7))}
                className="p-2 hover:bg-gray-100 rounded-lg transition text-gray-500 text-lg leading-none">‹</button>
              <span className="text-sm font-semibold text-gray-600 capitalize">{weekLabel}</span>
              <button onClick={() => setWeekStart(addDays(weekStart, 7))}
                className="p-2 hover:bg-gray-100 rounded-lg transition text-gray-500 text-lg leading-none">›</button>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {weekDays.map(d => {
                const isSelected = d.str === selectedDate
                const isHoje     = d.str === hoje
                return (
                  <button key={d.str} onClick={() => selectDate(d.str)}
                    className={`flex flex-col items-center py-2.5 px-1 rounded-xl transition ${
                      isSelected ? 'bg-[#19202d] text-white shadow'
                      : isHoje ? 'bg-amber-50 border border-[#c4a35a]/50 text-[#8a6e36]'
                      : 'hover:bg-gray-50 text-gray-500'
                    }`}>
                    <span className={`text-[10px] font-semibold uppercase tracking-wide ${isSelected ? 'text-[#c4a35a]' : ''}`}>
                      {d.weekday}
                    </span>
                    <span className="text-base font-bold mt-0.5">{d.day}</span>
                    {d.count > 0
                      ? <span className="w-1.5 h-1.5 rounded-full mt-1 bg-[#c4a35a]" />
                      : <span className="w-1.5 h-1.5 mt-1 block" />
                    }
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Cabeçalho do dia */}
        <div className="flex items-center justify-between px-1">
          <div>
            <h2 className="text-base font-bold text-[#19202d] capitalize">{fmtData}</h2>
            {!loading && (
              <p className="text-xs text-gray-400 mt-0.5">
                {totalDia === 0 ? 'Sem agendamentos' : `${totalDia} agendamento${totalDia > 1 ? 's' : ''}`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {selectedDate !== hoje && (
              <button onClick={() => selectDate(hoje)} className="text-xs text-[#8a6e36] font-semibold hover:underline">
                Ir para hoje →
              </button>
            )}
            <button onClick={() => setNovoModal(true)}
              className="bg-[#19202d] hover:bg-[#232d3f] text-white text-xs font-bold px-4 py-2 rounded-lg transition">
              + Novo agendamento
            </button>
          </div>
        </div>

        {/* Lista de agendamentos */}
        {loading ? (
          <div className="text-center py-12 text-gray-400">Carregando...</div>
        ) : agendamentos.length === 0 ? (
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="h-1 bg-gold-stripe" />
            <div className="text-center py-12 text-gray-400">
              <p className="text-3xl mb-2">📅</p>
              <p className="font-medium text-sm">Nenhum agendamento neste dia</p>
              <p className="text-xs mt-1">Os agendamentos feitos pelo WhatsApp aparecem aqui automaticamente</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {[...agendamentos]
              .sort((a, b) => {
                const aPend = (statusMap[a.id] ?? a.status) === 'pendente' ? 0 : 1
                const bPend = (statusMap[b.id] ?? b.status) === 'pendente' ? 0 : 1
                if (aPend !== bPend) return aPend - bPend
                return a.data_hora.localeCompare(b.data_hora)
              })
              .map(rawAg => {
                const ag     = getAg(rawAg)
                const status = statusMap[ag.id] ?? ag.status
                const exames = ag.agendamento_exames ?? []

                return (
                  <div key={ag.id}
                    className="bg-white rounded-xl border shadow-sm overflow-hidden cursor-pointer hover:border-[#c4a35a]/50 hover:shadow-md transition"
                    onClick={() => setDetalhesAg(rawAg)}>
                    <div className="h-1 bg-gold-stripe" />
                    <div className="p-4 flex items-center gap-3">

                      {/* Hora */}
                      <div className="shrink-0 bg-[#19202d] text-white rounded-xl px-3 py-2.5 text-center min-w-[58px]">
                        <p className="text-lg font-bold leading-none">{formatHora(ag.data_hora)}</p>
                        {ag.duracao_minutos && (
                          <p className="text-[10px] text-gray-400 mt-0.5">{ag.duracao_minutos}min</p>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          <span className="font-bold text-[#19202d] text-[15px] truncate">
                            {ag.pets?.nome ?? '—'}
                          </span>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLORS[status] ?? STATUS_COLORS['agendado']}`}>
                            {STATUS_LABELS[status] ?? status}
                          </span>
                          {ag.encaixe    && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">Encaixe</span>}
                          {ag.is_revisao && <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">🔄</span>}
                        </div>

                        {/* Exames como pills */}
                        <div className="flex flex-wrap gap-1 mb-1">
                          {exames.length > 0
                            ? exames.map((ex, i) => (
                                <span key={i} className="text-xs font-semibold text-[#8a6e36] bg-amber-50 px-2 py-0.5 rounded">
                                  {ex.tipo_exame}
                                </span>
                              ))
                            : <span className="text-xs font-semibold text-[#8a6e36] bg-amber-50 px-2 py-0.5 rounded">
                                {ag.tipo_exame}
                              </span>
                          }
                        </div>

                        <p className="text-xs text-gray-400 truncate">
                          {ag.tutores?.nome ?? 'Tutor não informado'}
                          {ag.clinicas ? ` · ${ag.clinicas.nome}` : ''}
                        </p>
                      </div>

                      {/* Indicadores + chevron */}
                      <div className="flex flex-col items-end gap-1 shrink-0 ml-1">
                        {ag.laudos && ag.laudos.length > 0 && (
                          <span className="text-[11px] text-green-600 font-semibold whitespace-nowrap">
                            📄 {ag.laudos.length} laudo{ag.laudos.length > 1 ? 's' : ''}
                          </span>
                        )}
                        {ag.status_pagamento === 'pago' && <span className="text-[11px] text-green-500">🟢</span>}
                        {ag.status_pagamento === 'a_receber' && <span className="text-[11px] text-yellow-500">🟡</span>}
                        {ag.sedacao_necessaria && <span className="text-[11px]">💉</span>}
                        <span className="text-gray-300 text-xl leading-none">›</span>
                      </div>
                    </div>
                  </div>
                )
              })}
          </div>
        )}
      </main>

      {novoModal && (
        <NovoAgendamentoModal
          dataPadrao={selectedDate}
          onClose={() => setNovoModal(false)}
          onCreated={() => { fetchAgendamentos(); fetchDias() }}
        />
      )}

      {detalhesAg && (
        <DetalhesAgendamentoModal
          ag={getAg(detalhesAg)}
          onClose={() => setDetalhesAg(null)}
          onEditar={ag => { setDetalhesAg(null); setEditingAg(ag) }}
          onUpdated={handleUpdated}
          laudosPermitidos={laudosPermitidos}
        />
      )}

      {editingAg && (
        <EditAgendamentoModal
          ag={editingAg}
          onClose={() => setEditingAg(null)}
          onSaved={updated => {
            handleUpdated(editingAg.id, updated)
            setEditingAg(null)
          }}
        />
      )}
    </div>
  )
}
