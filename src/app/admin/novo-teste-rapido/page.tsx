'use client'

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

import TutorBusca from '@/components/TutorBusca'
import LaudoSucesso from '@/components/LaudoSucesso'
import { ESPECIES } from '@/lib/especies'

interface TesteRapido {
  id:                number
  nome:              string
  descricao:         string | null
  material_padrao:   string | null
  metodo_padrao:     string | null
  observacao_padrao: string | null
  preco_pix:         number
  preco_cartao:      number
  comissao:          number
  ativo:             boolean
  ordem:             number
}

interface Vet { id: number; nome: string; clinicas?: { nome: string } | null }

// Linha de resultado editável (um por teste incluído)
interface Linha {
  id:        number
  material:  string
  metodo:    string
  status:    '' | 'neg' | 'pos' | 'nreag' | 'reag'
}

const RESULTADO_OPCOES: { value: Linha['status']; label: string; cls: string }[] = [
  { value: 'neg',   label: 'Negativo',      cls: 'text-green-700 bg-green-50 border-green-300' },
  { value: 'pos',   label: 'Positivo',      cls: 'text-red-700 bg-red-50 border-red-300' },
  { value: 'nreag', label: 'Não reagente',  cls: 'text-gray-600 bg-gray-100 border-gray-300' },
  { value: 'reag',  label: 'Reagente',      cls: 'text-red-700 bg-red-50 border-red-300' },
]

const SEXOS = ['Macho', 'Fêmea', 'Não informado']
const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36] focus:border-transparent bg-white'

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

