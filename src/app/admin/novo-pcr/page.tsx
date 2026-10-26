'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

import TutorBusca from '@/components/TutorBusca'
import LaudoSucesso from '@/components/LaudoSucesso'
import { ESPECIES } from '@/lib/especies'
import { classificarCt, parseCt, casarAlvo, palavrasChave, STATUS_PCR, REFERENCIA_CT, type StatusPcr } from '@/lib/pcr-resultado'

// Laudo de PCR. O resultado vem do relatório do equipamento (PDF Bioguard):
// "Ler PDF" preenche agentes e Ct; o resultado é calculado do Ct pela tabela
// do próprio relatório (lib/pcr-resultado). Tudo fica editável para conferência.

interface PcrCat {
  id:                number
  nome:              string
  codigo:            string | null
  material_padrao:   string | null
  metodo_padrao:     string | null
  observacao_padrao: string | null
  analitos:          string[] | null
  preco_pix:         number
  ativo:             boolean
}

interface Vet { id: number; nome: string; clinicas?: { nome: string } | null }

interface Linha { key: number; alvo: string; ct: string }

interface Lido {
  tutor: string; pet: string; especie: string; raca: string; sexo: string
  amostra: string; data_teste: string; data_relatorio: string
  alvos: { nome: string; ct: number | null }[]
  curva: string | null
}

const SEXOS = ['Macho', 'Fêmea', 'Não informado']
const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36] focus:border-transparent bg-white'
// Parágrafo "Método" do laudo. Editável na emissão.
const METODO_TEXTO = 'PCR em Tempo Real (qPCR), sistema fechado e automatizado (equipamento Qmini, Bio Brasil). ' +
  'A amplificação e a detecção do material genético (DNA ou RNA) ocorrem de forma simultânea através de canais de ' +
  'fluorescência. Ct = ciclo em que o sinal de fluorescência ultrapassa o limiar.'

// Texto do próprio relatório do equipamento. Editável na emissão.
const OBS_PADRAO = [
  'Positivo: o ácido nucleico do patógeno alvo foi detectado na amostra.',
  'Negativo: o ácido nucleico do patógeno alvo não foi detectado na amostra ou está abaixo do limite de detecção.',
  'Este teste é para uso veterinário e diagnóstico in vitro, não sendo capaz de excluir totalmente a possibilidade de resultados falsos negativos ou falsos positivos causados por diversos fatores.',
].join('\n\n')

