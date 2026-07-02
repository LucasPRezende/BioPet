'use client'

import { useState, useRef, useCallback, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import LaudoSucesso from '@/components/LaudoSucesso'

interface AgendamentoInfo {
  tutor:     string
  telefone:  string
  pet_nome:  string
  especie:   string
  raca:      string
  medico:    string
  tutor_id:  number | null
  pet_id:    number | null
}

interface Metadados {
  nome_pet:     string
  especie:      string
  tutor:        string
  idade:        string
  tipo_amostra: string
  data_teste:   string
  total_exames: number
}

interface BioquimicaExame {
  codigo:    string
  nome:      string
  valor:     string
  unidade:   string
  metodo:    string
  status:    'N' | 'H' | 'L' | ''
  valor_min: number | null
  valor_max: number | null
  grupo?:    string
}

interface BioquimicaPDFData {
  nome_pet:   string
  especie:    string
  raca:       string
  sexo:       string
  idade:      string
  peso:       string
  tutor:      string
  telefone:   string
  medico:     string
  crmv:       string
  clinica:    string
  material:   string
  data_laudo: string
  titulo?:    string
  compact?:   boolean
  resultados: BioquimicaExame[]
}

interface Divergencia {
  campo:     string
  agendamento: string
  pdf:       string
}

const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3BA7B0] focus:border-transparent bg-white'

