'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'

import { EXAM_CODES, type MindrayResult } from '@/lib/mindray-types'
import TutorBusca from '@/components/TutorBusca'

const ESPECIES = ['Cachorro', 'Gato', 'Pássaro', 'Coelho', 'Hamster', 'Réptil', 'Outro']
const SEXOS    = ['Macho', 'Fêmea', 'Não informado']

const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36] focus:border-transparent bg-white'

interface Vet { id: number; nome: string; convite_aceito?: boolean; clinicas?: { nome: string } | null }

// ── VetSelect (autocomplete) ──────────────────────────────────────────────────
function VetSelect({ vets, value, onChange, onNew }: {
  vets:     Vet[]
  value:    number | null
  onChange: (vet: Vet | null) => void
  onNew:    () => void
}) {
  const [query, setQuery] = useState('')
  const [open,  setOpen]  = useState(false)
  const selected = vets.find(v => v.id === value) ?? null
  const filtered = vets.filter(v => v.nome.toLowerCase().includes(query.toLowerCase()))

  function pick(vet: Vet) { onChange(vet); setQuery(''); setOpen(false) }

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
              <button key={v.id} type="button" onMouseDown={() => pick(v)}
                className="w-full text-left px-4 py-2.5 hover:bg-amber-50 text-sm border-b border-gray-50 last:border-0 flex items-center justify-between">
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
      <button type="button" onClick={onNew}
        className="shrink-0 px-3 py-2.5 bg-amber-50 border border-[#8a6e36]/30 text-[#8a6e36] rounded-lg text-sm font-semibold hover:bg-amber-100 transition">
        + Novo
      </button>
    </div>
  )
}