function NovoTesteRapidoInner() {
  const searchParams = useSearchParams()
  const agendamentoId = searchParams.get('agendamento_id')
  const obsManualRef = useRef(false)

  const [catalogo,   setCatalogo]   = useState<TesteRapido[]>([])
  const [vets,       setVets]       = useState<Vet[]>([])
  const [incluidos,  setIncluidos]  = useState<number[]>([])
  const [linhas,     setLinhas]     = useState<Record<number, Linha>>({})
  const [observacoes, setObservacoes] = useState('')

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
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [petDataNascimento, setPetDataNascimento] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ id: number; tutor: string; telefone: string } | null>(null)

  // Carrega catálogo e vets
  useEffect(() => {
    fetch('/api/comissoes/testes-rapidos').then(r => r.ok ? r.json() : []).then(setCatalogo).catch(() => {})
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

      // Pré-seleciona os testes marcados no agendamento
      const ids = (ag.agendamento_testes_rapidos ?? [])
        .map((t: { teste_rapido_id: number }) => t.teste_rapido_id)
        .filter((id: number) => catalogo.some(c => c.id === id))
      if (ids.length > 0) setIncluidos(ids)
    }).catch(() => {})
    return () => { cancelado = true }
  }, [agendamentoId, catalogo])

  // Ao mudar os testes incluídos: cria linhas com material/método padrão e regenera observações
  useEffect(() => {
    setLinhas(prev => {
      const next: Record<number, Linha> = {}
      for (const id of incluidos) {
        const cat = catalogo.find(c => c.id === id)
        next[id] = prev[id] ?? {
          id,
          material: cat?.material_padrao ?? '',
          metodo:   cat?.metodo_padrao ?? '',
          status:   '',
        }
      }
      return next
    })

    if (!obsManualRef.current) {
      const obs = incluidos
        .map(id => catalogo.find(c => c.id === id)?.observacao_padrao?.trim())
        .filter((o): o is string => !!o)
      // Remove duplicatas mantendo a ordem
      const unicas = Array.from(new Set(obs))
      setObservacoes(unicas.join('\n\n'))
    }
  }, [incluidos, catalogo])

  const toggleTeste = useCallback((id: number) => {
    setIncluidos(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }, [])

  function setLinha(id: number, patch: Partial<Linha>) {
    setLinhas(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  function handleFormChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target
    setForm(p => ({ ...p, [name]: value }))
  }

  // Testes ordenados conforme o catálogo
  const incluidosOrdenados = catalogo.filter(c => incluidos.includes(c.id))

  const totalPix     = incluidosOrdenados.reduce((s, c) => s + Number(c.preco_pix), 0)
  const totalComissao = incluidosOrdenados.reduce((s, c) => s + Number(c.comissao), 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError('')

    if (!form.nome_pet || !form.especie || !form.tutor || !form.telefone) {
      setSubmitError('Preencha os campos obrigatórios: animal, espécie, tutor e telefone.')
      return
    }
    if (incluidos.length === 0) {
      setSubmitError('Selecione ao menos um teste rápido.')
      return
    }
    const semResultado = incluidosOrdenados.filter(c => !linhas[c.id]?.status)
    if (semResultado.length > 0) {
      setSubmitError(`Informe o resultado de: ${semResultado.map(c => c.nome).join(', ')}.`)
      return
    }

    setSubmitting(true)

    const selectedVet = vets.find(v => String(v.id) === form.veterinario_id)
    const materiaisUnicos = Array.from(new Set(incluidosOrdenados.map(c => linhas[c.id]?.material).filter(Boolean)))

    const resultados = incluidosOrdenados.map(c => ({
      nome:      c.nome,
      descricao: c.descricao,
      material:  linhas[c.id]?.material ?? '',
      metodo:    linhas[c.id]?.metodo ?? '',
      status:    linhas[c.id]?.status || 'neg',
    }))

    const payload = {
      pdfData: {
        nome_pet:    form.nome_pet,
        especie:     form.especie,
        raca:        form.raca,
        sexo:        form.sexo,
        idade:       form.idade,
        tutor:       form.tutor,
        medico:      selectedVet?.nome ?? '',
        crmv:        '',
        clinica:     selectedVet?.clinicas?.nome ?? '',
        material:    materiaisUnicos.join(', '),
        data_laudo:  form.data_laudo,
        data_coleta: form.data_coleta,
        resultados,
        observacoes: observacoes.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean),
      },
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
      comissao:           totalComissao,
    }

    const res = await fetch('/api/laudos/gerar-teste-rapido', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
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
    return (
      <LaudoSucesso
        laudoId={success.id}
        tutor={success.tutor}
        telefone={success.telefone}
        titulo="Laudo de Teste Rápido cadastrado!"
      />
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-[#19202d]">Laudo de Teste Rápido</h1>
          <p className="text-sm text-gray-400 mt-0.5">Selecione os testes e marque o resultado de cada um.</p>
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

          {/* Seleção de testes */}
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="h-1 bg-gold-stripe" />
            <div className="p-6">
              <h2 className="text-xs font-bold text-[#19202d] uppercase tracking-widest mb-3">Testes realizados</h2>
              {catalogo.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">Nenhum teste rápido cadastrado. Configure em Preços › Teste Rápido.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {catalogo.map(c => {
                    const on = incluidos.includes(c.id)
                    return (
                      <button key={c.id} type="button" onClick={() => toggleTeste(c.id)}
                        className={`text-sm px-3 py-2 rounded-lg border transition ${on ? 'bg-[#19202d] text-white border-[#19202d]' : 'border-gray-200 hover:border-[#8a6e36] hover:bg-amber-50 text-gray-600'}`}>
                        {on ? '✓ ' : '+ '}{c.nome}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Resultados dos testes incluídos */}
          {incluidosOrdenados.length > 0 && (
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="h-1 bg-gold-stripe" />
              <div className="p-6 space-y-4">
                <h2 className="text-xs font-bold text-[#19202d] uppercase tracking-widest">Resultados</h2>
                {incluidosOrdenados.map(c => {
                  const linha = linhas[c.id]
                  return (
                    <div key={c.id} className="border border-gray-100 rounded-xl p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-[#19202d] text-sm">{c.nome}</p>
                          {c.descricao && <p className="text-xs text-gray-400">{c.descricao}</p>}
                        </div>
                        <button type="button" onClick={() => toggleTeste(c.id)}
                          className="text-gray-300 hover:text-red-500 transition text-base leading-none">✕</button>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Material</label>
                          <input type="text" value={linha?.material ?? ''} onChange={e => setLinha(c.id, { material: e.target.value })}
                            placeholder="Ex: Soro" className={INPUT} />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Método</label>
                          <input type="text" value={linha?.metodo ?? ''} onChange={e => setLinha(c.id, { metodo: e.target.value })}
                            placeholder="Ex: Imunocromatografia" className={INPUT} />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Resultado <span className="text-red-400">*</span></label>
                        <div className="flex flex-wrap gap-2">
                          {RESULTADO_OPCOES.map(opt => {
                            const active = linha?.status === opt.value
                            return (
                              <button key={opt.value} type="button" onClick={() => setLinha(c.id, { status: opt.value })}
                                className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${active ? opt.cls + ' ring-2 ring-offset-1 ring-[#8a6e36]' : 'border-gray-200 text-gray-500 hover:border-[#8a6e36]'}`}>
                                {opt.label}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Observações */}
          {incluidosOrdenados.length > 0 && (
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="h-1 bg-gold-stripe" />
              <div className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-xs font-bold text-[#19202d] uppercase tracking-widest">Observações</h2>
                  {obsManualRef.current && (
                    <button type="button"
                      onClick={() => {
                        obsManualRef.current = false
                        const obs = incluidos.map(id => catalogo.find(c => c.id === id)?.observacao_padrao?.trim()).filter((o): o is string => !!o)
                        setObservacoes(Array.from(new Set(obs)).join('\n\n'))
                      }}
                      className="text-xs text-[#8a6e36] hover:underline">↻ Restaurar padrão</button>
                  )}
                </div>
                <textarea value={observacoes}
                  onChange={e => { obsManualRef.current = true; setObservacoes(e.target.value) }}
                  rows={5} placeholder="Observações que aparecem no laudo (separe parágrafos com linha em branco)."
                  className={INPUT + ' resize-none'} />
              </div>
            </div>
          )}

          {submitError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{submitError}</p>
          )}

          <button type="submit" disabled={submitting}
            className="w-full bg-[#19202d] hover:bg-[#2a3447] disabled:opacity-50 text-white font-bold py-3 rounded-xl transition text-sm tracking-wide">
            {submitting ? 'Gerando PDF...' : '✨ Gerar Laudo de Teste Rápido'}
          </button>
        </form>
      </main>
    </div>
  )
}

export default function NovoTesteRapidoPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <NovoTesteRapidoInner />
    </Suspense>
  )
}
