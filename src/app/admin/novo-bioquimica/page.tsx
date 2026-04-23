'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'

import { EXAM_CODES, type MindrayResult } from '@/lib/mindray-types'
import TutorBusca from '@/components/TutorBusca'
import { ESPECIES, ESPECIE_PARA_REF } from '@/lib/especies'

interface Referencia {
  id:           number
  exame_id:     number
  codigo:       string
  nome:         string
  faixa_etaria: string
  metodo:       string
  valor_min:    number | null
  valor_max:    number | null
  unidade:      string | null
}

function calcFaixaEtaria(especie: string, idadeStr: string): string {
  const num = parseFloat(idadeStr)
  if (isNaN(num)) return 'todos'
  const anos = idadeStr.toLowerCase().includes('mes') || idadeStr.toLowerCase().includes('mês') ? num / 12 : num
  const esp = especie.toLowerCase()
  if (esp === 'canina') {
    if (anos < 1) return 'filhote'
    if (anos <= 7) return 'adulto'
    return 'idoso'
  }
  if (esp === 'felina') {
    if (anos < 1) return 'filhote'
    if (anos <= 10) return 'adulto'
    return 'idoso'
  }
  return 'todos'
}

function especieParaBanco(especie: string): string {
  return ESPECIE_PARA_REF[especie] ?? 'outro'
}

function refStatusBadge(valor: string, ref: Referencia | undefined) {
  if (!ref || ref.valor_min === null || ref.valor_max === null) {
    return <span className="text-[10px] font-semibold bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded whitespace-nowrap">— S/R</span>
  }
  const n = parseFloat(valor)
  if (isNaN(n)) return null
  if (n < ref.valor_min) return <span className="text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded whitespace-nowrap">↓ Baixo</span>
  if (n > ref.valor_max) return <span className="text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded whitespace-nowrap">↑ Alto</span>
  return <span className="text-[10px] font-bold bg-green-100 text-green-700 px-1.5 py-0.5 rounded whitespace-nowrap">✓ Normal</span>
}

const SEXOS    = ['Macho', 'Fêmea', 'Não informado']

const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36] focus:border-transparent bg-white'