function norm(s: string) {
  return s.trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function detectDivergencias(ag: AgendamentoInfo, meta: Metadados): Divergencia[] {
  const divergencias: Divergencia[] = []

  if (meta.nome_pet && ag.pet_nome && norm(meta.nome_pet) !== norm(ag.pet_nome)) {
    divergencias.push({ campo: 'Paciente', agendamento: ag.pet_nome, pdf: meta.nome_pet })
  }
  if (meta.especie && ag.especie && norm(meta.especie) !== norm(ag.especie)) {
    divergencias.push({ campo: 'Espécie', agendamento: ag.especie, pdf: meta.especie })
  }
  if (meta.tutor && ag.tutor && norm(meta.tutor) !== norm(ag.tutor)) {
    divergencias.push({ campo: 'Tutor', agendamento: ag.tutor, pdf: meta.tutor })
  }
  return divergencias
}

function NovoHemogasometriaContent() {
  const router        = useRouter()
  const searchParams  = useSearchParams()
  const agendamentoId = searchParams.get('agendamento_id')

  const fileInputRef = useRef<HTMLInputElement>(null)

  const [loadingAg,   setLoadingAg]   = useState(false)
  const [agInfo,      setAgInfo]      = useState<AgendamentoInfo | null>(null)

  const [step,        setStep]        = useState<'upload' | 'preview'>('upload')
  const [uploading,   setUploading]   = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [saving,      setSaving]      = useState(false)
  const [saveError,   setSaveError]   = useState('')

  const [pdfData,      setPdfData]      = useState<BioquimicaPDFData | null>(null)
  const [metadados,    setMetadados]    = useState<Metadados | null>(null)
  const [previewUrl,   setPreviewUrl]   = useState<string | null>(null)
  const [divergencias, setDivergencias] = useState<Divergencia[]>([])

  const [success, setSuccess] = useState<{ id: number; token: string; tutor: string; telefone: string; nome_pet: string } | null>(null)

  const [form, setForm] = useState({
    tutor:              '',
    telefone:           '',
    sexo:               '',
    raca:               '',
    medico_responsavel: '',
    data_laudo:         new Date().toLocaleDateString('en-CA'),
  })

  // Carrega dados do agendamento ao montar
  useEffect(() => {
    if (!agendamentoId) return
    setLoadingAg(true)

    fetch(`/api/agendamentos/${agendamentoId}`)
      .then(r => r.ok ? r.json() : null)
      .then(async d => {
        if (!d) return
        const tutor = (Array.isArray(d.tutores) ? d.tutores[0] : d.tutores) as { id: number; nome: string; telefone: string } | null
        const pet   = (Array.isArray(d.pets)    ? d.pets[0]    : d.pets)    as { id: number; nome: string; especie: string; raca: string } | null

        // Busca nome do vet pelo veterinario_id que vem no campo raiz do agendamento
        let vetNome = ''
        if (d.veterinario_id) {
          const vRes = await fetch('/api/veterinarios').then(r => r.ok ? r.json() : [])
          const v = (vRes as { id: number; nome: string }[]).find(v => v.id === d.veterinario_id)
          vetNome = v?.nome ?? ''
        }

        const info: AgendamentoInfo = {
          tutor:    tutor?.nome     ?? '',
          telefone: tutor?.telefone ?? '',
          pet_nome: pet?.nome       ?? '',
          especie:  pet?.especie    ?? '',
          raca:     pet?.raca       ?? '',
          medico:   vetNome,
          tutor_id: tutor?.id       ?? null,
          pet_id:   pet?.id         ?? null,
        }
        setAgInfo(info)
        setForm(p => ({
          ...p,
          tutor:              info.tutor,
          telefone:           info.telefone,
          raca:               info.raca,
          medico_responsavel: info.medico,
        }))
      })
      .finally(() => setLoadingAg(false))
  }, [agendamentoId])

  const handleFile = useCallback(async (file: File) => {
    setUploading(true)
    setUploadError('')

    const fd = new FormData()
    fd.append('pdf', file)

    const res = await fetch('/api/laudos/parse-analisador', { method: 'POST', body: fd })

    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setUploadError(d.error ?? `Erro ${res.status}`)
      setUploading(false)
      return
    }

    const data = await res.json()

    const bytes = Uint8Array.from(atob(data.pdfBase64), c => c.charCodeAt(0))
    const blob  = new Blob([bytes], { type: 'application/pdf' })
    const url   = URL.createObjectURL(blob)

    setPreviewUrl(url)
    setPdfData(data.pdfData)
    setMetadados(data.metadados)

    // Só sobrescreve tutor/data se ainda não veio do agendamento
    setForm(p => ({
      ...p,
      tutor:     p.tutor || data.metadados.tutor || '',
      data_laudo: data.metadados.data_teste || p.data_laudo,
    }))

    // Detecta divergências entre o PDF e o agendamento
    if (agInfo) {
      setDivergencias(detectDivergencias(agInfo, data.metadados))
    }

    setStep('preview')
    setUploading(false)
  }, [agInfo])

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  function resetUpload() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setPdfData(null)
    setMetadados(null)
    setDivergencias([])
    setStep('upload')
    setUploadError('')
    setSaveError('')
  }

  async function handleSave() {
    if (!pdfData) return
    setSaving(true)
    setSaveError('')

    // Quando vinculado a um agendamento, a identidade do paciente vem do sistema,
    // não do arquivo da máquina. Apenas os resultados laboratoriais vêm do PDF.
    const finalPdfData: BioquimicaPDFData = agInfo ? {
      ...pdfData,
      nome_pet:  agInfo.pet_nome || pdfData.nome_pet,
      especie:   agInfo.especie  || pdfData.especie,
      raca:      form.raca       || agInfo.raca || pdfData.raca,
      tutor:     form.tutor      || agInfo.tutor || pdfData.tutor,
      telefone:  form.telefone   || agInfo.telefone,
    } : pdfData

    const payload = {
      pdfData:            finalPdfData,
      tutor:              form.tutor       || agInfo?.tutor   || pdfData.tutor,
      telefone:           form.telefone    || agInfo?.telefone || '',
      sexo:               form.sexo,
      raca:               form.raca        || agInfo?.raca    || '',
      medico_responsavel: form.medico_responsavel,
      data_laudo:         form.data_laudo,
      veterinario_id:     null,
      tutor_id:           agInfo?.tutor_id ?? null,
      pet_id:             agInfo?.pet_id   ?? null,
      agendamento_id:     agendamentoId ? parseInt(agendamentoId, 10) : null,
    }

    const res = await fetch('/api/laudos/salvar-hemogasometria', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    })

    if (res.ok) {
      const laudo = await res.json()
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setSuccess({
        id:       laudo.id,
        token:    laudo.token,
        tutor:    laudo.tutor,
        telefone: laudo.telefone,
        nome_pet: laudo.nome_pet,
      })
    } else {
      const d = await res.json().catch(() => ({}))
      setSaveError(d.error ?? 'Erro ao salvar laudo.')
    }

    setSaving(false)
  }

  if (success) {
    return (
      <LaudoSucesso
        laudoId={success.id}
        tutor={success.tutor}
        telefone={success.telefone}
        titulo="Laudo salvo!"
        subtitulo={`${success.nome_pet} · ${success.tutor}`}
      />
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-5xl mx-auto px-4 py-8 space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => step === 'preview' ? resetUpload() : router.back()}
            className="text-gray-400 hover:text-gray-600 transition text-sm"
          >
            ← Voltar
          </button>
          <div>
            <h1 className="text-2xl font-bold text-[#19202d]">🫁 Hemogasometria</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {step === 'upload' ? 'Importe o PDF do analisador' : 'Revise e salve o laudo'}
            </p>
          </div>
          {agendamentoId && (
            <span className="ml-auto text-xs bg-purple-50 text-purple-700 border border-purple-200 px-3 py-1.5 rounded-full font-semibold">
              Agendamento #{agendamentoId}
            </span>
          )}
        </div>

        {/* Card com dados do agendamento — sempre visível quando há agendamento_id */}
        {agendamentoId && (
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-purple-400 to-purple-600" />
            <div className="p-5">
              {loadingAg ? (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <div className="animate-spin w-4 h-4 border-2 border-gray-300 border-t-purple-500 rounded-full" />
                  Carregando dados do agendamento...
                </div>
              ) : agInfo ? (
                <>
                  <p className="text-xs font-bold text-[#19202d] uppercase tracking-widest mb-3">Dados do agendamento</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                    {[
                      { label: 'Paciente',  value: agInfo.pet_nome },
                      { label: 'Espécie',   value: agInfo.especie },
                      { label: 'Raça',      value: agInfo.raca },
                      { label: 'Tutor',     value: agInfo.tutor },
                      { label: 'Telefone',  value: agInfo.telefone },
                      { label: 'Médico',    value: agInfo.medico },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <span className="text-[11px] text-gray-400 uppercase tracking-wide">{label}</span>
                        <p className="font-semibold text-[#19202d] truncate">{value || '—'}</p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-400">Agendamento não encontrado.</p>
              )}
            </div>
          </div>
        )}

        {/* Aviso de divergência */}
        {divergencias.length > 0 && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-amber-500 text-lg">⚠️</span>
              <p className="font-bold text-amber-800 text-sm">
                O PDF do analisador não bate com os dados do agendamento
              </p>
            </div>
            <div className="space-y-1.5">
              {divergencias.map(d => (
                <div key={d.campo} className="text-xs text-amber-800 grid grid-cols-[80px_1fr_1fr] gap-2 items-center">
                  <span className="font-bold uppercase tracking-wide text-amber-600">{d.campo}</span>
                  <span className="bg-white border border-amber-200 rounded px-2 py-1">
                    <span className="text-gray-400 mr-1">Agendamento:</span>{d.agendamento}
                  </span>
                  <span className="bg-white border border-amber-200 rounded px-2 py-1">
                    <span className="text-gray-400 mr-1">PDF:</span>{d.pdf}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-amber-600 mt-1">
              Confira se o PDF enviado é do paciente correto. Os dados do agendamento já foram preenchidos no formulário.
            </p>
          </div>
        )}

        {/* Upload step */}
        {step === 'upload' && (
          <div
            className="bg-white rounded-2xl border-2 border-dashed border-gray-200 hover:border-[#3BA7B0]/50 transition-colors cursor-pointer"
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            onClick={() => !uploading && fileInputRef.current?.click()}
          >
            <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
              {uploading ? (
                <>
                  <div className="animate-spin w-10 h-10 border-4 border-[#3BA7B0] border-t-transparent rounded-full mb-4" />
                  <p className="text-[#19202d] font-semibold">Processando PDF...</p>
                  <p className="text-gray-400 text-sm mt-1">Isso pode levar alguns segundos</p>
                </>
              ) : (
                <>
                  <div className="text-6xl mb-4">🫁</div>
                  <p className="text-[#19202d] font-bold text-lg mb-1">Arraste o PDF do analisador</p>
                  <p className="text-gray-400 text-sm">ou clique para selecionar o arquivo</p>
                  <p className="text-[11px] text-gray-300 mt-4">Formatos suportados: PDF gerado por aparelhos de gasometria</p>
                </>
              )}
            </div>
            {uploadError && (
              <div className="mx-6 mb-6 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                {uploadError}
              </div>
            )}
            <input ref={fileInputRef} type="file" accept=".pdf" onChange={handleFileInput} className="hidden" />
          </div>
        )}

        {/* Preview step */}
        {step === 'preview' && pdfData && metadados && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 items-start">

            {/* PDF Preview */}
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-[#3BA7B0] to-[#2a8f98]" />
              <div className="p-4">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Pré-visualização do laudo</p>
                {previewUrl && (
                  <iframe
                    src={previewUrl}
                    className="w-full rounded-lg border border-gray-100"
                    style={{ height: '76vh', minHeight: '600px' }}
                    title="Pré-visualização do laudo"
                  />
                )}
              </div>
            </div>

            {/* Right column */}
            <div className="space-y-4">

              {/* Parsed data summary */}
              <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-[#3BA7B0] to-[#2a8f98]" />
                <div className="p-5 space-y-3">
                  <h2 className="text-xs font-bold text-[#19202d] uppercase tracking-widest">Extraído do PDF</h2>
                  <dl className="space-y-2 text-sm">
                    {[
                      { label: 'Paciente', value: metadados.nome_pet, hasDiff: divergencias.some(d => d.campo === 'Paciente') },
                      { label: 'Espécie',  value: metadados.especie,  hasDiff: divergencias.some(d => d.campo === 'Espécie') },
                      { label: 'Tutor',    value: metadados.tutor,    hasDiff: divergencias.some(d => d.campo === 'Tutor') },
                      { label: 'Idade',    value: metadados.idade,    hasDiff: false },
                      { label: 'Amostra',  value: metadados.tipo_amostra, hasDiff: false },
                      { label: 'Data',     value: metadados.data_teste,   hasDiff: false },
                    ].map(({ label, value, hasDiff }) => (
                      <div key={label} className="flex justify-between gap-2 items-center">
                        <dt className="text-gray-400 shrink-0">{label}</dt>
                        <dd className={`font-semibold text-right flex items-center gap-1 ${hasDiff ? 'text-amber-600' : 'text-[#19202d]'}`}>
                          {hasDiff && <span title="Diverge do agendamento">⚠️</span>}
                          {value || '—'}
                        </dd>
                      </div>
                    ))}
                    <div className="flex justify-between gap-2 pt-1 border-t border-gray-100">
                      <dt className="text-gray-400 shrink-0">Exames</dt>
                      <dd className="font-bold text-[#3BA7B0]">{metadados.total_exames} resultados</dd>
                    </div>
                  </dl>
                </div>
              </div>

              {/* Form fields */}
              <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="h-1 bg-gold-stripe" />
                <div className="p-5 space-y-4">
                  <h2 className="text-xs font-bold text-[#19202d] uppercase tracking-widest">Dados do laudo</h2>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Tutor</label>
                    <input type="text" value={form.tutor}
                      onChange={e => setForm(p => ({ ...p, tutor: e.target.value }))}
                      placeholder="Nome do tutor" className={INPUT} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Telefone</label>
                    <input type="tel" value={form.telefone}
                      onChange={e => setForm(p => ({ ...p, telefone: e.target.value }))}
                      placeholder="(24) 99999-9999" className={INPUT} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Sexo</label>
                      <select value={form.sexo} onChange={e => setForm(p => ({ ...p, sexo: e.target.value }))} className={INPUT}>
                        <option value="">—</option>
                        <option>Macho</option>
                        <option>Fêmea</option>
                        <option>Não informado</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Raça</label>
                      <input type="text" value={form.raca}
                        onChange={e => setForm(p => ({ ...p, raca: e.target.value }))}
                        placeholder="Raça" className={INPUT} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Médico Responsável</label>
                    <input type="text" value={form.medico_responsavel}
                      onChange={e => setForm(p => ({ ...p, medico_responsavel: e.target.value }))}
                      placeholder="Nome do veterinário" className={INPUT} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Data do Laudo</label>
                    <input type="date" value={form.data_laudo}
                      onChange={e => setForm(p => ({ ...p, data_laudo: e.target.value }))}
                      className={INPUT} />
                  </div>
                </div>
              </div>

              {saveError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                  {saveError}
                </p>
              )}

              <button onClick={handleSave} disabled={saving}
                className="w-full bg-[#3BA7B0] hover:bg-[#2a8f98] disabled:opacity-50 text-white font-bold py-3.5 rounded-xl transition text-sm tracking-wide">
                {saving ? 'Salvando...' : '✨ Salvar como Laudo'}
              </button>

              <button onClick={resetUpload}
                className="w-full border border-gray-200 text-gray-500 font-semibold py-2.5 rounded-xl text-sm hover:bg-gray-50 transition">
                ← Carregar outro PDF
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default function NovoHemogasometriaPage() {
  return (
    <Suspense>
      <NovoHemogasometriaContent />
    </Suspense>
  )
}
