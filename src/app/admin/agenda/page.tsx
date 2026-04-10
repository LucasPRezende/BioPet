'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'


interface Tutor { id: number; nome: string | null; telefone: string }
interface Pet   { id: number; nome: string; especie: string | null; raca: string | null }

interface Agendamento {
  id:              number
  tipo_exame:      string
  data_hora:       string
  duracao_minutos: number | null
  valor:           number | null
  forma_pagamento: string | null
  status:          string
  observacoes:     string | null
  tutores:         Tutor | null
  pets:            Pet | null
  system_users:    { nome: string } | null
  laudos:          { id: number; token: string }[] | null
}

const STATUS_LABELS: Record<string, string> = {
  'agendado':       'Agendado',
  'em atendimento': 'Em atendimento',
  'concluído':      'Concluído',
  'cancelado':      'Cancelado',
}
const STATUS_COLORS: Record<string, string> = {
  'agendado':       'bg-blue-100 text-blue-700 border-blue-200',
  'em atendimento': 'bg-amber-100 text-amber-700 border-amber-200',
  'concluído':      'bg-green-100 text-green-700 border-green-200',
  'cancelado':      'bg-red-100 text-red-600 border-red-200',
}
// Transições permitidas — concluído e cancelado são estados finais
const STATUS_TRANSITIONS: Record<string, string[]> = {
  'agendado':       ['agendado', 'em atendimento', 'concluído', 'cancelado'],
  'em atendimento': ['agendado', 'em atendimento', 'concluído', 'cancelado'],
  'concluído':      ['concluído'],
  'cancelado':      ['cancelado'],
}
const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MESES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const MESES_LONGO = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']

function toDateStr(d: Date): string {
  return d.toLocaleDateString('en-CA')
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}
function getSunday(d: Date): Date {
  const r = new Date(d); r.setDate(r.getDate() - r.getDay()); return r
}
// Extrai "HH:MM" direto da string sem converter timezone
function formatHora(iso: string): string {
  return iso.includes('T') ? iso.split('T')[1].substring(0, 5) : iso.substring(0, 5)
}
function formatBRL(n: number | null): string {
  if (n == null) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function StatusSelect({ id, current, onChange }: { id: number; current: string; onChange: (s: string) => void }) {
  const [loading, setLoading] = useState(false)
  const allowed = STATUS_TRANSITIONS[current] ?? Object.keys(STATUS_LABELS)
  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const s = e.target.value; setLoading(true)
    await fetch(`/api/agendamentos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: s }),
    })
    onChange(s); setLoading(false)
  }
  return (
    <select value={current} onChange={handleChange} disabled={loading}
      className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#8a6e36] disabled:opacity-60 cursor-pointer">
      {allowed.map(v => <option key={v} value={v}>{STATUS_LABELS[v]}</option>)}
    </select>
  )
}

const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36] bg-white'

interface Comissao {
  tipo_exame: string
  preco_exame: number | null
  varia_por_horario: boolean
  preco_pix_comercial: number | null
  preco_cartao_comercial: number | null
  preco_pix_fora_horario: number | null
  preco_cartao_fora_horario: number | null
  duracao_minutos: number | null
}

interface VetOpt { id: number; nome: string }

const FERIADOS_NACIONAIS = [
  '01-01','21-04','01-05','07-09','12-10','02-11','15-11','25-12'
]

function isForaHorario(data: string, hora: string): boolean {
  if (!data || !hora) return false
  const d = new Date(`${data}T12:00:00`)
  const dow = d.getDay()
  if (dow === 0 || dow === 6) return true // fim de semana
  const mmdd = data.slice(5) // MM-DD
  if (FERIADOS_NACIONAIS.includes(mmdd)) return true
  const h = parseInt(hora.split(':')[0])
  return h < 8 || h >= 18
}

function isFimDeSemana(data: string): boolean {
  if (!data) return false
  const d = new Date(`${data}T12:00:00`)
  return d.getDay() === 0 || d.getDay() === 6
}

function isFeriado(data: string): boolean {
  if (!data) return false
  return FERIADOS_NACIONAIS.includes(data.slice(5))
}

function calcularValor(
  comissao: Comissao | null,
  forma: string,
  data: string,
  hora: string,
): string {
  if (!comissao) return ''
  if (!comissao.varia_por_horario) {
    return comissao.preco_exame != null ? String(comissao.preco_exame) : ''
  }
  const fora = isForaHorario(data, hora)
  if (forma === 'pix' || forma === 'dinheiro') {
    const v = fora ? comissao.preco_pix_fora_horario : comissao.preco_pix_comercial
    return v != null ? String(v) : ''
  }
  if (forma === 'cartão') {
    const v = fora ? comissao.preco_cartao_fora_horario : comissao.preco_cartao_comercial
    return v != null ? String(v) : ''
  }
  return comissao.preco_exame != null ? String(comissao.preco_exame) : ''
}

function NovoPetInline({ tutorId, onCreated }: {
  tutorId: number
  onCreated: (pet: { id: number; nome: string; especie: string | null }) => void
}) {
  const [nome,    setNome]    = useState('')
  const [especie, setEspecie] = useState('')
  const [saving,  setSaving]  = useState(false)
  const [err,     setErr]     = useState('')

  async function save() {
    if (!nome.trim()) { setErr('Informe o nome do pet.'); return }
    setSaving(true); setErr('')
    const res = await fetch(`/api/tutores/${tutorId}/pets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: nome.trim(), especie: especie || null }),
    })
    if (res.ok) {
      onCreated(await res.json())
    } else {
      const d = await res.json()
      setErr(d.error ?? 'Erro ao cadastrar pet.')
    }
    setSaving(false)
  }

  return (
    <div className="mt-2 p-3 bg-amber-50 border border-[#8a6e36]/20 rounded-lg space-y-2">
      <p className="text-xs font-semibold text-[#8a6e36]">Novo pet</p>
      <div className="flex gap-2">
        <input type="text" value={nome} onChange={e => setNome(e.target.value)}
          placeholder="Nome do pet" autoFocus
          className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36] bg-white" />
        <select value={especie} onChange={e => setEspecie(e.target.value)}
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36] bg-white">
          <option value="">Espécie</option>
          {['Cachorro','Gato','Pássaro','Coelho','Hamster','Réptil','Outro'].map(s => <option key={s}>{s}</option>)}
        </select>
        <button type="button" onClick={save} disabled={saving}
          className="shrink-0 px-3 py-1.5 bg-[#19202d] text-white text-xs font-semibold rounded-lg hover:bg-[#232d3f] transition disabled:opacity-50">
          {saving ? '...' : 'Salvar'}
        </button>
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  )
}