// ── MetodoSelect ─────────────────────────────────────────────────────────────
function MetodoSelect({ opcoes, value, onChange }: {
  opcoes:   { id: number; metodo: string; unidade: string | null }[]
  value:    string
  onChange: (metodo: string, unidade: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = opcoes.find(o => o.metodo === value)

  return (
    <div className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="w-full flex items-center justify-between border-b border-gray-200 hover:border-[#c4a35a] focus:border-[#c4a35a] focus:outline-none py-1 text-sm bg-transparent text-left gap-1"
      >
        <span className={selected ? 'text-[#19202d]' : 'text-gray-400'}>
          {selected ? selected.metodo : '— selecionar —'}
        </span>
        <svg className={`w-3 h-3 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 10 6">
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <div className="absolute z-30 top-full mt-1 left-0 min-w-max bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          {opcoes.map(o => (
            <button
              key={o.id}
              type="button"
              onMouseDown={() => { onChange(o.metodo, o.unidade); setOpen(false) }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-amber-50 hover:text-[#8a6e36] transition border-b border-gray-50 last:border-0 whitespace-nowrap ${o.metodo === value ? 'bg-amber-50/60 text-[#8a6e36] font-medium' : 'text-[#19202d]'}`}
            >
              {o.metodo}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

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
  nome_pet:    string
  especie:     string
  raca:        string
  sexo:        string
  idade:       string
  peso:        string
  faixa_etaria: string
  tutor:       string
  telefone:    string
  material:    string
  data_laudo:  string
  veterinario_id: string
}



export default function NovoBioquimicaPage() {
  const router = useRouter()
  const fileInputRef   = useRef<HTMLInputElement>(null)
  const faixaManualRef = useRef(false)

  const [form, setForm] = useState<Form>({
    nome_pet:       '',
    especie:        '',
    raca:           '',
    sexo:           '',
    idade:          '',
    peso:           '',
    faixa_etaria:   '',
    tutor:          '',
    telefone:       '',
    material:       'Soro sanguíneo',
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
  const [referencias,  setReferencias]  = useState<Referencia[]>([])
  const [examesCad,    setExamesCad]    = useState<{ codigo: string; nome: string }[]>([])

  const loadVets = useCallback(async () => {
    const res = await fetch('/api/veterinarios')
    if (res.ok) setVets(await res.json())
  }, [])

  useEffect(() => { loadVets() }, [loadVets])

  useEffect(() => {
    fetch('/api/bioquimica/exames')
      .then(r => r.json())
      .then((d: { codigo: string | null; nome: string }[]) =>
        setExamesCad(d.filter(e => e.codigo).map(e => ({ codigo: e.codigo!, nome: e.nome })))
      )
      .catch(() => {})
  }, [])

  // Auto-suggest faixa_etaria when especie/idade change, unless user chose manually
  useEffect(() => {
    if (!form.especie || faixaManualRef.current) return
    const sugestao = calcFaixaEtaria(form.especie, form.idade)
    if (sugestao !== 'todos') {
      setForm(p => ({ ...p, faixa_etaria: sugestao }))
    }
  }, [form.especie, form.idade])

  // Fetch references whenever especie or faixa_etaria changes; auto-fills method when only one exists
  useEffect(() => {
    if (!form.especie || !form.faixa_etaria) { setReferencias([]); return }
    const esp = especieParaBanco(form.especie)
    fetch(`/api/bioquimica/referencia?especie=${esp}&faixa_etaria=${form.faixa_etaria}`)
      .then(r => r.json())
      .then(d => {
        const refs: Referencia[] = d.referencias ?? []
        setReferencias(refs)
        setResultados(prev => prev.map(r => {
          if (r.metodo) return r
          const metodosRef = refs.filter(ref => ref.codigo === r.codigo && ref.metodo)
          if (metodosRef.length !== 1) return r
          return { ...r, metodo: metodosRef[0].metodo, unidade: metodosRef[0].unidade ?? r.unidade }
        }))
      })
      .catch(() => setReferencias([]))
  }, [form.especie, form.faixa_etaria])

  function handleFormChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target
    if (name === 'faixa_etaria') faixaManualRef.current = true
    if (name === 'especie')      faixaManualRef.current = false
    setForm(p => ({
      ...p,
      [name]: value,
      ...(name === 'especie' ? { faixa_etaria: '' } : {}),
    }))
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
      nome_pet: data.paciente || prev.nome_pet,
      especie:  data.especie  || prev.especie,
      sexo:     data.sexo     || prev.sexo,
      idade:    data.idade    || prev.idade,
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

    const selectedVet = vets.find(v => v.id === vetId)

    // Merge reference values into exam results for the PDF (match by code + method)
    const resultadosComRef = resultados.map(r => {
      const metodo = r.metodo ?? ''
      const ref = referencias.find(ref => ref.codigo === r.codigo && ref.metodo === metodo)
             ?? referencias.find(ref => ref.codigo === r.codigo && ref.metodo === '')
      return {
        codigo:    r.codigo,
        nome:      r.nome,
        valor:     r.valor,
        unidade:   r.unidade,
        metodo,
        status:    r.status,
        valor_min: ref?.valor_min ?? null,
        valor_max: ref?.valor_max ?? null,
      }
    })

    const payload = {
      pdfData: {
        nome_pet:   form.nome_pet,
        especie:    form.especie,
        raca:       form.raca,
        sexo:       form.sexo,
        idade:      form.idade,
        peso:       form.peso,
        tutor:      form.tutor,
        telefone:   form.telefone,
        material:   form.material,
        medico:     selectedVet?.nome ?? '',
        crmv:       '',
        clinica:    typeof selectedVet?.clinicas === 'object' && selectedVet.clinicas !== null
                      ? (selectedVet.clinicas as { nome: string }).nome
                      : '',
        data_laudo: form.data_laudo,
        resultados: resultadosComRef,
      },
      tutor:              form.tutor,
      telefone:           form.telefone,
      sexo:               form.sexo,
      raca:               form.raca,
      medico_responsavel: selectedVet?.nome ?? '',
      data_laudo:         form.data_laudo,
      veterinario_id:     vetId,
      tutor_id:           tutorId,
      pet_id:             petId,
      agendamento_id:     null,
    }

    const res = await fetch('/api/laudos/gerar-bioquimica', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    })

    if (res.ok) {
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
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                    Faixa Etária <span className="text-[#c4a35a] font-normal normal-case tracking-normal">(altera a referência)</span>
                  </label>
                  <select name="faixa_etaria" value={form.faixa_etaria} onChange={handleFormChange} className={INPUT}>
                    <option value="">Selecione...</option>
                    <option value="filhote">Filhote</option>
                    <option value="adulto">Adulto</option>
                    <option value="idoso">Idoso</option>
                    <option value="todos">Todos</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Peso</label>
                  <input type="text" name="peso" value={form.peso} onChange={handleFormChange}
                    placeholder="Ex: 12,5 kg" className={INPUT} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Data do Laudo</label>
                  <input type="date" name="data_laudo" value={form.data_laudo} onChange={handleFormChange} className={INPUT} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Material</label>
                  <select name="material" value={form.material} onChange={handleFormChange} className={INPUT}>
                    <option value="Soro sanguíneo">Soro sanguíneo</option>
                    <option value="Plasma">Plasma</option>
                    <option value="Sangue total">Sangue total</option>
                  </select>
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
                        <th className="text-left text-xs font-semibold text-gray-400 uppercase pb-2 px-3">Referência</th>
                        <th className="text-center text-xs font-semibold text-gray-400 uppercase pb-2 px-3">Status</th>
                        <th className="pb-2 w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {resultados.map((r, i) => (
                        <tr key={i} className="border-b border-gray-50 last:border-0">
                          <td className="py-3 pr-3">
                            <input
                              type="text"
                              value={r.nome}
                              onChange={e => updateResultado(i, 'nome', e.target.value)}
                              className="w-full border-0 border-b border-gray-200 focus:border-[#c4a35a] focus:outline-none text-sm py-1 bg-transparent"
                              placeholder="Nome do exame"
                            />
                          </td>
                          <td className="py-3 px-3">
                            <input
                              type="text"
                              value={r.valor}
                              onChange={e => updateResultado(i, 'valor', e.target.value)}
                              className="w-24 border-0 border-b border-gray-200 focus:border-[#c4a35a] focus:outline-none text-sm py-1 text-right bg-transparent"
                              placeholder="0.00"
                            />
                          </td>
                          <td className="py-3 px-3">
                            <input
                              type="text"
                              value={r.unidade}
                              onChange={e => updateResultado(i, 'unidade', e.target.value)}
                              className="w-24 border-0 border-b border-gray-200 focus:border-[#c4a35a] focus:outline-none text-sm py-1 bg-transparent"
                              placeholder="U/L"
                            />
                          </td>
                          <td className="py-3 px-3 w-44">
                            {(() => {
                              const metodosRef = referencias.filter(ref => ref.codigo === r.codigo && ref.metodo)
                              if (metodosRef.length > 0) {
                                return (
                                  <MetodoSelect
                                    opcoes={metodosRef}
                                    value={r.metodo ?? ''}
                                    onChange={(metodo, unidade) => setResultados(prev => {
                                      const next = [...prev]
                                      next[i] = { ...next[i], metodo, unidade: unidade ?? next[i].unidade }
                                      return next
                                    })}
                                  />
                                )
                              }
                              return (
                                <input
                                  type="text"
                                  value={r.metodo ?? ''}
                                  onChange={e => updateResultado(i, 'metodo', e.target.value)}
                                  className="w-full border-0 border-b border-gray-200 focus:border-[#c4a35a] focus:outline-none text-sm py-1 bg-transparent"
                                  placeholder="Ex: Cinético"
                                />
                              )
                            })()}
                          </td>
                          {(() => {
                            const metodo = r.metodo ?? ''
                            const ref = referencias.find(ref => ref.codigo === r.codigo && ref.metodo === metodo)
                                     ?? referencias.find(ref => ref.codigo === r.codigo && ref.metodo === '')
                            return <>
                              <td className="py-3 px-3 text-xs text-gray-400 whitespace-nowrap">
                                {ref && ref.valor_min !== null && ref.valor_max !== null
                                  ? `${ref.valor_min} – ${ref.valor_max} ${ref.unidade ?? ''}`
                                  : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="py-3 px-3 text-center">
                                {r.valor ? refStatusBadge(r.valor, ref) : null}
                              </td>
                            </>
                          })()}
                          <td className="py-3 pl-2">
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
                    {examesCad.map(({ codigo, nome }) => (
                      <button
                        key={codigo}
                        type="button"
                        onClick={() => {
                          if (resultados.some(r => r.codigo === codigo)) return
                          const info = EXAM_CODES[codigo]
                          const metodosRef = referencias.filter(ref => ref.codigo === codigo && ref.metodo)
                          const autoRef    = metodosRef.length === 1 ? metodosRef[0] : null
                          setResultados(p => [...p, {
                            codigo,
                            nome:    info?.nome    ?? nome,
                            valor:   '',
                            unidade: autoRef?.unidade ?? info?.unidade ?? '',
                            metodo:  autoRef?.metodo  ?? '',
                            status:  '',
                          }])
                        }}
                        disabled={resultados.some(r => r.codigo === codigo)}
                        className="text-xs px-2 py-1 rounded border font-mono disabled:opacity-30 disabled:cursor-not-allowed bg-gray-50 hover:bg-amber-50 hover:border-[#c4a35a] border-gray-200 transition"
                      >
                        {codigo}
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