// ── Modal novo veterinário ────────────────────────────────────────────────────
function NovoVetModal({ onClose, onCreated }: { onClose: () => void; onCreated: (vet: Vet) => void }) {
  const [form,    setForm]    = useState({ nome: '', whatsapp: '' })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const digits = form.whatsapp.replace(/\D/g, '')
    const wa     = digits ? (digits.startsWith('55') ? digits : `55${digits}`) : undefined
    const res = await fetch('/api/veterinarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: form.nome.trim(), whatsapp: wa }),
    })
    if (res.ok) {
      const vet = await res.json()
      setSuccess(`Veterinário cadastrado!${wa ? ' Convite enviado pelo WhatsApp.' : ''}`)
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
            <button onClick={onClose} className="mt-5 w-full bg-[#19202d] text-white font-semibold py-2.5 rounded-lg text-sm hover:bg-[#232d3f] transition">
              Fechar
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Nome <span className="text-red-400">*</span></label>
              <input type="text" value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))}
                placeholder="Nome completo" required autoFocus className={INPUT} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">WhatsApp</label>
              <input type="tel" value={form.whatsapp} onChange={e => setForm(p => ({ ...p, whatsapp: e.target.value }))}
                placeholder="(24) 99999-9999" className={INPUT} />
              <p className="text-[10px] text-gray-400 mt-1">O e-mail é definido pelo próprio vet no primeiro acesso.</p>
            </div>
            {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose} className="flex-1 border border-gray-200 text-gray-500 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition">Cancelar</button>
              <button type="submit" disabled={loading} className="flex-1 bg-[#19202d] hover:bg-[#232d3f] text-white font-semibold py-2.5 rounded-lg text-sm transition disabled:opacity-60">
                {loading ? 'Salvando...' : 'Cadastrar'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

interface Form {
  nome_pet:   string
  especie:    string
  raca:       string
  sexo:       string
  idade:      string
  tutor:      string
  telefone:   string
  data_laudo: string
  veterinario_id: string
}

function statusBadge(s: string) {
  if (s === 'H') return <span className="text-xs font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">↑ H</span>
  if (s === 'L') return <span className="text-xs font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">↓ L</span>
  return null
}

/** Build an HTML table from results — used as `texto` for the PDF generator */
function buildTexto(resultados: MindrayResult[]): string {
  if (resultados.length === 0) return '<p>Sem resultados.</p>'

  const rows = resultados
    .filter(r => r.valor)
    .map(r => {
      const statusCell = r.status === 'H'
        ? '<strong style="color:#dc2626">H ↑</strong>'
        : r.status === 'L'
        ? '<strong style="color:#2563eb">L ↓</strong>'
        : '—'
      return `<tr>
        <td style="padding:4px 8px;border:1px solid #e5e7eb">${r.nome}</td>
        <td style="padding:4px 8px;border:1px solid #e5e7eb;text-align:right">${r.valor}</td>
        <td style="padding:4px 8px;border:1px solid #e5e7eb">${r.unidade}</td>
        <td style="padding:4px 8px;border:1px solid #e5e7eb">${r.metodo ?? ''}</td>
        <td style="padding:4px 8px;border:1px solid #e5e7eb;text-align:center">${statusCell}</td>
      </tr>`
    })
    .join('\n')

  return `<table style="width:100%;border-collapse:collapse;font-size:13px">
  <thead>
    <tr style="background:#f3f4f6">
      <th style="padding:6px 8px;border:1px solid #e5e7eb;text-align:left">Exame</th>
      <th style="padding:6px 8px;border:1px solid #e5e7eb;text-align:right">Resultado</th>
      <th style="padding:6px 8px;border:1px solid #e5e7eb;text-align:left">Unidade</th>
      <th style="padding:6px 8px;border:1px solid #e5e7eb;text-align:left">Método</th>
      <th style="padding:6px 8px;border:1px solid #e5e7eb;text-align:center">Status</th>
    </tr>
  </thead>
  <tbody>
${rows}
  </tbody>
</table>`
}

export default function NovoBioquimicaPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<Form>({
    nome_pet:       '',
    especie:        '',
    raca:           '',
    sexo:           '',
    idade:          '',
    tutor:          '',
    telefone:       '',
    data_laudo:     new Date().toLocaleDateString('en-CA'),
    veterinario_id: '',
  })

  const [resultados, setResultados] = useState<MindrayResult[]>([])
  const [sampleId,   setSampleId]   = useState('')
  const [vets,       setVets]       = useState<Vet[]>([])
  const [importing,  setImporting]  = useState(false)
  const [importError, setImportError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [rawTexts,   setRawTexts]   = useState<string[]>([])
  const [showRaw,    setShowRaw]    = useState(false)
  const [tutorId,    setTutorId]    = useState<number | null>(null)
  const [petId,      setPetId]      = useState<number | null>(null)
  const [vetId,      setVetId]      = useState<number | null>(null)
  const [vetModal,   setVetModal]   = useState(false)

  const loadVets = useCallback(async () => {
    const res = await fetch('/api/veterinarios')
    if (res.ok) setVets(await res.json())
  }, [])

  useEffect(() => { loadVets() }, [loadVets])

  function handleFormChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm(p => ({ ...p, [e.target.name]: e.target.value }))
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    setImporting(true)
    setImportError('')

    const fd = new FormData()
    fd.append('arquivo', file)

    const res = await fetch('/api/laudos/importar-xps', { method: 'POST', body: fd })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setImportError(d.error ?? `Erro ${res.status}`)
      setImporting(false)
      return
    }

    const data = await res.json()
    setImporting(false)

    if (data.resultados?.length) setResultados(data.resultados)
    if (data.raw_texts?.length)  setRawTexts(data.raw_texts)
    if (data.sample_id)          setSampleId(data.sample_id)

    setForm(prev => ({
      ...prev,
      nome_pet: data.paciente  || prev.nome_pet,
      especie:  data.especie   || prev.especie,
      sexo:     data.sexo      || prev.sexo,
      idade:    data.idade     || prev.idade,
      data_laudo: data.data_exame
        ? parseXpsDate(data.data_exame)
        : prev.data_laudo,
    }))
  }

  function parseXpsDate(d: string): string {
    // Try DD/MM/YYYY or DD-MM-YYYY → YYYY-MM-DD
    const m = d.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/)
    if (m) return `${m[3]}-${m[2]}-${m[1]}`
    return new Date().toLocaleDateString('en-CA')
  }

  function updateResultado(idx: number, field: keyof MindrayResult, value: string) {
    setResultados(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      return next
    })
  }

  function removeResultado(idx: number) {
    setResultados(prev => prev.filter((_, i) => i !== idx))
  }

  function addResultado() {
    setResultados(prev => [...prev, { codigo: '', nome: '', valor: '', unidade: '', metodo: '', status: '' }])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError('')

    if (!form.nome_pet || !form.especie || !form.tutor || !form.telefone) {
      setSubmitError('Preencha os campos obrigatórios: animal, espécie, tutor e telefone.')
      return
    }
    if (resultados.filter(r => r.valor).length === 0) {
      setSubmitError('Adicione pelo menos um resultado com valor.')
      return
    }

    setSubmitting(true)

    const texto = buildTexto(resultados)

    const fd = new FormData()
    fd.append('nome_pet',          form.nome_pet)
    fd.append('especie',           form.especie)
    fd.append('tutor',             form.tutor)
    fd.append('telefone',          form.telefone)
    fd.append('sexo',              form.sexo)
    fd.append('raca',              form.raca)
    fd.append('idade',             form.idade)
    fd.append('data_laudo',        form.data_laudo)
    fd.append('tipo_exame',        'Bioquímica')
    fd.append('texto',             texto)
    const selectedVet2 = vets.find(v => v.id === vetId)
    fd.append('medico_responsavel', selectedVet2?.nome ?? '')
    if (vetId) fd.append('veterinario_id', String(vetId))
    if (tutorId) fd.append('tutor_id', String(tutorId))
    if (petId)   fd.append('pet_id',   String(petId))

    const res = await fetch('/api/laudos/gerar', { method: 'POST', body: fd })

    if (res.ok) {
      const laudo = await res.json()
      router.push('/admin/laudos')
    } else {
      const d = await res.json().catch(() => ({}))
      setSubmitError(d.error ?? 'Erro ao gerar laudo.')
    }

    setSubmitting(false)
  }

  const allCodes = Object.keys(EXAM_CODES).filter(
    (c, i, arr) => arr.indexOf(c) === i && EXAM_CODES[c]
  )

  return (
    <div className="min-h-screen bg-gray-50">


      <main className="max-w-4xl mx-auto px-4 py-8 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#19202d]">Bioquímica — Mindray BS-200</h1>
            <p className="text-sm text-gray-400 mt-0.5">Importe um arquivo XPS para preencher automaticamente</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Import XPS */}
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="h-1 bg-gold-stripe" />
            <div className="p-6">
              <h2 className="text-xs font-bold text-[#19202d] uppercase tracking-widest mb-3">
                Importar arquivo XPS
              </h2>
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importing}
                  className="bg-[#19202d] hover:bg-[#2a3447] disabled:opacity-50 text-white font-semibold px-4 py-2.5 rounded-lg text-sm transition flex items-center gap-2"
                >
                  {importing ? (
                    <>
                      <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                      Processando...
                    </>
                  ) : (
                    <>📂 Selecionar arquivo .xps</>
                  )}
                </button>
                {sampleId && (
                  <span className="text-xs text-gray-400 font-mono">ID: {sampleId}</span>
                )}
                {resultados.length > 0 && (
                  <span className="text-xs text-green-600 font-semibold">
                    ✓ {resultados.length} exame{resultados.length !== 1 ? 's' : ''} importado{resultados.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xps"
                onChange={handleFileChange}
                className="hidden"
              />
              {importError && (
                <p className="mt-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {importError}
                </p>
              )}
              {rawTexts.length > 0 && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => setShowRaw(p => !p)}
                    className="text-xs text-gray-400 hover:text-gray-600 underline"
                  >
                    {showRaw ? 'Ocultar' : 'Ver'} texto extraído do XPS ({rawTexts.length} tokens)
                  </button>
                  {showRaw && (
                    <div className="mt-2 bg-gray-50 border rounded-lg p-3 max-h-40 overflow-y-auto font-mono text-xs text-gray-500 flex flex-wrap gap-1">
                      {rawTexts.map((t, i) => (
                        <span key={i} className="bg-white border rounded px-1 py-0.5">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Veterinário Solicitante */}
          <div className="bg-white rounded-xl border shadow-sm overflow-visible">
            <div className="h-1 bg-gold-stripe rounded-t-xl" />
            <div className="p-6">
              <h2 className="text-xs font-bold text-[#19202d] uppercase tracking-widest mb-4">
                Veterinário Solicitante
              </h2>
              <VetSelect
                vets={vets}
                value={vetId}
                onChange={v => setVetId(v?.id ?? null)}
                onNew={() => setVetModal(true)}
              />
            </div>
          </div>

          {/* Dados do paciente */}
          <div className="bg-white rounded-xl border shadow-sm overflow-visible">
            <div className="h-1 bg-gold-stripe" />
            <div className="p-6 space-y-4">
              <h2 className="text-xs font-bold text-[#19202d] uppercase tracking-widest">
                Dados do Paciente
              </h2>

              {/* Busca de proprietário */}
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                    Nome do Animal <span className="text-red-400">*</span>
                  </label>
                  <input type="text" name="nome_pet" value={form.nome_pet} onChange={handleFormChange}
                    placeholder="Ex: Rex" required className={INPUT} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                    Espécie <span className="text-red-400">*</span>
                  </label>
                  <select name="especie" value={form.especie} onChange={handleFormChange} required className={INPUT}>
                    <option value="">Selecione...</option>
                    {ESPECIES.map(e => <option key={e}>{e}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Sexo</label>
                  <select name="sexo" value={form.sexo} onChange={handleFormChange} className={INPUT}>
                    <option value="">Selecione...</option>
                    {SEXOS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Raça</label>
                  <input type="text" name="raca" value={form.raca} onChange={handleFormChange}
                    placeholder="Ex: Golden Retriever" className={INPUT} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Idade</label>
                  <input type="text" name="idade" value={form.idade} onChange={handleFormChange}
                    placeholder="Ex: 3 anos" className={INPUT} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Data do Laudo</label>
                  <input type="date" name="data_laudo" value={form.data_laudo} onChange={handleFormChange} className={INPUT} />
                </div>
              </div>
            </div>
          </div>

          {/* Resultados */}
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="h-1 bg-gold-stripe" />
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-bold text-[#19202d] uppercase tracking-widest">
                  Resultados dos Exames
                </h2>
                <button
                  type="button"
                  onClick={addResultado}
                  className="text-xs font-semibold text-[#8a6e36] hover:text-[#5a4a28] bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-lg border border-[#8a6e36]/30 transition"
                >
                  + Adicionar linha
                </button>
              </div>

              {resultados.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">
                  Importe um arquivo XPS ou adicione linhas manualmente.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left text-xs font-semibold text-gray-400 uppercase pb-2 pr-3">Exame</th>
                        <th className="text-right text-xs font-semibold text-gray-400 uppercase pb-2 px-3">Resultado</th>
                        <th className="text-left text-xs font-semibold text-gray-400 uppercase pb-2 px-3">Unidade</th>
                        <th className="text-left text-xs font-semibold text-gray-400 uppercase pb-2 px-3">Método</th>
                        <th className="text-center text-xs font-semibold text-gray-400 uppercase pb-2 px-3">Status</th>
                        <th className="pb-2 w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {resultados.map((r, i) => (
                        <tr key={i} className="border-b border-gray-50 last:border-0">
                          <td className="py-1.5 pr-3">
                            <input
                              type="text"
                              value={r.nome}
                              onChange={e => updateResultado(i, 'nome', e.target.value)}
                              className="w-full border-0 border-b border-gray-200 focus:border-[#c4a35a] focus:outline-none text-sm py-1 bg-transparent"
                              placeholder="Nome do exame"
                            />
                          </td>
                          <td className="py-1.5 px-3">
                            <input
                              type="text"
                              value={r.valor}
                              onChange={e => updateResultado(i, 'valor', e.target.value)}
                              className="w-24 border-0 border-b border-gray-200 focus:border-[#c4a35a] focus:outline-none text-sm py-1 text-right bg-transparent"
                              placeholder="0.00"
                            />
                          </td>
                          <td className="py-1.5 px-3">
                            <input
                              type="text"
                              value={r.unidade}
                              onChange={e => updateResultado(i, 'unidade', e.target.value)}
                              className="w-24 border-0 border-b border-gray-200 focus:border-[#c4a35a] focus:outline-none text-sm py-1 bg-transparent"
                              placeholder="U/L"
                            />
                          </td>
                          <td className="py-1.5 px-3">
                            <input
                              type="text"
                              value={r.metodo ?? ''}
                              onChange={e => updateResultado(i, 'metodo', e.target.value)}
                              className="w-28 border-0 border-b border-gray-200 focus:border-[#c4a35a] focus:outline-none text-sm py-1 bg-transparent"
                              placeholder="Ex: Cinético"
                            />
                          </td>
                          <td className="py-1.5 px-3 text-center">
                            <select
                              value={r.status}
                              onChange={e => updateResultado(i, 'status', e.target.value as MindrayResult['status'])}
                              className="border-0 border-b border-gray-200 focus:border-[#c4a35a] focus:outline-none text-sm py-1 bg-transparent text-center"
                            >
                              <option value="">—</option>
                              <option value="N">N</option>
                              <option value="H">H ↑</option>
                              <option value="L">L ↓</option>
                            </select>
                            {statusBadge(r.status)}
                          </td>
                          <td className="py-1.5 pl-2">
                            <button
                              type="button"
                              onClick={() => removeResultado(i)}
                              className="text-gray-300 hover:text-red-500 transition text-base leading-none"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Quick-add from known codes */}
              {resultados.length > 0 && (
                <div className="mt-4 pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-400 mb-2">Adicionar exame conhecido:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {['TGP','TGO','AMIL','COL','CREA','FAL','GLIC','TRIG','UREIA','ALB','PROT','GGT','LDH','CK','LIPA'].map(code => (
                      <button
                        key={code}
                        type="button"
                        onClick={() => {
                          if (resultados.some(r => r.codigo === code)) return
                          const info = EXAM_CODES[code]
                          if (!info) return
                          setResultados(p => [...p, { codigo: code, nome: info.nome, valor: '', unidade: info.unidade, metodo: '', status: '' }])
                        }}
                        disabled={resultados.some(r => r.codigo === code)}
                        className="text-xs px-2 py-1 rounded border font-mono disabled:opacity-30 disabled:cursor-not-allowed bg-gray-50 hover:bg-amber-50 hover:border-[#c4a35a] border-gray-200 transition"
                      >
                        {code}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {submitError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              {submitError}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-[#19202d] hover:bg-[#2a3447] disabled:opacity-50 text-white font-bold py-3 rounded-xl transition text-sm tracking-wide"
          >
            {submitting ? 'Gerando PDF...' : '✨ Gerar Laudo de Bioquímica'}
          </button>
        </form>
      </main>

      {vetModal && (
        <NovoVetModal
          onClose={() => setVetModal(false)}
          onCreated={vet => { setVets(prev => [...prev, vet]); setVetId(vet.id); setVetModal(false) }}
        />
      )}
    </div>
  )
}