const COR_STATUS: Record<StatusPcr, string> = {
  neg:       'text-green-700 bg-green-50 border-green-300',
  pos_forte: 'text-red-700 bg-red-50 border-red-300',
  pos:       'text-red-700 bg-red-50 border-red-300',
  pos_fraco: 'text-red-700 bg-red-50 border-red-300',
  limitrofe: 'text-amber-700 bg-amber-50 border-amber-300',
  invalido:  'text-gray-600 bg-gray-100 border-gray-300',
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

const alvosDe = (c: PcrCat) => (c.analitos && c.analitos.length > 0 ? c.analitos : [c.nome])
const mesmoNome = (a: string, b: string) => palavrasChave(a).join(' ') === palavrasChave(b).join(' ')

let seq = 0
const novaLinha = (alvo = '', ct = ''): Linha => ({ key: ++seq, alvo, ct })

function NovoPcrInner() {
  const searchParams  = useSearchParams()
  const agendamentoId = searchParams.get('agendamento_id')
  const obsManualRef  = useRef(false)
  const fileRef       = useRef<HTMLInputElement>(null)

  const [catalogo,   setCatalogo]   = useState<PcrCat[]>([])
  const [vets,       setVets]       = useState<Vet[]>([])
  const [incluidos,  setIncluidos]  = useState<number[]>([])
  const [linhas,     setLinhas]     = useState<Linha[]>([])
  const [material,   setMaterial]   = useState('')
  const [metodo,     setMetodo]     = useState(METODO_TEXTO)
  const [curva,      setCurva]      = useState<string | null>(null)
  const [comCurva,   setComCurva]   = useState(true)
  // Extração de DNA/RNA: sai 1 do estoque por laudo, a não ser que reaproveitem o extraído guardado
  const [novaExtracao, setNovaExtracao] = useState(true)
  const [observacoes, setObservacoes] = useState(OBS_PADRAO)

  const [form, setForm] = useState({
    nome_pet:   '',
    especie:    '',
    raca:       '',
    sexo:       '',
    idade:      '',
    tutor:      '',
    telefone:   '',
    data_laudo:  new Date().toLocaleDateString('en-CA'),
    data_coleta: new Date().toLocaleDateString('en-CA'),
    veterinario_id: '',
  })

  const [tutorId, setTutorId] = useState<number | null>(null)
  const [petId,   setPetId]   = useState<number | null>(null)
  const [initialTutor, setInitialTutor] = useState<{ id: number; nome: string; telefone: string; pets?: { id: number; nome: string; especie: string | null; raca: string | null; sexo: string | null; data_nascimento: string | null }[] } | null>(null)
  const [petDataNascimento, setPetDataNascimento] = useState<string | null>(null)

  const [lendo,      setLendo]      = useState(false)
  const [lido,       setLido]       = useState<{ arquivo: string; avisos: string[] } | null>(null)
  const [erroLeitura, setErroLeitura] = useState('')

  const [submitting,  setSubmitting]  = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [success,     setSuccess]     = useState<{ id: number; tutor: string; telefone: string } | null>(null)
  const [previewing,  setPreviewing]  = useState(false)
  const [previewUrl,  setPreviewUrl]  = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/comissoes/pcr').then(r => r.ok ? r.json() : []).then(setCatalogo).catch(() => {})
    fetch('/api/veterinarios').then(r => r.ok ? r.json() : []).then(setVets).catch(() => {})
  }, [])

  // Prefill a partir do agendamento
  useEffect(() => {
    if (!agendamentoId || catalogo.length === 0) return
    let cancelado = false
    fetch(`/api/agendamentos/${agendamentoId}`).then(r => r.ok ? r.json() : null).then(ag => {
      if (!ag || cancelado) return
      const tutor = Array.isArray(ag.tutores) ? ag.tutores[0] : ag.tutores
      const pet   = Array.isArray(ag.pets)    ? ag.pets[0]    : ag.pets
      const idadeAuto = pet?.data_nascimento ? calcIdadeDeNascimento(pet.data_nascimento) : ''
      setForm(prev => ({
        ...prev,
        nome_pet:  pet?.nome ?? prev.nome_pet,
        especie:   pet?.especie ?? prev.especie,
        raca:      pet?.raca ?? prev.raca,
        sexo:      pet?.sexo ?? prev.sexo,
        idade:     idadeAuto || prev.idade,
        tutor:     tutor?.nome ?? prev.tutor,
        telefone:  tutor?.telefone ?? prev.telefone,
        veterinario_id: ag.veterinario_id ? String(ag.veterinario_id) : prev.veterinario_id,
      }))
      if (tutor?.id) setTutorId(tutor.id)
      if (pet?.id)   setPetId(pet.id)
      if (pet?.data_nascimento) setPetDataNascimento(pet.data_nascimento)
      if (tutor?.id) setInitialTutor({ id: tutor.id, nome: tutor.nome ?? '', telefone: tutor.telefone ?? '', pets: pet?.id ? [pet] : [] })

      const ids = (ag.agendamento_pcr ?? [])
        .map((p: { pcr_id: number }) => p.pcr_id)
        .filter((id: number) => catalogo.some(c => c.id === id))
      for (const id of ids) incluir(id)
    }).catch(() => {})
    return () => { cancelado = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agendamentoId, catalogo])

  // Observações: padrão do relatório + observação de cada PCR incluído.
  useEffect(() => {
    if (obsManualRef.current) return
    const extras = incluidos
      .map(id => catalogo.find(c => c.id === id)?.observacao_padrao?.trim())
      .filter((o): o is string => !!o)
    setObservacoes(Array.from(new Set([OBS_PADRAO, ...extras])).join('\n\n'))
  }, [incluidos, catalogo])

  /** Inclui um PCR cobrado e cria as linhas dos agentes dele que ainda não existem. */
  function incluir(id: number) {
    const cat = catalogo.find(c => c.id === id)
    if (!cat) return
    setIncluidos(prev => prev.includes(id) ? prev : [...prev, id])
    setLinhas(prev => [...prev, ...alvosDe(cat).filter(a => !prev.some(l => mesmoNome(l.alvo, a))).map(a => novaLinha(a))])
    setMaterial(m => m || cat.material_padrao || '')
  }

  function togglePcr(id: number) {
    if (!incluidos.includes(id)) { incluir(id); return }
    const cat = catalogo.find(c => c.id === id)
    setIncluidos(prev => prev.filter(x => x !== id))
    // Tira só as linhas vazias desse PCR (Ct já preenchido fica).
    if (cat) setLinhas(prev => prev.filter(l => l.ct.trim() !== '' || !alvosDe(cat).some(a => mesmoNome(a, l.alvo))))
  }

  function setLinha(key: number, patch: Partial<Linha>) {
    setLinhas(prev => prev.map(l => l.key === key ? { ...l, ...patch } : l))
  }

  function handleFormChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target
    setForm(p => ({ ...p, [name]: value }))
  }

  /** Nome "limpo" do agente: o do catálogo quando bate, senão o lido do PDF. */
  function nomeDoCatalogo(alvo: string): string {
    for (const c of catalogo) {
      const achado = alvosDe(c).find(a => {
        const pa = palavrasChave(a), pb = palavrasChave(alvo)
        return pa.length > 0 && pb.length > 0 && (pa.every(w => pb.includes(w)) || pb.every(w => pa.includes(w)))
      })
      if (achado) return achado
    }
    return alvo
  }

  async function lerPdf(file: File) {
    setErroLeitura(''); setLido(null); setLendo(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/laudos/ler-pcr', { method: 'POST', body: fd })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErroLeitura(d.error ?? 'Não consegui ler o PDF.'); return }
      const l = d as Lido

      // Agentes + Ct do relatório substituem as linhas.
      setLinhas(l.alvos.map(a => novaLinha(nomeDoCatalogo(a.nome), a.ct == null ? '' : String(a.ct).replace('.', ','))))
      if (l.amostra) setMaterial(l.amostra.charAt(0).toUpperCase() + l.amostra.slice(1).toLowerCase())
      setCurva(l.curva ?? null)
      setComCurva(true)
      if (l.data_teste) setForm(p => ({ ...p, data_coleta: l.data_teste }))

      // Sem agendamento: marca os PCRs cobrados pelo que foi lido.
      if (incluidos.length === 0) {
        const ids = Array.from(new Set(l.alvos.map(a => casarAlvo(a.nome, catalogo)?.id).filter((x): x is number => x != null)))
        setIncluidos(ids)
      }

      // Confere se o PDF é do mesmo paciente.
      const avisos: string[] = []
      const difere = (a: string, b: string) => !!a && !!b && palavrasChave(a)[0] !== palavrasChave(b)[0]
      if (difere(l.pet, form.nome_pet))   avisos.push(`O relatório é do pet "${l.pet}", mas o laudo está para "${form.nome_pet}".`)
      if (difere(l.tutor, form.tutor))    avisos.push(`O relatório é do tutor "${l.tutor}", mas o laudo está para "${form.tutor}".`)
      if (!form.nome_pet && l.pet) setForm(p => ({ ...p, nome_pet: l.pet, especie: p.especie || l.especie, raca: p.raca || l.raca, sexo: p.sexo || l.sexo }))
      if (l.alvos.some(a => a.ct == null)) avisos.push('Algum Ct não foi lido: confira e preencha à mão.')
      setLido({ arquivo: file.name, avisos })
    } catch {
      setErroLeitura('Não consegui ler o PDF.')
    } finally {
      setLendo(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const incluidosOrdenados = catalogo.filter(c => incluidos.includes(c.id))
  const totalPix = incluidosOrdenados.reduce((s, c) => s + Number(c.preco_pix), 0)
  const catalogoVisivel = catalogo.filter(c => c.ativo || incluidos.includes(c.id))

  function validar(): string | null {
    if (!form.nome_pet || !form.especie || !form.tutor || !form.telefone) {
      return 'Preencha os campos obrigatórios: animal, espécie, tutor e telefone.'
    }
    if (linhas.length === 0) return 'Inclua ao menos um agente com o Ct.'
    for (const l of linhas) {
      if (!l.alvo.trim()) return 'Há um agente sem nome.'
      const ct = parseCt(l.ct)
      if (ct == null) return `Informe o Ct de "${l.alvo}".`
      const st = classificarCt(ct)
      if (st == null) return `Ct de "${l.alvo}" fora da tabela (0 a 40). Confira o relatório.`
      if (st === 'invalido') return `"${l.alvo}" deu Ct inválido (entre 0 e 10): refaça o teste antes de emitir.`
    }
    if (!material.trim()) return 'Informe o material (amostra).'
    return null
  }

  function buildPdfData() {
    const selectedVet = vets.find(v => String(v.id) === form.veterinario_id)
    return {
      nome_pet:    form.nome_pet,
      especie:     form.especie,
      raca:        form.raca,
      sexo:        form.sexo,
      idade:       form.idade,
      tutor:       form.tutor,
      telefone:    form.telefone,
      medico:      selectedVet?.nome ?? '',
      crmv:        '',
      clinica:     selectedVet?.clinicas?.nome ?? '',
      material:    material.trim(),
      metodo:      metodo.trim(),
      curva:       comCurva ? curva : null,
      data_laudo:  form.data_laudo,
      data_coleta: form.data_coleta,
      resultados:  linhas.map(l => ({ alvo: l.alvo.trim(), ct: parseCt(l.ct) ?? 0 })),
      observacoes: observacoes.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean),
    }
  }

  async function handlePreview() {
    setSubmitError('')
    const err = validar()
    if (err) { setSubmitError(err); return }
    setPreviewing(true)
    try {
      const res = await fetch('/api/laudos/preview-pcr', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ pdfData: buildPdfData() }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setSubmitError(d.error ?? 'Erro ao gerar a prévia.')
      } else {
        const blob = await res.blob()
        if (previewUrl) URL.revokeObjectURL(previewUrl)
        setPreviewUrl(URL.createObjectURL(blob))
      }
    } catch {
      setSubmitError('Erro ao gerar a prévia.')
    }
    setPreviewing(false)
  }

  function fecharPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError('')
    const err = validar()
    if (err) { setSubmitError(err); return }
    setSubmitting(true)

    const selectedVet = vets.find(v => String(v.id) === form.veterinario_id)
    const res = await fetch('/api/laudos/gerar-pcr', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        pdfData:            buildPdfData(),
        tutor:              form.tutor,
        telefone:           form.telefone,
        sexo:               form.sexo,
        raca:               form.raca,
        medico_responsavel: selectedVet?.nome ?? '',
        data_laudo:         form.data_laudo,
        veterinario_id:     form.veterinario_id ? Number(form.veterinario_id) : null,
        tutor_id:           tutorId,
        pet_id:             petId,
        agendamento_id:     agendamentoId ? Number(agendamentoId) : null,
        preco_exame:        totalPix,
        pcrs_ids:           incluidos,
        nova_extracao:      novaExtracao,
      }),
    })

    if (res.ok) {
      const laudo = await res.json()
      setSuccess({ id: laudo.id, tutor: form.tutor, telefone: form.telefone })
    } else {
      const d = await res.json().catch(() => ({}))
      setSubmitError(d.error ?? 'Erro ao gerar laudo.')
    }
    setSubmitting(false)
  }

  if (success) {
    return <LaudoSucesso laudoId={success.id} tutor={success.tutor} telefone={success.telefone} titulo="Laudo de PCR cadastrado!" />
  }

  const nomesSugeridos = Array.from(new Set(catalogo.flatMap(alvosDe)))

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-[#19202d]">Laudo de PCR</h1>
          <p className="text-sm text-gray-400 mt-0.5">Importe o relatório do equipamento, confira os Ct e gere o laudo no padrão BioPet.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Veterinário solicitante */}
          <div className="bg-white rounded-xl border shadow-sm overflow-visible">
            <div className="h-1 bg-gold-stripe rounded-t-xl" />
            <div className="p-6">
              <h2 className="text-xs font-bold text-[#19202d] uppercase tracking-widest mb-4">Veterinário Solicitante</h2>
              <select name="veterinario_id" value={form.veterinario_id} onChange={handleFormChange} className={INPUT}>
                <option value="">— Não informado</option>
                {vets.map(v => <option key={v.id} value={v.id}>{v.nome}{v.clinicas ? ` · ${v.clinicas.nome}` : ''}</option>)}
              </select>
            </div>
          </div>

          {/* Dados do paciente */}
          <div className="bg-white rounded-xl border shadow-sm overflow-visible">
            <div className="h-1 bg-gold-stripe" />
            <div className="p-6 space-y-4">
              <h2 className="text-xs font-bold text-[#19202d] uppercase tracking-widest">Dados do Paciente</h2>

              <TutorBusca
                selectedPetNome={form.nome_pet}
                initialTutor={initialTutor}
                onTutorChange={t => {
                  setForm(p => ({ ...p, tutor: t.nome, telefone: t.telefone }))
                  setTutorId(t.id)
                }}
                onPetSelect={pet => {
                  const idadeAuto = pet.data_nascimento ? calcIdadeDeNascimento(pet.data_nascimento) : null
                  setPetDataNascimento(pet.data_nascimento ?? null)
                  setPetId(pet.id)
                  setForm(p => ({
                    ...p,
                    nome_pet: pet.nome || p.nome_pet,
                    especie:  pet.especie ?? p.especie,
                    raca:     pet.raca ?? '',
                    sexo:     pet.sexo ?? '',
                    idade:    idadeAuto ?? p.idade,
                  }))
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
                  {petDataNascimento && (
                    <p className="text-[11px] text-gray-400 mt-1">
                      Nasc. {new Date(petDataNascimento + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Coleta</label>
                    <input type="date" name="data_coleta" value={form.data_coleta} onChange={handleFormChange} className={INPUT} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Emissão</label>
                    <input type="date" name="data_laudo" value={form.data_laudo} onChange={handleFormChange} className={INPUT} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* PCRs cobrados */}
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="h-1 bg-gold-stripe" />
            <div className="p-6">
              <h2 className="text-xs font-bold text-[#19202d] uppercase tracking-widest mb-3">PCRs realizados</h2>
              {catalogoVisivel.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">Nenhum PCR ativo. Configure em Preços › PCR.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {catalogoVisivel.map(c => {
                    const on = incluidos.includes(c.id)
                    return (
                      <button key={c.id} type="button" onClick={() => togglePcr(c.id)}
                        className={`text-sm px-3 py-2 rounded-lg border transition ${on ? 'bg-[#19202d] text-white border-[#19202d]' : 'border-gray-200 hover:border-[#8a6e36] hover:bg-amber-50 text-gray-600'}`}>
                        {on ? '✓ ' : '+ '}{c.nome}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Relatório do equipamento */}
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="h-1 bg-gold-stripe" />
            <div className="p-6 space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="text-xs font-bold text-[#19202d] uppercase tracking-widest">Relatório do equipamento</h2>
                  <p className="text-xs text-gray-400 mt-1">PDF exportado pelo equipamento (Bioguard). Preenche os agentes, o Ct, a amostra e a data do teste.</p>
                </div>
                <label className={`shrink-0 cursor-pointer bg-[#19202d] hover:bg-[#2a3447] text-white text-sm font-semibold px-4 py-2 rounded-lg transition ${lendo ? 'opacity-60 pointer-events-none' : ''}`}>
                  {lendo ? 'Lendo o PDF...' : '📄 Ler PDF'}
                  <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) lerPdf(f) }} />
                </label>
              </div>
              {lendo && <p className="text-xs text-gray-400">Lendo com IA, leva uns 20 segundos.</p>}
              {erroLeitura && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erroLeitura}</p>}
              {lido && (
                <div className="text-xs rounded-lg px-3 py-2 bg-green-50 border border-green-200 text-green-800 space-y-1">
                  <p>✓ {lido.arquivo} lido. Confira os Ct abaixo antes de emitir.</p>
                  {lido.avisos.map(a => <p key={a} className="text-amber-800 font-semibold">⚠ {a}</p>)}
                </div>
              )}
              {curva && (
                <div className="border border-gray-100 rounded-xl p-3 space-y-2">
                  <label className="flex items-center gap-2 text-sm text-[#19202d] cursor-pointer">
                    <input type="checkbox" checked={comCurva} onChange={e => setComCurva(e.target.checked)} className="accent-[#8a6e36]" />
                    Incluir a curva de amplificação no laudo
                  </label>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={curva} alt="Curva de amplificação recortada do relatório" className={`w-full max-w-md border border-gray-100 rounded ${comCurva ? '' : 'opacity-40'}`} />
                </div>
              )}
            </div>
          </div>

          {/* Resultados */}
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="h-1 bg-gold-stripe" />
            <div className="p-6 space-y-4">
              <h2 className="text-xs font-bold text-[#19202d] uppercase tracking-widest">Resultados</h2>

              <div className="sm:w-1/2">
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Material <span className="text-red-400">*</span></label>
                <input type="text" value={material} onChange={e => setMaterial(e.target.value)} placeholder="Ex: Sangue total" className={INPUT} />
              </div>

              <datalist id="alvos-pcr">{nomesSugeridos.map(n => <option key={n} value={n} />)}</datalist>

              {linhas.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-3">Leia o PDF do equipamento ou escolha os PCRs acima.</p>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-[1fr_6rem_10rem_1.5rem] gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-wide px-1">
                    <span>Agente</span><span>Ct</span><span>Resultado</span><span />
                  </div>
                  {linhas.map(l => {
                    const ct = parseCt(l.ct)
                    const st = classificarCt(ct)
                    return (
                      <div key={l.key} className="grid grid-cols-[1fr_6rem_10rem_1.5rem] gap-2 items-center">
                        <input type="text" list="alvos-pcr" value={l.alvo} onChange={e => setLinha(l.key, { alvo: e.target.value })}
                          placeholder="Ex: Ehrlichia spp." className={INPUT} />
                        <input type="text" inputMode="decimal" value={l.ct} onChange={e => setLinha(l.key, { ct: e.target.value })}
                          placeholder="Ct" className={INPUT + ' text-right tabular-nums'} />
                        {st ? (
                          <span className={`text-xs font-semibold px-2.5 py-1.5 rounded-full border text-center ${COR_STATUS[st]}`}>{STATUS_PCR[st].label}</span>
                        ) : (
                          <span className="text-xs text-gray-400 text-center">{l.ct.trim() ? 'Ct fora da tabela' : '—'}</span>
                        )}
                        <button type="button" onClick={() => setLinhas(prev => prev.filter(x => x.key !== l.key))}
                          className="text-gray-300 hover:text-red-500 transition text-base leading-none" aria-label={`Remover ${l.alvo}`}>✕</button>
                      </div>
                    )
                  })}
                </div>
              )}
              <button type="button" onClick={() => setLinhas(prev => [...prev, novaLinha()])}
                className="text-xs font-semibold text-[#8a6e36] hover:underline">+ Adicionar agente</button>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide">Método (parágrafo abaixo da tabela)</label>
                  {metodo !== METODO_TEXTO && (
                    <button type="button" onClick={() => setMetodo(METODO_TEXTO)} className="text-xs text-[#8a6e36] hover:underline">↻ Restaurar padrão</button>
                  )}
                </div>
                <textarea value={metodo} onChange={e => setMetodo(e.target.value)} rows={3} className={INPUT + ' resize-none text-xs leading-relaxed'} />
              </div>

              <div className="text-[11px] text-gray-500 bg-gray-50 rounded-lg px-3 py-2 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-0.5">
                {REFERENCIA_CT.map(r => (
                  <span key={r.faixa}><span className="font-mono text-gray-400">{r.faixa}</span> · {STATUS_PCR[r.status].label}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Observações */}
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="h-1 bg-gold-stripe" />
            <div className="p-6">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs font-bold text-[#19202d] uppercase tracking-widest">Observações</h2>
                {obsManualRef.current && (
                  <button type="button"
                    onClick={() => {
                      obsManualRef.current = false
                      const extras = incluidos.map(id => catalogo.find(c => c.id === id)?.observacao_padrao?.trim()).filter((o): o is string => !!o)
                      setObservacoes(Array.from(new Set([OBS_PADRAO, ...extras])).join('\n\n'))
                    }}
                    className="text-xs text-[#8a6e36] hover:underline">↻ Restaurar padrão</button>
                )}
              </div>
              <textarea value={observacoes}
                onChange={e => { obsManualRef.current = true; setObservacoes(e.target.value) }}
                rows={6} placeholder="Observações que aparecem no laudo (separe parágrafos com linha em branco)."
                className={INPUT + ' resize-none'} />
            </div>
          </div>

          <label className="flex items-start gap-2.5 bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={novaExtracao} onChange={e => setNovaExtracao(e.target.checked)} className="mt-0.5" />
            <span>
              <strong>Usou extração nova de DNA/RNA</strong>
              <span className="block text-xs text-gray-500">Desmarque se reaproveitou o extraído guardado na geladeira — aí o extrator não sai do estoque de novo.</span>
            </span>
          </label>

          {submitError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{submitError}</p>
          )}

          <div className="flex gap-3">
            <button type="button" onClick={handlePreview} disabled={previewing || submitting || lendo}
              className="flex-1 border-2 border-[#19202d] text-[#19202d] hover:bg-gray-50 disabled:opacity-50 font-bold py-3 rounded-xl transition text-sm tracking-wide">
              {previewing ? 'Gerando prévia...' : '👁 Pré-visualizar'}
            </button>
            <button type="submit" disabled={submitting || previewing || lendo}
              className="flex-1 bg-[#19202d] hover:bg-[#2a3447] disabled:opacity-50 text-white font-bold py-3 rounded-xl transition text-sm tracking-wide">
              {submitting ? 'Gerando PDF...' : '✨ Gerar Laudo'}
            </button>
          </div>
        </form>
      </main>

      {previewUrl && (
        <div className="fixed inset-0 bg-black/60 z-50 flex flex-col p-4" onClick={fecharPreview}>
          <div className="bg-white rounded-xl overflow-hidden flex flex-col w-full max-w-4xl mx-auto my-auto"
            style={{ height: '92vh' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
              <div>
                <p className="font-bold text-[#19202d] text-sm">Pré-visualização do laudo</p>
                <p className="text-xs text-gray-400">Confira antes de gerar — nada foi salvo nem enviado ainda.</p>
              </div>
              <button onClick={fecharPreview} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>
            <iframe src={previewUrl} title="Prévia do laudo" className="flex-1 w-full" />
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-3 shrink-0">
              <button onClick={fecharPreview}
                className="px-4 py-2 border border-gray-200 text-gray-500 rounded-lg text-sm hover:bg-gray-50 transition">
                Fechar e ajustar
              </button>
              <button onClick={() => { fecharPreview(); (document.querySelector('form') as HTMLFormElement)?.requestSubmit() }}
                className="px-4 py-2 bg-[#19202d] hover:bg-[#2a3447] text-white font-semibold rounded-lg text-sm transition">
                ✨ Está certo — Gerar Laudo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function NovoPcrPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <NovoPcrInner />
    </Suspense>
  )
}