function NovoVetInline({ onCreated, onCancel }: {
  onCreated: (vet: VetOpt) => void
  onCancel:  () => void
}) {
  const [nome,     setNome]     = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [saving,   setSaving]   = useState(false)
  const [err,      setErr]      = useState('')

  async function save() {
    if (!nome.trim()) { setErr('Informe o nome.'); return }
    setSaving(true); setErr('')
    const digits = whatsapp.replace(/\D/g, '')
    const wa     = digits ? (digits.startsWith('55') ? digits : `55${digits}`) : undefined
    const res = await fetch('/api/veterinarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: nome.trim(), whatsapp: wa }),
    })
    if (res.ok) {
      onCreated(await res.json())
    } else {
      const d = await res.json()
      setErr(d.error ?? 'Erro ao cadastrar veterinário.')
    }
    setSaving(false)
  }

  return (
    <div className="mt-2 p-3 bg-amber-50 border border-[#8a6e36]/20 rounded-lg space-y-2">
      <p className="text-xs font-semibold text-[#8a6e36]">Novo veterinário</p>
      <input type="text" value={nome} onChange={e => setNome(e.target.value)}
        placeholder="Nome completo" autoFocus
        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36] bg-white" />
      <input type="tel" value={whatsapp} onChange={e => setWhatsapp(e.target.value)}
        placeholder="WhatsApp (ex: 24999990001)"
        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36] bg-white" />
      <p className="text-[10px] text-gray-400">O e-mail é definido pelo próprio vet no primeiro acesso.</p>
      {err && <p className="text-xs text-red-600">{err}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel}
          className="flex-1 border border-gray-200 text-gray-500 py-1.5 rounded-lg text-xs hover:bg-gray-50 transition">
          Cancelar
        </button>
        <button type="button" onClick={save} disabled={saving}
          className="flex-1 bg-[#19202d] text-white text-xs font-semibold py-1.5 rounded-lg hover:bg-[#232d3f] transition disabled:opacity-50">
          {saving ? 'Salvando...' : 'Cadastrar'}
        </button>
      </div>
    </div>
  )
}

