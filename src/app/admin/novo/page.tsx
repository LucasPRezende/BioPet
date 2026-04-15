'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'


const RichTextEditor = dynamic(() => import('@/components/RichTextEditor'), { ssr: false })
import TutorBusca from '@/components/TutorBusca'

const ESPECIES = ['Cachorro', 'Gato', 'Pássaro', 'Coelho', 'Hamster', 'Réptil', 'Outro']
const SEXOS    = ['Macho', 'Fêmea', 'Não informado']

interface Vet { id: number; nome: string; convite_aceito: boolean; clinicas?: { nome: string } | null }

interface SuccessData {
  id: number; link: string; tutor: string; telefone: string; nomePet: string
}

interface AgendamentoPreFill {
  agendamento_id: number
  tutor_id:       number | null
  pet_id:         number | null
}

type WaStatus = 'idle' | 'sending' | 'sent' | 'error'

const INPUT = 'w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36] focus:border-transparent bg-white'

function markdownToHtml(md: string): string {
  const lines = md.split('\n')
  const out: string[] = []
  let inUl = false
  let inOl = false

  function closeList() {
    if (inUl) { out.push('</ul>'); inUl = false }
    if (inOl) { out.push('</ol>'); inOl = false }
  }

  for (let raw of lines) {
    // headings
    if (/^### /.test(raw)) { closeList(); out.push(`<h3>${raw.slice(4).trim()}</h3>`); continue }
    if (/^## /.test(raw))  { closeList(); out.push(`<h2>${raw.slice(3).trim()}</h2>`); continue }
    if (/^# /.test(raw))   { closeList(); out.push(`<h2>${raw.slice(2).trim()}</h2>`); continue }

    // unordered list
    const ulMatch = raw.match(/^[-*] (.+)/)
    if (ulMatch) {
      if (inOl) { out.push('</ol>'); inOl = false }
      if (!inUl) { out.push('<ul>'); inUl = true }
      out.push(`<li>${inline(ulMatch[1])}</li>`)
      continue
    }

    // ordered list
    const olMatch = raw.match(/^\d+\. (.+)/)
    if (olMatch) {
      if (inUl) { out.push('</ul>'); inUl = false }
      if (!inOl) { out.push('<ol>'); inOl = true }
      out.push(`<li>${inline(olMatch[1])}</li>`)
      continue
    }

    closeList()

    if (raw.trim() === '') {
      out.push('<p></p>')
    } else {
      out.push(`<p>${inline(raw)}</p>`)
    }
  }

  closeList()
  return out.join('')
}

function inline(s: string): string {
  return s
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,         '<em>$1</em>')
    .replace(/_(.+?)_/g,           '<em>$1</em>')
    .replace(/`(.+?)`/g,           '<code>$1</code>')
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
        {label} {required && <span className="text-red-400 normal-case font-normal">*</span>}
      </label>
      {children}
    </div>
  )
}

// ── Autocomplete de veterinário ───────────────────────────────────────────────
function VetSelect({ vets, value, onChange, onNew }: {
  vets:     Vet[]
  value:    number | null
  onChange: (vet: Vet | null) => void
  onNew:    () => void
}) {
  const [query, setQuery] = useState('')
  const [open,  setOpen]  = useState(false)

  const selected = vets.find(v => v.id === value) ?? null
  const filtered = vets.filter(v =>
    v.nome.toLowerCase().includes(query.toLowerCase())
  )

  function pick(vet: Vet) {
    onChange(vet)
    setQuery('')
    setOpen(false)
  }

  return (
    <div className="flex gap-2">
      <div className="flex-1 relative">
        <input
          type="text"
          value={selected ? selected.nome : query}
          onChange={e => { setQuery(e.target.value); onChange(null); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Buscar veterinário..."
          className={INPUT}
        />

        {open && (
          <div className="absolute z-20 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-4 py-3 text-sm text-gray-400">Nenhum encontrado</div>
            ) : filtered.map(v => (
              <button
                key={v.id}
                type="button"
                onMouseDown={() => pick(v)}
                className="w-full text-left px-4 py-2.5 hover:bg-amber-50 text-sm border-b border-gray-50 last:border-0 flex items-center justify-between"
              >
                <span className="font-medium text-[#19202d]">
                  {v.nome}
                  {v.clinicas && <span className="ml-1.5 text-xs text-gray-400">· {v.clinicas.nome}</span>}
                </span>
                <span className={`text-xs ml-2 shrink-0 ${v.convite_aceito ? 'text-green-500' : 'text-amber-500'}`}>
                  {v.convite_aceito ? 'Ativo' : 'Pendente'}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onNew}
        className="shrink-0 px-3 py-2.5 bg-amber-50 border border-[#8a6e36]/30 text-[#8a6e36] rounded-lg text-sm font-semibold hover:bg-amber-100 transition"
      >
        + Novo
      </button>
    </div>
  )
}

// ── Modal novo veterinário ────────────────────────────────────────────────────
function NovoVetModal({ onClose, onCreated }: {
  onClose:   () => void
  onCreated: (vet: Vet) => void
}) {
  const [form,    setForm]    = useState({ nome: '', email: '', whatsapp: '' })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await fetch('/api/veterinarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      const vet = await res.json()
      setSuccess(`Veterinário cadastrado! ${form.whatsapp ? 'Convite enviado pelo WhatsApp.' : ''}`)
      onCreated(vet)
    } else {
      const err = await res.json()
      setError(err.error ?? 'Erro ao cadastrar.')
    }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="bg-[#19202d] px-6 py-4 flex items-center justify-between">
          <h3 className="text-white font-bold text-sm">Novo Veterinário</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
        </div>

        {success ? (
          <div className="p-6 text-center">
            <div className="text-4xl mb-3">✅</div>
            <p className="text-[#19202d] font-semibold">{success}</p>
            <button
              onClick={onClose}
              className="mt-5 w-full bg-[#19202d] text-white font-semibold py-2.5 rounded-lg text-sm transition hover:bg-[#232d3f]"
            >
              Fechar
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <Field label="Nome" required>
              <input
                type="text"
                value={form.nome}
                onChange={e => setForm(p => ({ ...p, nome: e.target.value }))}
                placeholder="Nome completo"
                required
                autoFocus
                className={INPUT}
              />
            </Field>
            <Field label="E-mail" required>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                placeholder="email@exemplo.com"
                required
                className={INPUT}
              />
            </Field>
            <Field label="WhatsApp">
              <input
                type="tel"
                value={form.whatsapp}
                onChange={e => setForm(p => ({ ...p, whatsapp: e.target.value }))}
                placeholder="(24) 99999-9999"
                className={INPUT}
              />
            </Field>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 border border-gray-200 text-gray-500 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-[#19202d] hover:bg-[#232d3f] text-white font-semibold py-2.5 rounded-lg text-sm transition disabled:opacity-60"
              >
                {loading ? 'Salvando...' : 'Cadastrar'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ── Modal configuração IA ─────────────────────────────────────────────────────
function AiConfigModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'anthropic' | 'gemini'>(
    () => (localStorage.getItem('ai_review_model') as 'anthropic' | 'gemini') ?? 'anthropic'
  )

  // Claude
  const [claudeKey,      setClaudeKey]      = useState(() => localStorage.getItem('ai_review_key')      ?? '')
  const [claudeEndpoint, setClaudeEndpoint] = useState(() => localStorage.getItem('ai_review_endpoint') ?? '')
  const [claudeSys,      setClaudeSys]      = useState(() => localStorage.getItem('ai_review_system')   ?? '')

  // Gemini
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('ai_review_gemini_key') ?? '')
  const [geminiSys, setGeminiSys] = useState(() => localStorage.getItem('ai_review_gemini_system') ?? '')

  function save() {
    localStorage.setItem('ai_review_model', tab)
    localStorage.setItem('ai_review_key',         claudeKey.trim())
    localStorage.setItem('ai_review_endpoint',    claudeEndpoint.trim())
    localStorage.setItem('ai_review_system',      claudeSys.trim())
    localStorage.setItem('ai_review_gemini_key',  geminiKey.trim())
    localStorage.setItem('ai_review_gemini_system', geminiSys.trim())
    onClose()
  }

  const TAB = (active: boolean) =>
    `flex-1 py-2 text-xs font-semibold rounded-lg transition ${active ? 'bg-[#19202d] text-white' : 'text-gray-500 hover:bg-gray-100'}`

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-[#19202d] px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-white font-bold text-sm">Configurar revisão com IA</p>
            <p className="text-gray-400 text-xs mt-0.5">Salvo apenas neste navegador</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
        </div>
        <div className="p-6 space-y-4">
          {/* Seletor de modelo */}
          <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
            <button type="button" className={TAB(tab === 'anthropic')} onClick={() => setTab('anthropic')}>
              Claude (Anthropic)
            </button>
            <button type="button" className={TAB(tab === 'gemini')} onClick={() => setTab('gemini')}>
              Gemini (Google)
            </button>
          </div>

          {tab === 'anthropic' ? (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                  Chave de API <span className="text-red-400">*</span>
                </label>
                <input type="password" value={claudeKey} onChange={e => setClaudeKey(e.target.value)}
                  placeholder="sk-ant-..." className={INPUT} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                  Endpoint <span className="text-gray-300 font-normal">(opcional)</span>
                </label>
                <input type="text" value={claudeEndpoint} onChange={e => setClaudeEndpoint(e.target.value)}
                  placeholder="https://api.anthropic.com/v1/messages" className={INPUT} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                  System prompt <span className="text-gray-300 font-normal">(opcional)</span>
                </label>
                <textarea value={claudeSys} onChange={e => setClaudeSys(e.target.value)} rows={3}
                  placeholder="Você é um assistente médico veterinário..." className={INPUT + ' resize-none'} />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                  Chave de API Gemini <span className="text-red-400">*</span>
                </label>
                <input type="password" value={geminiKey} onChange={e => setGeminiKey(e.target.value)}
                  placeholder="AIza..." className={INPUT} />
              </div>
              <div className="text-xs text-gray-400 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                Os PDFs da pasta <code className="font-mono">context-pdfs/</code> serão enviados como referência de estilo e estrutura.
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                  System prompt <span className="text-gray-300 font-normal">(opcional)</span>
                </label>
                <textarea value={geminiSys} onChange={e => setGeminiSys(e.target.value)} rows={3}
                  placeholder="Você é um assistente médico veterinário especializado..." className={INPUT + ' resize-none'} />
              </div>
            </>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-500 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition">
              Cancelar
            </button>
            <button type="button" onClick={save}
              className="flex-1 bg-[#19202d] hover:bg-[#232d3f] text-white font-semibold py-2.5 rounded-lg text-sm transition">
              Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function NovoLaudoPage() {
  const pdfInputRef = useRef<HTMLInputElement>(null)
  const imgInputRef = useRef<HTMLInputElement>(null)

  const [modo, setModo] = useState<'upload' | 'gerar'>('upload')
  const [form, setForm] = useState({
    nome_pet: '', especie: '', tutor: '', telefone: '',
    sexo: '', raca: '', idade: '', tipo_exame: '',
    data_laudo: new Date().toLocaleDateString('en-CA'),
  })
  const [texto,   setTexto]   = useState('')
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [imagens, setImagens] = useState<File[]>([])
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [success,  setSuccess]  = useState<SuccessData | null>(null)
  const [waStatus, setWaStatus] = useState<WaStatus>('idle')

  // Veterinário
  const [vets,      setVets]      = useState<Vet[]>([])
  const [vetId,     setVetId]     = useState<number | null>(null)
  const [vetModal,  setVetModal]  = useState(false)

  // Tipos de exame (carregado da API)
  const [tiposExame, setTiposExame] = useState<string[]>([])

  // AI review
  const [aiLoading,    setAiLoading]    = useState(false)
  const [aiError,      setAiError]      = useState('')
  const [aiConfigOpen, setAiConfigOpen] = useState(false)
  const [aiModel,      setAiModel]      = useState<'anthropic' | 'gemini'>(() =>
    (typeof window !== 'undefined' ? localStorage.getItem('ai_review_model') as 'anthropic' | 'gemini' : null) ?? 'anthropic'
  )

  // Tutor/pet vinculado manualmente
  const [tutorId, setTutorId] = useState<number | null>(null)
  const [petId,   setPetId]   = useState<number | null>(null)

  // Pré-preenchimento via agendamento
  const [agendamentoRef,       setAgendamentoRef]       = useState<AgendamentoPreFill | null>(null)
  const [laudoExistente,       setLaudoExistente]       = useState<{ id: number; token: string } | null>(null)

  const loadVets = useCallback(async () => {
    const res = await fetch('/api/veterinarios')
    if (res.ok) setVets(await res.json())
  }, [])

  const loadTiposExame = useCallback(async () => {
    const res = await fetch('/api/comissoes')
    if (res.ok) {
      const data: { tipo_exame: string }[] = await res.json()
      setTiposExame(data.map(c => c.tipo_exame))
    }
  }, [])

  // Pré-preenche a partir de um agendamento se ?agendamento_id= estiver na URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const agId = params.get('agendamento_id')
    if (!agId) return

    fetch(`/api/agendamentos/${agId}`)
      .then(r => r.ok ? r.json() : null)
      .then(ag => {
        if (!ag) return
        // Verifica se já existe laudo para este agendamento
        const laudos = ag.laudos as { id: number; token: string }[] | undefined
        if (laudos && laudos.length > 0) {
          setLaudoExistente(laudos[0])
          return
        }

        setForm(prev => ({
          ...prev,
          nome_pet:   ag.pets?.nome    ?? prev.nome_pet,
          especie:    ag.pets?.especie ?? prev.especie,
          tutor:      ag.tutores?.nome ?? prev.tutor,
          telefone:   ag.tutores?.telefone ?? prev.telefone,
          tipo_exame: ag.tipo_exame ?? prev.tipo_exame,
        }))
        if (ag.veterinario_id) setVetId(ag.veterinario_id)
        setAgendamentoRef({
          agendamento_id: ag.id,
          tutor_id:       ag.tutor_id ?? ag.tutores?.id ?? null,
          pet_id:         ag.pet_id   ?? ag.pets?.id    ?? null,
        })
      })
  }, [])

  useEffect(() => { loadVets(); loadTiposExame() }, [loadVets, loadTiposExame])

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  function handlePdfChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.type !== 'application/pdf') { setError('Selecione um arquivo PDF.'); return }
    setPdfFile(f)
    setError('')
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    setImagens(prev => [...prev, ...Array.from(e.target.files ?? [])])
  }

  function handleVetCreated(vet: Vet) {
    setVets(prev => [...prev, vet])
    setVetId(vet.id)
    setVetModal(false)
  }

  async function reviewWithAI() {
    if (!texto.trim()) { setAiError('Escreva o texto do laudo antes de revisar.'); return }
    const activeModel  = aiModel
    const isGemini     = activeModel === 'gemini'
    const apiKey       = isGemini
      ? (localStorage.getItem('ai_review_gemini_key') ?? '')
      : (localStorage.getItem('ai_review_key') ?? '')
    const systemPrompt = isGemini
      ? (localStorage.getItem('ai_review_gemini_system') ?? '')
      : (localStorage.getItem('ai_review_system') ?? '')
    const endpoint     = isGemini ? '' : (localStorage.getItem('ai_review_endpoint') ?? '')

    if (!apiKey) { setAiConfigOpen(true); return }
    setAiLoading(true); setAiError('')
    try {
      const res = await fetch('/api/admin/ai-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto, apiKey, endpoint, systemPrompt, model: activeModel }),
      })
      const d = await res.json()
      if (!res.ok) setAiError(d.error ?? `Erro ${res.status}`)
      else if (d.texto) setTexto(markdownToHtml(d.texto))
      else setAiError('Resposta inválida da IA.')
    } catch (e: unknown) {
      setAiError(e instanceof Error ? e.message : 'Erro de rede.')
    }
    setAiLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!vetId) { setError('Selecione o veterinário responsável.'); return }
    if (modo === 'upload' && !pdfFile) { setError('Selecione um arquivo PDF.'); return }
    if (modo === 'gerar' && !texto.trim()) { setError('O texto do laudo é obrigatório.'); return }

    setLoading(true)

    const selectedVet = vets.find(v => v.id === vetId) ?? null
    const data        = new FormData()

    data.append('nome_pet',  form.nome_pet)
    data.append('especie',   form.especie)
    data.append('tutor',     form.tutor)
    data.append('telefone',  form.telefone)
    if (vetId) data.append('veterinario_id', String(vetId))
    if (form.tipo_exame) data.append('tipo_exame', form.tipo_exame)
    if (agendamentoRef) {
      data.append('agendamento_id', String(agendamentoRef.agendamento_id))
      if (agendamentoRef.tutor_id) data.append('tutor_id', String(agendamentoRef.tutor_id))
      if (agendamentoRef.pet_id)   data.append('pet_id',   String(agendamentoRef.pet_id))
    } else {
      if (tutorId) data.append('tutor_id', String(tutorId))
      if (petId)   data.append('pet_id',   String(petId))
    }

    let endpoint = '/api/laudos'

    if (modo === 'upload') {
      data.append('pdf', pdfFile!)
    } else {
      endpoint = '/api/laudos/gerar'
      data.append('sexo',               form.sexo)
      data.append('raca',               form.raca)
      data.append('medico_responsavel', selectedVet?.nome ?? '')
      data.append('idade',              form.idade)
      data.append('data_laudo',         form.data_laudo)
      data.append('texto',              texto)
      for (const img of imagens) data.append('imagens', img)
    }

    const res = await fetch(endpoint, { method: 'POST', body: data })

    if (res.ok) {
      const laudo = await res.json()
      setSuccess({
        id:       laudo.id,
        link:     `${window.location.origin}/laudo/${laudo.token}`,
        tutor:    form.tutor,
        telefone: form.telefone,
        nomePet:  form.nome_pet,
      })
    } else {
      let msg = 'Erro ao cadastrar laudo.'
      try { const err = await res.json(); msg = err.error ?? msg } catch { /* ignore */ }
      setError(msg)
    }

    setLoading(false)
  }

  // ── Tela de sucesso ─────────────────────────────────────────────────────────
  async function sendWhatsApp() {
    if (!success) return
    setWaStatus('sending')
    try {
      const res = await fetch(`/api/laudos/${success.id}/whatsapp`, { method: 'POST' })
      setWaStatus(res.ok ? 'sent' : 'error')
    } catch {
      setWaStatus('error')
    }
  }

  if (laudoExistente) {
    return (
      <div className="min-h-screen bg-[#19202d] flex items-center justify-center px-4">
        <div className="h-1 bg-gold-stripe absolute top-0 left-0 right-0" />
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-lg text-center">
          <div className="text-5xl mb-3">📋</div>
          <h2 className="text-xl font-bold text-[#19202d] mb-2">Laudo já emitido</h2>
          <p className="text-gray-400 text-sm mb-6">Este agendamento já possui um laudo cadastrado.</p>
          <div className="flex flex-col gap-3">
            <a
              href={`/laudo/${laudoExistente.token}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full bg-[#19202d] hover:bg-[#232d3f] text-white font-bold py-3 rounded-xl transition text-sm"
            >
              Ver laudo existente
            </a>
            <Link href="/admin/agenda" className="w-full border border-gray-200 hover:bg-gray-50 text-gray-500 py-3 rounded-xl transition text-sm">
              Voltar para a agenda
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[#19202d] flex items-center justify-center px-4">
        <div className="h-1 bg-gold-stripe absolute top-0 left-0 right-0" />
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-lg text-center">
          <div className="text-5xl mb-3">✅</div>
          <h2 className="text-2xl font-bold text-[#19202d] mb-1">Laudo cadastrado!</h2>
          <p className="text-gray-400 text-sm mb-6">{success.tutor} · {success.telefone}</p>
          <div className="bg-amber-50 border border-[#8a6e36]/30 rounded-xl p-4 mb-6 text-left">
            <p className="text-xs font-bold text-[#8a6e36] uppercase mb-1">Link do laudo</p>
            <p className="text-[#19202d] text-sm font-mono break-all">{success.link}</p>
          </div>
          <button
            onClick={sendWhatsApp}
            disabled={waStatus === 'sending' || waStatus === 'sent'}
            className={`flex items-center justify-center gap-2 w-full font-bold py-3 rounded-xl transition mb-3 ${
              waStatus === 'sent'
                ? 'bg-green-100 text-green-700 cursor-default'
                : waStatus === 'error'
                ? 'bg-red-50 text-red-600 border border-red-200'
                : waStatus === 'sending'
                ? 'bg-green-400 text-white cursor-wait'
                : 'bg-green-500 hover:bg-green-600 text-white'
            }`}
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            {waStatus === 'sending' ? 'Enviando...'
              : waStatus === 'sent' ? '✓ Enviado pelo WhatsApp!'
              : waStatus === 'error' ? 'Erro — tentar de novo'
              : 'Enviar pelo WhatsApp'}
          </button>
          <div className="flex gap-3">
            <button onClick={() => navigator.clipboard.writeText(success.link)}
              className="flex-1 bg-amber-50 hover:bg-amber-100 text-[#8a6e36] border border-[#8a6e36]/30 font-semibold px-4 py-2.5 rounded-lg transition text-sm">
              Copiar link
            </button>
            <Link href="/admin/dashboard"
              className="flex-1 border border-gray-200 hover:bg-gray-50 text-gray-500 px-4 py-2.5 rounded-lg transition text-sm text-center">
              Ver lista
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ── Formulário ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">


      <main className="max-w-3xl mx-auto px-4 py-8 space-y-5">
        {/* Toggle modo */}
        <div className="bg-white rounded-xl border overflow-hidden shadow-sm">
          <div className="h-1 bg-gold-stripe" />
          <div className="p-3 flex gap-1">
            {(['upload', 'gerar'] as const).map(m => (
              <button key={m} type="button" onClick={() => setModo(m)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-2 ${
                  modo === m ? 'bg-[#19202d] text-white shadow' : 'text-gray-400 hover:bg-gray-50'
                }`}>
                {m === 'upload' ? '📎 Upload de PDF' : '✍️ Preencher Laudo'}
              </button>
            ))}
          </div>
          <p className="text-center text-xs text-gray-400 pb-3 px-4">
            {modo === 'upload'
              ? 'Anexe um PDF já pronto para compartilhar com o responsável legal.'
              : 'Preencha o laudo e gere o PDF automaticamente com a identidade BioPet.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Veterinário Responsável — seção separada para o dropdown não ser cortado */}
          <div className="bg-white rounded-xl border shadow-sm">
            <div className="h-1 bg-gold-stripe rounded-t-xl" />
            <div className="p-6">
              <h3 className="text-xs font-bold text-[#19202d] uppercase tracking-widest mb-4">
                Veterinário Responsável
              </h3>
              <VetSelect
                vets={vets}
                value={vetId}
                onChange={v => setVetId(v?.id ?? null)}
                onNew={() => setVetModal(true)}
              />
            </div>
          </div>

          {/* Dados do Paciente */}
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="h-1 bg-gold-stripe" />
            <div className="p-6">
              <h3 className="text-xs font-bold text-[#19202d] uppercase tracking-widest mb-4">
                Dados do Paciente
              </h3>

              {/* Busca de proprietário (só quando não veio de agendamento) */}
              {!agendamentoRef && (
                <div className="mb-4">
                  <TutorBusca
                    selectedPetNome={form.nome_pet}
                    onTutorChange={t => {
                      setForm(p => ({ ...p, tutor: t.nome, telefone: t.telefone }))
                      setTutorId(t.id)
                    }}
                    onPetSelect={pet => {
                      setForm(p => ({
                        ...p,
                        nome_pet: pet.nome    || p.nome_pet,
                        especie:  pet.especie ?? p.especie,
                        raca:     pet.raca    ?? '',
                        sexo:     pet.sexo    ?? '',
                      }))
                      setPetId(pet.id)
                    }}
                    inputClass={INPUT}
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {agendamentoRef && (
                  <>
                    <Field label="Proprietário" required>
                      <input type="text" name="tutor" value={form.tutor} onChange={handleChange}
                        placeholder="Nome completo" required className={INPUT} />
                    </Field>
                    <Field label="Telefone" required>
                      <input type="tel" name="telefone" value={form.telefone} onChange={handleChange}
                        placeholder="(11) 99999-9999" required className={INPUT} />
                    </Field>
                  </>
                )}
                <Field label="Nome do Animal" required>
                  <input type="text" name="nome_pet" value={form.nome_pet} onChange={handleChange}
                    placeholder="Ex: Rex, Mimi..." required className={INPUT} />
                </Field>
                <Field label="Espécie" required>
                  <select name="especie" value={form.especie} onChange={handleChange} required className={INPUT}>
                    <option value="">Selecione...</option>
                    {ESPECIES.map(e => <option key={e}>{e}</option>)}
                  </select>
                </Field>
                <Field label="Sexo">
                  <select name="sexo" value={form.sexo} onChange={handleChange} className={INPUT}>
                    <option value="">Selecione...</option>
                    {SEXOS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Raça">
                  <input type="text" name="raca" value={form.raca} onChange={handleChange}
                    placeholder="Ex: Golden Retriever" className={INPUT} />
                </Field>
                <Field label="Idade">
                  <input type="text" name="idade" value={form.idade} onChange={handleChange}
                    placeholder="Ex: 3 anos" className={INPUT} />
                </Field>
                <Field label="Tipo de Exame">
                  <select name="tipo_exame" value={form.tipo_exame} onChange={handleChange} className={INPUT}>
                    <option value="">Selecione...</option>
                    {tiposExame.map(t => <option key={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="Data do Laudo">
                  <input type="date" name="data_laudo" value={form.data_laudo} onChange={handleChange} className={INPUT} />
                </Field>
              </div>
            </div>
          </div>

          {/* Upload PDF */}
          {modo === 'upload' && (
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="h-1 bg-gold-stripe" />
              <div className="p-6">
                <h3 className="text-xs font-bold text-[#19202d] uppercase tracking-widest mb-4">Arquivo PDF</h3>
                <div onClick={() => pdfInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
                    pdfFile ? 'border-[#8a6e36] bg-amber-50' : 'border-gray-200 hover:border-[#8a6e36] hover:bg-amber-50/40'
                  }`}>
                  {pdfFile ? (
                    <>
                      <div className="text-3xl mb-2">📄</div>
                      <p className="font-semibold text-[#19202d]">{pdfFile.name}</p>
                      <p className="text-sm text-gray-400 mt-1">{(pdfFile.size / 1024 / 1024).toFixed(2)} MB</p>
                      <p className="text-xs text-[#8a6e36] mt-2">Clique para trocar</p>
                    </>
                  ) : (
                    <>
                      <div className="text-3xl mb-2">📎</div>
                      <p className="text-gray-500 font-medium">Clique para selecionar o PDF</p>
                      <p className="text-sm text-gray-400 mt-1">Somente arquivos .pdf</p>
                    </>
                  )}
                </div>
                <input ref={pdfInputRef} type="file" accept=".pdf,application/pdf"
                  onChange={handlePdfChange} className="hidden" />
              </div>
            </div>
          )}

          {/* Preencher Laudo */}
          {modo === 'gerar' && (
            <>
              <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="h-1 bg-gold-stripe" />
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xs font-bold text-[#19202d] uppercase tracking-widest">
                      Texto do Laudo <span className="text-red-400 normal-case font-normal">*</span>
                    </h3>
                    <div className="flex items-center gap-2">
                      {/* Toggle de modelo */}
                      <div className="flex text-[11px] rounded-lg overflow-hidden border border-gray-200">
                        {(['anthropic', 'gemini'] as const).map(m => (
                          <button key={m} type="button"
                            onClick={() => { localStorage.setItem('ai_review_model', m); setAiModel(m); setAiError('') }}
                            className={`px-2.5 py-1 font-medium transition ${aiModel === m ? 'bg-violet-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                            {m === 'anthropic' ? 'Claude' : 'Gemini'}
                          </button>
                        ))}
                      </div>
                      <button type="button" onClick={() => setAiConfigOpen(true)}
                        className="text-xs text-gray-400 hover:text-gray-600 transition" title="Configurar IA">
                        ⚙️
                      </button>
                      <button type="button" onClick={reviewWithAI} disabled={aiLoading}
                        className="text-xs px-3 py-1.5 rounded-lg bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 transition font-semibold disabled:opacity-50 whitespace-nowrap">
                        {aiLoading ? 'Revisando...' : '✦ Revisar com IA'}
                      </button>
                    </div>
                  </div>
                  <RichTextEditor value={texto} onChange={setTexto} placeholder="Digite o texto completo do laudo..." />
                  {aiError && (
                    <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-2">{aiError}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-2">
                    Use a barra de ferramentas para negrito, itálico, títulos e listas.
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="h-1 bg-gold-stripe" />
                <div className="p-6">
                  <h3 className="text-xs font-bold text-[#19202d] uppercase tracking-widest mb-2">Imagens (opcional)</h3>
                  <p className="text-xs text-gray-400 mb-4">
                    Cada imagem será inserida em uma página própria após o texto do laudo.
                  </p>
                  {imagens.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                      {imagens.map((img, i) => (
                        <div key={i} className="relative group rounded-lg overflow-hidden border border-gray-200">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={URL.createObjectURL(img)} alt={img.name} className="w-full h-24 object-cover" />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                            <button type="button" onClick={() => setImagens(p => p.filter((_, j) => j !== i))}
                              className="text-white text-xs bg-red-500 hover:bg-red-600 px-2 py-1 rounded">
                              Remover
                            </button>
                          </div>
                          <p className="text-[10px] text-gray-400 px-2 py-1 truncate">{img.name}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <button type="button" onClick={() => imgInputRef.current?.click()}
                    className="w-full border-2 border-dashed border-gray-200 hover:border-[#8a6e36] hover:bg-amber-50/40 rounded-xl p-5 text-center text-sm text-gray-400 transition">
                    🖼️ {imagens.length > 0 ? 'Adicionar mais imagens' : 'Selecionar imagens (PNG / JPG)'}
                  </button>
                  <input ref={imgInputRef} type="file" accept="image/png,image/jpeg,image/jpg"
                    multiple onChange={handleImageChange} className="hidden" />
                </div>
              </div>
            </>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>
          )}

          <button type="submit" disabled={loading}
            className="w-full bg-[#19202d] hover:bg-[#232d3f] disabled:opacity-50 text-white font-bold py-3 rounded-xl transition text-sm tracking-wide">
            {loading
              ? (modo === 'gerar' ? 'Gerando PDF...' : 'Salvando...')
              : (modo === 'gerar' ? '✨ Gerar e Cadastrar Laudo' : 'Cadastrar Laudo')}
          </button>
        </form>
      </main>

      {/* Modal novo veterinário */}
      {vetModal && (
        <NovoVetModal
          onClose={() => setVetModal(false)}
          onCreated={handleVetCreated}
        />
      )}

      {/* Modal configuração IA */}
      {aiConfigOpen && (
        <AiConfigModal onClose={() => setAiConfigOpen(false)} />
      )}
    </div>
  )
}
