'use client'

import { useState, useRef, useCallback, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import LaudoSucesso from '@/components/LaudoSucesso'
import { ESPECIES, normalizarEspecie } from '@/lib/especies'
import { calcFaixaEtaria, type FaixaConfig } from '@/lib/faixas-etarias'
import {
  PARAMETROS_HEMOGRAMA, CELULAS_LEUCOGRAMA, GRUPOS_HEMOGRAMA, parametroPorCodigo,
  type AmostraHemograma,
} from '@/lib/hemograma'

interface AgendamentoInfo {
  tutor:     string
  telefone:  string
  pet_nome:  string
  especie:   string
  raca:      string
  sexo:      string
  idade:     string
  tutor_id:  number | null
  pet_id:    number | null
}

interface Divergencia { campo: string; agendamento: string; arquivo: string }

const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3BA7B0] focus:border-transparent bg-white'
const INPUT_NUM = 'w-full border border-gray-200 rounded-md px-2 py-1 text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-[#3BA7B0] bg-white'

const FAIXAS = [
  { label: 'Todos',   value: 'todos' },
  { label: 'Filhote', value: 'filhote' },
  { label: 'Adulto',  value: 'adulto' },
  { label: 'Idoso',   value: 'idoso' },
]

function norm(s: string) {
  return s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function calcIdadeDeNascimento(dataNasc: string): string {
  const nasc = new Date(dataNasc)
  const hoje = new Date()
  let anos = hoje.getFullYear() - nasc.getFullYear()
  let meses = hoje.getMonth() - nasc.getMonth()
  if (hoje.getDate() < nasc.getDate()) meses--
  if (meses < 0) { anos--; meses += 12 }
  if (anos < 1) return `${meses} ${meses === 1 ? 'mês' : 'meses'}`
  return `${anos} ${anos === 1 ? 'ano' : 'anos'}`
}

function detectDivergencias(ag: AgendamentoInfo, a: AmostraHemograma): Divergencia[] {
  const out: Divergencia[] = []
  if (a.paciente && ag.pet_nome && norm(a.paciente) !== norm(ag.pet_nome))
    out.push({ campo: 'Paciente', agendamento: ag.pet_nome, arquivo: a.paciente })
  const espArq = normalizarEspecie(a.animal) ?? ''
  if (espArq && ag.especie && norm(espArq) !== norm(ag.especie))
    out.push({ campo: 'Espécie', agendamento: ag.especie, arquivo: a.animal })
  if (a.proprietario && ag.tutor && norm(a.proprietario) !== norm(ag.tutor))
    out.push({ campo: 'Tutor', agendamento: ag.tutor, arquivo: a.proprietario })
  return out
}

/** Arredonda para as casas do parâmetro, sem zeros à direita desnecessários. */
function arred(n: number, casas: number): string {
  return String(Number(n.toFixed(casas)))
}

function NovoHemogramaContent() {
  const router        = useRouter()
  const searchParams  = useSearchParams()
  const agendamentoId = searchParams.get('agendamento_id')

  const fileInputRef = useRef<HTMLInputElement>(null)

  const [loadingAg, setLoadingAg] = useState(false)
  const [agInfo,    setAgInfo]    = useState<AgendamentoInfo | null>(null)
  const [vets,      setVets]      = useState<{ id: number; nome: string }[]>([])
  const [vetId,     setVetId]     = useState<number | null>(null)
  const [faixaCfg,  setFaixaCfg]  = useState<FaixaConfig[]>([])

  const [step,        setStep]        = useState<'upload' | 'escolher' | 'revisao'>('upload')
  const [uploading,   setUploading]   = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [amostras,    setAmostras]    = useState<AmostraHemograma[]>([])
  const [amostra,     setAmostra]     = useState<AmostraHemograma | null>(null)
  const [divergencias, setDivergencias] = useState<Divergencia[]>([])

  const [valores,     setValores]     = useState<Record<string, string>>({})
  const [observacoes, setObservacoes] = useState('')

  const [previewUrl,   setPreviewUrl]   = useState<string | null>(null)
  const [previewing,   setPreviewing]   = useState(false)
  const [desatualizada, setDesatualizada] = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [erro,         setErro]         = useState('')

  const [success, setSuccess] = useState<{ id: number; tutor: string; telefone: string; nome_pet: string } | null>(null)

  const faixaManual = useRef(false)
  const [form, setForm] = useState({
    nome_pet:     '',
    especie:      '',
    raca:         '',
    sexo:         '',
    idade:        '',
    faixa_etaria: 'todos',
    tutor:        '',
    telefone:     '',
    clinica:      '',
    material:     'Sangue total (EDTA)',
    data_laudo:   new Date().toLocaleDateString('en-CA'),
  })

  useEffect(() => {
    fetch('/api/veterinarios').then(r => r.ok ? r.json() : []).then(setVets).catch(() => {})
    fetch('/api/bioquimica/faixas-etarias').then(r => r.ok ? r.json() : []).then(setFaixaCfg).catch(() => {})
  }, [])

  // Faixa etária automática a partir de espécie + idade (até a pessoa escolher manualmente)
  useEffect(() => {
    if (faixaManual.current || !form.especie || !form.idade) return
    const sugestao = calcFaixaEtaria(form.especie, form.idade, faixaCfg)
    setForm(p => p.faixa_etaria === sugestao ? p : { ...p, faixa_etaria: sugestao })
  }, [form.especie, form.idade, faixaCfg])

  useEffect(() => {
    if (!agendamentoId) return
    setLoadingAg(true)
    fetch(`/api/agendamentos/${agendamentoId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return
        const tutor = (Array.isArray(d.tutores) ? d.tutores[0] : d.tutores) as { id: number; nome: string; telefone: string } | null
        const pet   = (Array.isArray(d.pets) ? d.pets[0] : d.pets) as
          { id: number; nome: string; especie: string; raca: string; sexo?: string; data_nascimento?: string } | null
        if (d.veterinario_id) setVetId(Number(d.veterinario_id))
        const info: AgendamentoInfo = {
          tutor:    tutor?.nome     ?? '',
          telefone: tutor?.telefone ?? '',
          pet_nome: pet?.nome       ?? '',
          especie:  pet?.especie    ?? '',
          raca:     pet?.raca       ?? '',
          sexo:     pet?.sexo       ?? '',
          idade:    pet?.data_nascimento ? calcIdadeDeNascimento(pet.data_nascimento) : '',
          tutor_id: tutor?.id       ?? null,
          pet_id:   pet?.id         ?? null,
        }
        setAgInfo(info)
        setForm(p => ({
          ...p,
          nome_pet: info.pet_nome, especie: info.especie, raca: info.raca, sexo: info.sexo,
          idade: info.idade || p.idade, tutor: info.tutor, telefone: info.telefone,
        }))
      })
      .catch(() => {})
      .finally(() => setLoadingAg(false))
  }, [agendamentoId])

  function escolherAmostra(a: AmostraHemograma) {
    setAmostra(a)
    setValores({ ...a.valores })
    setObservacoes('')
    // Identidade do paciente vem do agendamento quando houver; do arquivo só completa o que faltar
    setForm(p => ({
      ...p,
      nome_pet:   p.nome_pet || a.paciente,
      especie:    p.especie  || normalizarEspecie(a.animal) || '',
      idade:      p.idade    || a.idade,
      tutor:      p.tutor    || a.proprietario,
      data_laudo: a.data_iso || p.data_laudo,
    }))
    setDivergencias(agInfo ? detectDivergencias(agInfo, a) : [])
    setStep('revisao')
    setDesatualizada(true)
  }

  const handleFile = useCallback(async (file: File) => {
    setUploading(true)
    setUploadError('')
    const fd = new FormData()
    fd.append('arquivo', file)
    const res = await fetch('/api/laudos/parse-hemograma', { method: 'POST', body: fd }).catch(() => null)
    if (!res || !res.ok) {
      const d = res ? await res.json().catch(() => ({})) : {}
      setUploadError(d.error ?? 'Erro ao ler o arquivo.')
      setUploading(false)
      return
    }
    const { amostras: lista } = await res.json() as { amostras: AmostraHemograma[] }
    setAmostras(lista)
    setUploading(false)
    if (lista.length === 1) escolherAmostra(lista[0])
    else setStep('escolher')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agInfo])

  function montarLaudo() {
    const vetNome = vets.find(v => v.id === vetId)?.nome ?? ''
    return {
      nome_pet:     form.nome_pet.trim(),
      especie:      form.especie,
      raca:         form.raca,
      sexo:         form.sexo,
      idade:        form.idade,
      peso:         '',
      tutor:        form.tutor,
      telefone:     form.telefone,
      medico:       vetNome,
      crmv:         '',
      clinica:      form.clinica,
      material:     form.material,
      data_laudo:   form.data_laudo,
      faixa_etaria: form.faixa_etaria,
      observacoes,
      valores:      Object.fromEntries(Object.entries(valores).filter(([, v]) => v.trim() !== '')),
    }
  }

  function validar(): string {
    if (!form.nome_pet.trim()) return 'Informe o nome do paciente.'
    if (!form.especie)         return 'Informe a espécie (define os valores de referência).'
    return ''
  }

  async function gerarPrevia() {
    const v = validar()
    if (v) { setErro(v); return }
    setPreviewing(true)
    setErro('')
    try {
      const res = await fetch('/api/laudos/preview-hemograma', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ laudo: montarLaudo() }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setErro(d.error ?? 'Erro ao gerar a prévia.')
      } else {
        const blob = await res.blob()
        if (previewUrl) URL.revokeObjectURL(previewUrl)
        setPreviewUrl(URL.createObjectURL(blob))
        setDesatualizada(false)
      }
    } catch {
      setErro('Erro ao gerar a prévia.')
    }
    setPreviewing(false)
  }

  async function salvar() {
    const v = validar()
    if (v) { setErro(v); return }
    setSaving(true)
    setErro('')
    const res = await fetch('/api/laudos/salvar-hemograma', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        laudo:          montarLaudo(),
        veterinario_id: vetId,
        tutor_id:       agInfo?.tutor_id ?? null,
        pet_id:         agInfo?.pet_id   ?? null,
        agendamento_id: agendamentoId ? parseInt(agendamentoId, 10) : null,
      }),
    }).catch(() => null)
    if (res?.ok) {
      const laudo = await res.json()
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setSuccess({ id: laudo.id, tutor: laudo.tutor, telefone: laudo.telefone, nome_pet: laudo.nome_pet })
    } else {
      const d = res ? await res.json().catch(() => ({})) : {}
      setErro(d.error ?? 'Erro ao salvar laudo.')
    }
    setSaving(false)
  }

  function resetUpload() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setAmostras([])
    setAmostra(null)
    setValores({})
    setDivergencias([])
    setErro('')
    setUploadError('')
    setStep('upload')
  }

  // Edição de valor. Ao mudar leucócitos totais ou um relativo (%), recalcula o
  // absoluto correspondente — caso típico: diferencial corrigido na lâmina.
  function setValor(codigo: string, valor: string) {
    const v = valor.replace(',', '.')
    setDesatualizada(true)
    setValores(prev => {
      const next = { ...prev, [codigo]: v }
      const leu = parseFloat(codigo === 'LEU' ? v : prev.LEU ?? '')
      const casasAbs = parametroPorCodigo('NEU_ABS')!.casas
      const recalcula = (cel: string) => {
        const rel = parseFloat(next[`${cel}_REL`] ?? '')
        if (!isNaN(leu) && !isNaN(rel)) next[`${cel}_ABS`] = arred(leu * rel / 100, casasAbs)
      }
      if (codigo === 'LEU') CELULAS_LEUCOGRAMA.forEach(recalcula)
      else if (codigo.endsWith('_REL')) recalcula(codigo.replace('_REL', ''))
      return next
    })
  }

  const somaDiferencial = CELULAS_LEUCOGRAMA
    .map(c => parseFloat(valores[`${c}_REL`] ?? ''))
    .filter(n => !isNaN(n))
    .reduce((a, b) => a + b, 0)

  // Gera a primeira prévia sozinha ao entrar na revisão
  useEffect(() => {
    if (step === 'revisao' && !previewUrl && !previewing && form.nome_pet && form.especie) gerarPrevia()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

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

  const campo = (label: string, el: React.ReactNode) => (
    <div>
      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{label}</label>
      {el}
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-5">

        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => step === 'upload' ? router.back() : resetUpload()}
            className="text-gray-400 hover:text-gray-600 transition text-sm">
            ← Voltar
          </button>
          <div>
            <h1 className="text-2xl font-bold text-[#19202d]">🩸 Hemograma</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {step === 'upload' ? 'Importe o arquivo CSV do analisador hematológico'
                : step === 'escolher' ? 'Escolha a amostra' : 'Revise os valores e salve o laudo'}
            </p>
          </div>
          {agendamentoId && (
            <span className="ml-auto text-xs bg-rose-50 text-rose-700 border border-rose-200 px-3 py-1.5 rounded-full font-semibold">
              Agendamento #{agendamentoId}
            </span>
          )}
        </div>

        {agendamentoId && (
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-rose-400 to-rose-600" />
            <div className="p-5">
              {loadingAg ? (
                <p className="text-sm text-gray-400">Carregando dados do agendamento...</p>
              ) : agInfo ? (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-6 gap-y-2 text-sm">
                  {[
                    { label: 'Paciente', value: agInfo.pet_nome },
                    { label: 'Espécie',  value: agInfo.especie },
                    { label: 'Raça',     value: agInfo.raca },
                    { label: 'Tutor',    value: agInfo.tutor },
                    { label: 'Telefone', value: agInfo.telefone },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <span className="text-[11px] text-gray-400 uppercase tracking-wide">{label}</span>
                      <p className="font-semibold text-[#19202d] truncate">{value || '—'}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">Agendamento não encontrado.</p>
              )}
            </div>
          </div>
        )}

        {divergencias.length > 0 && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-2">
            <p className="font-bold text-amber-800 text-sm">⚠️ O arquivo do analisador não bate com os dados do agendamento</p>
            {divergencias.map(d => (
              <div key={d.campo} className="text-xs text-amber-800 grid grid-cols-[80px_1fr_1fr] gap-2 items-center">
                <span className="font-bold uppercase tracking-wide text-amber-600">{d.campo}</span>
                <span className="bg-white border border-amber-200 rounded px-2 py-1"><span className="text-gray-400 mr-1">Agendamento:</span>{d.agendamento}</span>
                <span className="bg-white border border-amber-200 rounded px-2 py-1"><span className="text-gray-400 mr-1">Arquivo:</span>{d.arquivo}</span>
              </div>
            ))}
            <p className="text-xs text-amber-600">Confira se é a amostra do paciente correto. O laudo usa os dados do agendamento.</p>
          </div>
        )}

        {step === 'upload' && (
          <div
            className="bg-white rounded-2xl border-2 border-dashed border-gray-200 hover:border-[#3BA7B0]/50 transition-colors cursor-pointer"
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
            onDragOver={e => e.preventDefault()}
            onClick={() => !uploading && fileInputRef.current?.click()}
          >
            <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
              {uploading ? (
                <>
                  <div className="animate-spin w-10 h-10 border-4 border-[#3BA7B0] border-t-transparent rounded-full mb-4" />
                  <p className="text-[#19202d] font-semibold">Lendo arquivo...</p>
                </>
              ) : (
                <>
                  <div className="text-6xl mb-4">🩸</div>
                  <p className="text-[#19202d] font-bold text-lg mb-1">Arraste o CSV do analisador</p>
                  <p className="text-gray-400 text-sm">ou clique para selecionar o arquivo</p>
                  <p className="text-[11px] text-gray-300 mt-4">Arquivo .csv exportado pela máquina de hematologia</p>
                </>
              )}
            </div>
            {uploadError && (
              <div className="mx-6 mb-6 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{uploadError}</div>
            )}
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />
          </div>
        )}

        {step === 'escolher' && (
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-[#3BA7B0] to-[#2a8f98]" />
            <div className="p-5">
              <p className="text-sm text-gray-500 mb-3">O arquivo tem {amostras.length} amostras. Qual é a deste laudo?</p>
              <div className="divide-y border rounded-lg">
                {amostras.map((a, i) => (
                  <button key={i} onClick={() => escolherAmostra(a)}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                    <span className="font-semibold text-[#19202d]">{a.paciente || `Amostra ${a.id}`}</span>
                    <span className="text-gray-500">{a.animal}</span>
                    {a.proprietario && <span className="text-gray-500">Tutor: {a.proprietario}</span>}
                    <span className="text-gray-400 ml-auto">{a.data_hora}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 'revisao' && amostra && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-5 items-start">

            {/* Prévia */}
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden lg:sticky lg:top-4">
              <div className="h-1 bg-gradient-to-r from-[#3BA7B0] to-[#2a8f98]" />
              <div className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Pré-visualização do laudo</p>
                  {desatualizada && previewUrl && (
                    <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">desatualizada</span>
                  )}
                  <button onClick={gerarPrevia} disabled={previewing}
                    className="ml-auto text-xs font-semibold text-[#2a8f98] border border-[#3BA7B0]/40 rounded-lg px-3 py-1.5 hover:bg-[#3BA7B0]/10 disabled:opacity-50">
                    {previewing ? 'Gerando...' : '↻ Atualizar prévia'}
                  </button>
                </div>
                {previewUrl ? (
                  <iframe src={previewUrl} className="w-full rounded-lg border border-gray-100"
                    style={{ height: '78vh', minHeight: '600px' }} title="Pré-visualização do laudo" />
                ) : (
                  <div className="h-[60vh] flex items-center justify-center text-sm text-gray-400">
                    {previewing ? 'Gerando prévia...' : 'Preencha paciente e espécie e clique em Atualizar prévia.'}
                  </div>
                )}
              </div>
            </div>

            {/* Formulário */}
            <div className="space-y-4">
              <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="h-1 bg-gold-stripe" />
                <div className="p-5 space-y-3">
                  <h2 className="text-xs font-bold text-[#19202d] uppercase tracking-widest">Paciente</h2>
                  <p className="text-[11px] text-gray-400">
                    No arquivo: <b>{amostra.paciente || '—'}</b> · {amostra.animal || '—'} · {amostra.data_hora || '—'}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {campo('Nome', <input value={form.nome_pet} onChange={e => { setForm(p => ({ ...p, nome_pet: e.target.value })); setDesatualizada(true) }} className={INPUT} />)}
                    {campo('Espécie', (
                      <select value={form.especie} onChange={e => { faixaManual.current = false; setForm(p => ({ ...p, especie: e.target.value })); setDesatualizada(true) }} className={INPUT}>
                        <option value="">—</option>
                        {ESPECIES.map(e => <option key={e}>{e}</option>)}
                      </select>
                    ))}
                    {campo('Raça', <input value={form.raca} onChange={e => { setForm(p => ({ ...p, raca: e.target.value })); setDesatualizada(true) }} className={INPUT} />)}
                    {campo('Sexo', (
                      <select value={form.sexo} onChange={e => { setForm(p => ({ ...p, sexo: e.target.value })); setDesatualizada(true) }} className={INPUT}>
                        <option value="">—</option>
                        <option>Macho</option>
                        <option>Fêmea</option>
                      </select>
                    ))}
                    {campo('Idade', <input value={form.idade} placeholder="ex: 3 anos" onChange={e => { faixaManual.current = false; setForm(p => ({ ...p, idade: e.target.value })); setDesatualizada(true) }} className={INPUT} />)}
                    {campo('Faixa (referência)', (
                      <select value={form.faixa_etaria} onChange={e => { faixaManual.current = true; setForm(p => ({ ...p, faixa_etaria: e.target.value })); setDesatualizada(true) }} className={INPUT}>
                        {FAIXAS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                      </select>
                    ))}
                    {campo('Tutor', <input value={form.tutor} onChange={e => { setForm(p => ({ ...p, tutor: e.target.value })); setDesatualizada(true) }} className={INPUT} />)}
                    {campo('Telefone', <input value={form.telefone} onChange={e => { setForm(p => ({ ...p, telefone: e.target.value })); setDesatualizada(true) }} className={INPUT} />)}
                    {campo('Médico Responsável', (
                      <select value={vetId ?? ''} onChange={e => { setVetId(e.target.value ? Number(e.target.value) : null); setDesatualizada(true) }} className={INPUT}>
                        <option value="">— Não informado</option>
                        {vets.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
                      </select>
                    ))}
                    {campo('Clínica', <input value={form.clinica} onChange={e => { setForm(p => ({ ...p, clinica: e.target.value })); setDesatualizada(true) }} className={INPUT} />)}
                    {campo('Material', <input value={form.material} onChange={e => { setForm(p => ({ ...p, material: e.target.value })); setDesatualizada(true) }} className={INPUT} />)}
                    {campo('Data do laudo', <input type="date" value={form.data_laudo} onChange={e => { setForm(p => ({ ...p, data_laudo: e.target.value })); setDesatualizada(true) }} className={INPUT} />)}
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-[#3BA7B0] to-[#2a8f98]" />
                <div className="p-5 space-y-4">
                  <div>
                    <h2 className="text-xs font-bold text-[#19202d] uppercase tracking-widest">Resultados</h2>
                    <p className="text-[11px] text-gray-400 mt-1">Valores do analisador — edite se precisar corrigir (ex.: diferencial contado na lâmina; o absoluto recalcula sozinho).</p>
                  </div>

                  {GRUPOS_HEMOGRAMA.map(({ grupo, titulo }) => (
                    <div key={grupo}>
                      <p className="text-[11px] font-bold text-[#2a8f98] uppercase tracking-wider mb-1.5">{titulo}</p>
                      {grupo !== 'leucograma' ? (
                        <div className="space-y-1">
                          {PARAMETROS_HEMOGRAMA.filter(p => p.grupo === grupo).map(p => (
                            <div key={p.codigo} className="grid grid-cols-[1fr_100px_60px] gap-2 items-center text-sm">
                              <span className="text-[#19202d]">{p.nome}</span>
                              <input inputMode="decimal" value={valores[p.codigo] ?? ''} onChange={e => setValor(p.codigo, e.target.value)} className={INPUT_NUM} />
                              <span className="text-xs text-gray-400">{p.unidade}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className="grid grid-cols-[1fr_100px_60px] gap-2 items-center text-sm">
                            <span className="text-[#19202d]">Leucócitos totais</span>
                            <input inputMode="decimal" value={valores.LEU ?? ''} onChange={e => setValor('LEU', e.target.value)} className={INPUT_NUM} />
                            <span className="text-xs text-gray-400">10³/µL</span>
                          </div>
                          <div className="grid grid-cols-[1fr_80px_90px] gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider pt-1">
                            <span></span><span className="text-right">%</span><span className="text-right normal-case">10³/µL</span>
                          </div>
                          {CELULAS_LEUCOGRAMA.map(c => (
                            <div key={c} className="grid grid-cols-[1fr_80px_90px] gap-2 items-center text-sm">
                              <span className="text-[#19202d]">{parametroPorCodigo(`${c}_REL`)!.nome}</span>
                              <input inputMode="decimal" value={valores[`${c}_REL`] ?? ''} onChange={e => setValor(`${c}_REL`, e.target.value)} className={INPUT_NUM} />
                              <input inputMode="decimal" value={valores[`${c}_ABS`] ?? ''} onChange={e => setValor(`${c}_ABS`, e.target.value)} className={INPUT_NUM} />
                            </div>
                          ))}
                          <p className={`text-[11px] text-right ${Math.abs(somaDiferencial - 100) > 1 ? 'text-amber-600 font-semibold' : 'text-gray-400'}`}>
                            Soma do diferencial: {somaDiferencial.toFixed(1).replace('.', ',')}%
                          </p>
                        </div>
                      )}
                    </div>
                  ))}

                  {campo('Observações (morfologia, hemoparasitas, PPT...)', (
                    <textarea value={observacoes} rows={4}
                      onChange={e => { setObservacoes(e.target.value); setDesatualizada(true) }}
                      className={INPUT} placeholder="Opcional — sai no laudo abaixo dos resultados" />
                  ))}
                </div>
              </div>

              {erro && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{erro}</p>}

              <button onClick={salvar} disabled={saving}
                className="w-full bg-[#3BA7B0] hover:bg-[#2a8f98] disabled:opacity-50 text-white font-bold py-3.5 rounded-xl transition text-sm tracking-wide">
                {saving ? 'Salvando...' : '✨ Salvar como Laudo'}
              </button>
              <button onClick={resetUpload}
                className="w-full border border-gray-200 text-gray-500 font-semibold py-2.5 rounded-xl text-sm hover:bg-gray-50 transition">
                ← Carregar outro arquivo
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default function NovoHemogramaPage() {
  return (
    <Suspense>
      <NovoHemogramaContent />
    </Suspense>
  )
}