function NovoAgendamentoModal({ dataPadrao, tiposExame, vets, comissoes, onClose, onCreated }: {
  dataPadrao: string
  tiposExame: string[]
  vets:       VetOpt[]
  comissoes:  Comissao[]
  onClose:    () => void
  onCreated:  () => void
}) {
  const [form, setForm] = useState({
    telefone:        '',
    tutor_nome:      '',
    pet_nome:        '',
    pet_especie:     '',
    pet_raca:        '',
    tipo_exame:      '',
    data:            dataPadrao,
    hora:            '',
    duracao_minutos: '30',
    valor:           '',
    forma_pagamento: 'a confirmar',
    veterinario_id:  '',
    observacoes:     '',
  })
  const [buscando,    setBuscando]    = useState(false)
  const [tutorInfo,   setTutorInfo]   = useState<{ id?: number; nome: string | null; encontrado: boolean; pets: { id: number; nome: string; especie: string | null }[] } | null>(null)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [valorManual, setValorManual] = useState(false)
  const [novoPetOpen, setNovoPetOpen] = useState(false)
  const [novoVetOpen, setNovoVetOpen] = useState(false)
  const [extraVets,   setExtraVets]   = useState<VetOpt[]>([])
  const allVets = [...vets, ...extraVets]

  function set(k: string, v: string) { setForm(p => ({ ...p, [k]: v })) }

  // Auto-preenche valor quando exame/pagamento/data/hora mudam
  function recalcularValor(patch: Partial<typeof form>) {
    if (valorManual) return
    const merged = { ...form, ...patch }
    const comissao = comissoes.find(c => c.tipo_exame === merged.tipo_exame) ?? null
    const v = calcularValor(comissao, merged.forma_pagamento, merged.data, merged.hora)
    if (v) setForm(p => ({ ...p, ...patch, valor: v }))
    else   setForm(p => ({ ...p, ...patch }))
  }

  // Auto-preenche duração quando muda o exame
  function handleTipoExameChange(tipo: string) {
    const comissao = comissoes.find(c => c.tipo_exame === tipo)
    const dur = comissao?.duracao_minutos ? String(comissao.duracao_minutos) : form.duracao_minutos
    recalcularValor({ tipo_exame: tipo, duracao_minutos: dur })
  }

  async function buscarTutor() {
    if (!form.telefone.trim()) return
    setBuscando(true)
    try {
      const digits = form.telefone.replace(/\D/g, '')
      const tel    = digits.startsWith('55') ? digits : `55${digits}`
      const res = await fetch(
        `/api/agente/contexto?telefone=${tel}`,
        { headers: { 'x-api-key': 'biopet_agent_2026' } },
      )
      if (res.ok) {
        const d = await res.json()
        const encontrado = !!d.tutor
        setTutorInfo({ id: d.tutor?.id, nome: d.tutor?.nome ?? null, encontrado, pets: d.pets ?? [] })
        if (d.tutor?.nome) set('tutor_nome', d.tutor.nome)
      } else {
        setTutorInfo({ nome: null, encontrado: false, pets: [] })
      }
    } catch {
      setTutorInfo({ nome: null, encontrado: false, pets: [] })
    }
    setNovoPetOpen(false)
    setBuscando(false)
  }

  function selecionarPet(pet: { nome: string; especie: string | null }) {
    set('pet_nome', pet.nome)
    set('pet_especie', pet.especie ?? '')
  }

  const avisoData = form.data
    ? isFeriado(form.data)
      ? '⚠️ Feriado nacional'
      : isFimDeSemana(form.data)
      ? '⚠️ Fim de semana'
      : null
    : null

  const foraHorario  = form.data && form.hora ? isForaHorario(form.data, form.hora) : false
  const hoje_str     = new Date().toLocaleDateString('en-CA')
  const isPastDate   = form.data ? form.data < hoje_str : false

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.hora) { setError('Informe o horário.'); return }
    setLoading(true); setError('')

    const data_hora = `${form.data}T${form.hora}:00`

    const res = await fetch('/api/admin/agendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telefone:        form.telefone.trim(),
        tutor_nome:      form.tutor_nome.trim() || null,
        pet_nome:        form.pet_nome.trim(),
        pet_especie:     form.pet_especie.trim() || null,
        pet_raca:        form.pet_raca.trim() || null,
        tipo_exame:      form.tipo_exame,
        data_hora,
        duracao_minutos: form.duracao_minutos ? Number(form.duracao_minutos) : null,
        valor:           form.valor ? Number(form.valor) : null,
        forma_pagamento: form.forma_pagamento || 'a confirmar',
        veterinario_id:  form.veterinario_id ? Number(form.veterinario_id) : null,
        observacoes:     form.observacoes.trim() || null,
      }),
    })

    if (res.ok) { onCreated(); onClose() }
    else { const d = await res.json(); setError(d.error ?? 'Erro ao criar agendamento.') }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4 py-6 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md my-auto overflow-hidden">
        <div className="bg-[#19202d] px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-white font-bold text-sm">Novo agendamento</p>
            <p className="text-gray-400 text-xs mt-0.5">Cadastro manual</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">

          {/* Tutor */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
              Telefone do tutor <span className="text-red-400">*</span>
            </label>
            <div className="flex gap-2">
              <input type="tel" value={form.telefone}
                onChange={e => { set('telefone', e.target.value); setTutorInfo(null) }}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), buscarTutor())}
                placeholder="5524999990001" required className={INPUT} />
              <button type="button" onClick={buscarTutor} disabled={buscando || !form.telefone}
                className="shrink-0 px-3 py-2 bg-amber-50 border border-[#8a6e36]/30 text-[#8a6e36] rounded-lg text-xs font-semibold hover:bg-amber-100 transition disabled:opacity-50">
                {buscando ? '...' : 'Buscar'}
              </button>
            </div>
            {tutorInfo && (
              <p className={`text-xs mt-1.5 px-2 py-1 rounded ${tutorInfo.encontrado ? 'text-green-700 bg-green-50' : 'text-amber-700 bg-amber-50'}`}>
                {tutorInfo.encontrado
                  ? `✓ ${tutorInfo.nome ?? 'Tutor'} encontrado`
                  : '✦ Tutor não cadastrado — será criado automaticamente'}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Nome do tutor</label>
            <input type="text" value={form.tutor_nome} onChange={e => set('tutor_nome', e.target.value)}
              placeholder="Ex: Maria Souza" className={INPUT} />
          </div>

          {/* Pet */}
          {tutorInfo && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  {tutorInfo.pets.length > 0 ? 'Pets cadastrados' : 'Pets'}
                </label>
                {tutorInfo.encontrado && (
                  <button type="button" onClick={() => setNovoPetOpen(v => !v)}
                    className="text-xs px-2 py-0.5 rounded border border-dashed border-[#8a6e36]/40 text-[#8a6e36] hover:bg-amber-50 transition">
                    {novoPetOpen ? '✕ cancelar' : '+ novo pet'}
                  </button>
                )}
              </div>
              {tutorInfo.pets.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {tutorInfo.pets.map(p => (
                    <button key={p.id} type="button" onClick={() => { selecionarPet(p); setNovoPetOpen(false) }}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition ${
                        form.pet_nome === p.nome
                          ? 'bg-[#19202d] text-white border-[#19202d]'
                          : 'border-gray-200 hover:border-[#8a6e36] hover:bg-amber-50'
                      }`}>
                      {p.nome}{p.especie ? ` (${p.especie})` : ''}
                    </button>
                  ))}
                </div>
              )}
              {novoPetOpen && tutorInfo.encontrado && tutorInfo.id && (
                <NovoPetInline
                  tutorId={tutorInfo.id}
                  onCreated={pet => {
                    setTutorInfo(t => t ? { ...t, pets: [...t.pets, pet] } : t)
                    selecionarPet(pet)
                    setNovoPetOpen(false)
                  }}
                />
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                Nome do pet <span className="text-red-400">*</span>
              </label>
              <input type="text" value={form.pet_nome} onChange={e => set('pet_nome', e.target.value)}
                placeholder="Ex: Thor" required className={INPUT} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Espécie</label>
              <select value={form.pet_especie} onChange={e => set('pet_especie', e.target.value)} className={INPUT}>
                <option value="">—</option>
                {['Cachorro','Gato','Pássaro','Coelho','Hamster','Réptil','Outro'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Exame */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
              Tipo de exame <span className="text-red-400">*</span>
            </label>
            <select value={form.tipo_exame}
              onChange={e => handleTipoExameChange(e.target.value)}
              required className={INPUT}>
              <option value="">Selecione...</option>
              {tiposExame.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>

          {/* Data e hora */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                Data <span className="text-red-400">*</span>
              </label>
              <input type="date" value={form.data}
                onChange={e => recalcularValor({ data: e.target.value })}
                required className={INPUT} />
              {isPastDate && (
                <p className="text-xs text-red-500 mt-1">⚠️ Data no passado</p>
              )}
              {!isPastDate && avisoData && (
                <p className="text-xs text-amber-600 mt-1">{avisoData} — preço fora do horário pode ser aplicado</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                Horário <span className="text-red-400">*</span>
              </label>
              <input type="time" value={form.hora}
                onChange={e => recalcularValor({ hora: e.target.value })}
                required className={INPUT} />
              {foraHorario && !avisoData && (
                <p className="text-xs text-amber-600 mt-1">⚠️ Fora do horário comercial</p>
              )}
            </div>
          </div>

          {/* Veterinário */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Veterinário responsável</label>
            <div className="flex gap-2">
              <select
                value={form.veterinario_id}
                onChange={e => { set('veterinario_id', e.target.value); setNovoVetOpen(false) }}
                className={INPUT + ' flex-1'}
              >
                <option value="">— Sem veterinário</option>
                {allVets.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
              </select>
              <button
                type="button"
                onClick={() => {
                  if (!novoVetOpen) set('veterinario_id', '') // deseleciona ao abrir
                  setNovoVetOpen(v => !v)
                }}
                className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-lg border transition text-lg font-bold ${
                  novoVetOpen
                    ? 'border-red-300 text-red-400 hover:bg-red-50'
                    : 'border-dashed border-[#8a6e36]/40 text-[#8a6e36] hover:bg-amber-50'
                }`}
                title={novoVetOpen ? 'Cancelar' : 'Novo veterinário'}
              >
                {novoVetOpen ? '×' : '+'}
              </button>
            </div>
            {novoVetOpen && (
              <NovoVetInline
                onCreated={vet => {
                  setExtraVets(v => [...v, vet])
                  set('veterinario_id', String(vet.id))
                  setNovoVetOpen(false)
                }}
                onCancel={() => setNovoVetOpen(false)}
              />
            )}
          </div>

          {/* Forma de pagamento + valor */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Forma de pagamento</label>
              <select value={form.forma_pagamento}
                onChange={e => recalcularValor({ forma_pagamento: e.target.value })}
                className={INPUT}>
                {['a confirmar','pix','dinheiro','cartão'].map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                Valor (R$)
                {form.valor && !valorManual && <span className="ml-1 text-[10px] text-[#8a6e36]">sugerido</span>}
              </label>
              <input type="number" min="0" step="0.01" value={form.valor}
                onChange={e => { setValorManual(true); set('valor', e.target.value) }}
                placeholder="0,00" className={INPUT} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Duração (min)</label>
            <input type="number" min="5" value={form.duracao_minutos} onChange={e => set('duracao_minutos', e.target.value)}
              placeholder="30" className={INPUT} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Observações</label>
            <textarea value={form.observacoes} onChange={e => set('observacoes', e.target.value)}
              rows={2} placeholder="Ex: Animal em jejum de 6h" className={INPUT + ' resize-none'} />
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-500 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 bg-[#19202d] hover:bg-[#232d3f] text-white font-semibold py-2.5 rounded-lg text-sm transition disabled:opacity-60">
              {loading ? 'Agendando...' : 'Criar agendamento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

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
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
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

            <div
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition ${
                file ? 'border-[#8a6e36] bg-amber-50' : 'border-gray-200 hover:border-[#8a6e36] hover:bg-amber-50/40'
              }`}
            >
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

export default function AgendaPage() {
  const router = useRouter()
  const hoje   = new Date().toLocaleDateString('en-CA')

  const [selectedDate, setSelectedDate]               = useState(hoje)
  const [weekStart,    setWeekStart]                  = useState(() => getSunday(new Date()))
  const [agendamentos, setAgendamentos]               = useState<Agendamento[]>([])
  const [loading,      setLoading]                    = useState(true)
  const [statusMap,    setStatusMap]                  = useState<Record<number, string>>({})
  const [diasMap,      setDiasMap]                    = useState<Record<string, number>>({})
  const [editandoLaudo,   setEditandoLaudo]            = useState<{ laudo: { id: number; token: string }; petNome: string } | null>(null)
  const [agMap,           setAgMap]                   = useState<Record<number, Partial<Agendamento>>>({})
  const [novoModal,       setNovoModal]               = useState(false)
  const [tiposExame,      setTiposExame]              = useState<string[]>([])
  const [comissoes,       setComissoes]               = useState<Comissao[]>([])
  const [vets,            setVets]                    = useState<VetOpt[]>([])

  // Busca quais dias da semana têm agendamentos
  const fetchDias = useCallback(async () => {
    const inicio = toDateStr(weekStart)
    const fim    = toDateStr(addDays(weekStart, 6))
    const res = await fetch(`/api/agendamentos/dias?inicio=${inicio}&fim=${fim}`)
    if (res.ok) setDiasMap(await res.json())
  }, [weekStart])

  // Busca agendamentos do dia selecionado
  const fetchAgendamentos = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/agendamentos?data=${selectedDate}`)
    if (res.status === 401) { router.push('/login'); return }
    if (res.ok) {
      const rows: Agendamento[] = await res.json()
      setAgendamentos(rows)
      const map: Record<number, string> = {}
      rows.forEach(a => { map[a.id] = a.status })
      setStatusMap(map)
    }
    setLoading(false)
  }, [selectedDate, router])

  useEffect(() => { fetchDias() }, [fetchDias])
  useEffect(() => { fetchAgendamentos() }, [fetchAgendamentos])
  useEffect(() => {
    fetch('/api/comissoes').then(r => r.ok ? r.json() : [])
      .then((d: Comissao[]) => {
        setComissoes(d)
        setTiposExame(d.map(c => c.tipo_exame))
      })
    fetch('/api/veterinarios').then(r => r.ok ? r.json() : [])
      .then((d: VetOpt[]) => setVets(d))
  }, [])

  function selectDate(d: string) {
    setSelectedDate(d)
    // Atualiza semana se necessário
    const date = new Date(`${d}T12:00:00`)
    const sun  = getSunday(date)
    if (toDateStr(sun) !== toDateStr(weekStart)) setWeekStart(sun)
  }

  function handleStatusChange(id: number, s: string) {
    setStatusMap(prev => ({ ...prev, [id]: s }))
  }

  function getAg(ag: Agendamento): Agendamento {
    return { ...ag, ...(agMap[ag.id] ?? {}) }
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

            {/* Navegação de semana */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => { const s = addDays(weekStart, -7); setWeekStart(s) }}
                className="p-2 hover:bg-gray-100 rounded-lg transition text-gray-500 text-lg leading-none"
              >‹</button>
              <span className="text-sm font-semibold text-gray-600 capitalize">{weekLabel}</span>
              <button
                onClick={() => { const s = addDays(weekStart, 7); setWeekStart(s) }}
                className="p-2 hover:bg-gray-100 rounded-lg transition text-gray-500 text-lg leading-none"
              >›</button>
            </div>

            {/* Strip de dias */}
            <div className="grid grid-cols-7 gap-1">
              {weekDays.map(d => {
                const isSelected = d.str === selectedDate
                const isHoje     = d.str === hoje
                return (
                  <button
                    key={d.str}
                    onClick={() => selectDate(d.str)}
                    className={`flex flex-col items-center py-2.5 px-1 rounded-xl transition ${
                      isSelected
                        ? 'bg-[#19202d] text-white shadow'
                        : isHoje
                        ? 'bg-amber-50 border border-[#c4a35a]/50 text-[#8a6e36]'
                        : 'hover:bg-gray-50 text-gray-500'
                    }`}
                  >
                    <span className={`text-[10px] font-semibold uppercase tracking-wide ${isSelected ? 'text-[#c4a35a]' : ''}`}>
                      {d.weekday}
                    </span>
                    <span className="text-base font-bold mt-0.5">{d.day}</span>
                    {d.count > 0 ? (
                      <span className={`w-1.5 h-1.5 rounded-full mt-1 ${isSelected ? 'bg-[#c4a35a]' : 'bg-[#c4a35a]'}`} />
                    ) : (
                      <span className="w-1.5 h-1.5 mt-1 block" />
                    )}
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
            <button
              onClick={() => setNovoModal(true)}
              className="bg-[#19202d] hover:bg-[#232d3f] text-white text-xs font-bold px-4 py-2 rounded-lg transition"
            >
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
          <div className="space-y-3">
            {agendamentos.map(rawAg => {
              const ag     = getAg(rawAg)
              const status = statusMap[ag.id] ?? ag.status
              return (
                <div key={ag.id} className="bg-white rounded-xl border shadow-sm overflow-hidden">
                  <div className="h-1 bg-gold-stripe" />
                  <div className="p-4 sm:p-5">
                    <div className="flex flex-wrap items-start gap-4">

                      {/* Horário */}
                      <div className="shrink-0 bg-[#19202d] text-white rounded-xl px-3 py-2.5 text-center min-w-[58px]">
                        <p className="text-lg font-bold leading-none">{formatHora(ag.data_hora)}</p>
                        {ag.duracao_minutos && (
                          <p className="text-[10px] text-gray-400 mt-0.5">{ag.duracao_minutos}min</p>
                        )}
                      </div>

                      {/* Dados principais */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-bold text-[#19202d] text-[15px]">
                            {ag.pets?.nome ?? '—'}
                          </span>
                          {ag.pets?.especie && (
                            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                              {ag.pets.especie}{ag.pets.raca ? ` · ${ag.pets.raca}` : ''}
                            </span>
                          )}
                          <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${STATUS_COLORS[status] ?? STATUS_COLORS['agendado']}`}>
                            {STATUS_LABELS[status] ?? status}
                          </span>
                        </div>

                        <p className="text-sm text-gray-600 mb-1.5">
                          <span className="font-medium">{ag.tutores?.nome ?? 'Tutor não informado'}</span>
                          {ag.tutores?.telefone && (
                            <span className="text-gray-400 ml-2 text-xs">{ag.tutores.telefone}</span>
                          )}
                        </p>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                          <span className="font-semibold text-[#8a6e36] bg-amber-50 px-2 py-0.5 rounded">
                            {ag.tipo_exame}
                          </span>
                          {ag.valor != null && <span className="font-medium">{formatBRL(ag.valor)}</span>}
                          {ag.forma_pagamento && ag.forma_pagamento !== 'a confirmar' && (
                            <span className="capitalize">{ag.forma_pagamento}</span>
                          )}
                          {ag.system_users && (
                            <span className="text-gray-400">por {ag.system_users.nome}</span>
                          )}
                        </div>

                        {ag.observacoes && (
                          <p className="text-xs text-gray-400 mt-1.5 italic border-l-2 border-gray-200 pl-2">
                            {ag.observacoes}
                          </p>
                        )}
                      </div>

                      {/* Ações */}
                      <div className="flex items-center gap-2 flex-wrap sm:flex-col sm:items-end shrink-0">
                        <StatusSelect id={ag.id} current={status} onChange={s => handleStatusChange(ag.id, s)} />
                        {!ag.laudos?.length && status !== 'cancelado' ? (
                          <Link
                            href={`/admin/novo?agendamento_id=${ag.id}`}
                            className="bg-[#c4a35a] hover:bg-[#b8944e] text-white text-xs font-bold px-3 py-2 rounded-lg transition whitespace-nowrap"
                          >
                            Emitir Laudo →
                          </Link>
                        ) : ag.laudos?.length ? (
                          <button
                            onClick={() => setEditandoLaudo({ laudo: ag.laudos![0], petNome: ag.pets?.nome ?? '' })}
                            className="border border-gray-200 hover:bg-gray-50 text-gray-600 text-xs font-semibold px-3 py-2 rounded-lg transition whitespace-nowrap"
                          >
                            ✏️ Editar laudo
                          </button>
                        ) : null}
                      </div>
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
          tiposExame={tiposExame}
          vets={vets}
          comissoes={comissoes}
          onClose={() => setNovoModal(false)}
          onCreated={() => { fetchAgendamentos(); fetchDias() }}
        />
      )}

      {editandoLaudo && (
        <EditLaudoModal
          laudo={editandoLaudo.laudo}
          petNome={editandoLaudo.petNome}
          onClose={() => setEditandoLaudo(null)}
        />
      )}
    </div>
  )
}
