'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface ExameInfo { tipo_exame: string; duracao_minutos: number }
interface VetOpt    { id: number; nome: string }
interface PetOpt    { id: number; nome: string; especie: string | null; raca: string | null }
interface TutorInfo { id: number; nome: string | null; telefone: string }

const ESPECIES = ['Cachorro','Gato','Pássaro','Coelho','Hamster','Réptil','Outro']
const DIAS_PT  = ['dom','seg','ter','qua','qui','sex','sáb']
const MESES_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36] bg-white'

function StepIndicator({ step }: { step: number }) {
  const steps = ['Resp. Legal & Pet','Exame','Data & Hora','Confirmação']
  return (
    <div className="flex items-center gap-0 mb-8">
      {steps.map((label, i) => {
        const n       = i + 1
        const ativo   = n === step
        const feito   = n < step
        return (
          <div key={n} className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition ${
                feito  ? 'bg-[#c4a35a] text-white' :
                ativo  ? 'bg-[#19202d] text-white' :
                         'bg-gray-100 text-gray-400'
              }`}>
                {feito ? '✓' : n}
              </div>
              <span className={`text-[10px] mt-1 font-medium whitespace-nowrap hidden sm:block ${ativo ? 'text-[#19202d]' : 'text-gray-400'}`}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 ${n < step ? 'bg-[#c4a35a]' : 'bg-gray-200'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function NovoAgendamentoPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)

  // Step 1 — Tutor & Pet
  const [telefone,      setTelefone]      = useState('')
  const [buscando,      setBuscando]      = useState(false)
  const [tutorInfo,     setTutorInfo]     = useState<TutorInfo | null>(null)
  const [tutorNovo,     setTutorNovo]     = useState(false)
  const [tutorNome,     setTutorNome]     = useState('')
  const [petsDisponiveis, setPetsDisponiveis] = useState<PetOpt[]>([])
  const [petSelecionado,  setPetSelecionado]  = useState<PetOpt | null>(null)
  const [novoPet,       setNovoPet]       = useState(false)
  const [petNome,       setPetNome]       = useState('')
  const [petEspecie,    setPetEspecie]    = useState('')
  const [petRaca,       setPetRaca]       = useState('')

  // Step 2 — Exame & Vet
  const [exames,        setExames]        = useState<ExameInfo[]>([])
  const [exameInfo,     setExameInfo]     = useState<ExameInfo | null>(null)
  const [vets,          setVets]          = useState<VetOpt[]>([])
  const [vetId,         setVetId]         = useState('')
  const [observacoes,   setObservacoes]   = useState('')

  // Step 3 — Data & Hora
  const [data,           setData]           = useState('')
  const [horariosLivres, setHorariosLivres] = useState<string[]>([])
  const [loadingHorarios, setLoadingHorarios] = useState(false)
  const [horaSelecionada, setHoraSelecionada] = useState('')

  // Step 4
  const [enviando,   setEnviando]   = useState(false)
  const [erro,       setErro]       = useState('')
  const [concluido,  setConcluido]  = useState(false)

  // Carrega exames e vets ao montar
  useEffect(() => {
    fetch('/api/clinica/exames-permitidos')
      .then(r => r.ok ? r.json() : { exames: [] })
      .then(d => setExames(d.exames ?? []))
    fetch('/api/clinica/veterinarios')
      .then(r => r.ok ? r.json() : [])
      .then(d => setVets(d ?? []))
  }, [])

  // Busca horários livres quando data ou exame muda
  const fetchHorarios = useCallback(async () => {
    if (!data || !exameInfo) return
    setLoadingHorarios(true)
    setHoraSelecionada('')
    const res = await fetch(`/api/clinica/horarios-livres?data=${data}&duracao=${exameInfo.duracao_minutos}`)
    if (res.ok) {
      const d = await res.json()
      setHorariosLivres(d.horarios_livres ?? [])
    }
    setLoadingHorarios(false)
  }, [data, exameInfo])

  useEffect(() => { fetchHorarios() }, [fetchHorarios])

  async function buscarTutor() {
    if (!telefone.trim()) return
    setBuscando(true)
    setTutorInfo(null)
    setPetsDisponiveis([])
    setPetSelecionado(null)
    setTutorNovo(false)

    const res = await fetch(`/api/clinica/buscar-tutor?telefone=${encodeURIComponent(telefone.trim())}`)
    if (res.ok) {
      const d = await res.json()
      if (d.tutor) {
        setTutorInfo(d.tutor)
        setPetsDisponiveis(d.pets ?? [])
        setTutorNome(d.tutor.nome ?? '')
        setTutorNovo(false)
      } else {
        setTutorNovo(true)
        setNovoPet(true)
      }
    }
    setBuscando(false)
  }

  function validarStep1() {
    if (!telefone.trim()) return 'Informe o telefone do tutor.'
    if (tutorNovo && !tutorNome.trim()) return 'Informe o nome do tutor.'
    if (!petSelecionado && !novoPet) return 'Selecione ou cadastre um pet.'
    if (novoPet && !petNome.trim()) return 'Informe o nome do pet.'
    return null
  }

  function validarStep2() {
    if (!exameInfo) return 'Selecione o tipo de exame.'
    return null
  }

  function validarStep3() {
    if (!data) return 'Selecione a data.'
    if (!horaSelecionada) return 'Selecione o horário.'
    return null
  }

  function avancar() {
    setErro('')
    if (step === 1) {
      const e = validarStep1()
      if (e) { setErro(e); return }
    }
    if (step === 2) {
      const e = validarStep2()
      if (e) { setErro(e); return }
    }
    if (step === 3) {
      const e = validarStep3()
      if (e) { setErro(e); return }
    }
    setStep(s => s + 1)
  }

  async function confirmar() {
    setErro('')
    setEnviando(true)

    const body: Record<string, unknown> = {
      telefone:        telefone.trim(),
      tutor_nome:      tutorNome.trim() || null,
      tipo_exame:      exameInfo!.tipo_exame,
      duracao_minutos: exameInfo!.duracao_minutos,
      data_hora:       `${data}T${horaSelecionada}:00`,
      veterinario_id:  vetId ? Number(vetId) : null,
      observacoes:     observacoes.trim() || null,
    }

    if (petSelecionado && !novoPet) {
      body.pet_id = petSelecionado.id
    } else {
      body.pet_nome    = petNome.trim()
      body.pet_especie = petEspecie || null
      body.pet_raca    = petRaca.trim() || null
    }

    const res = await fetch('/api/clinica/agendamentos', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })

    if (res.ok) {
      setConcluido(true)
    } else {
      const d = await res.json()
      setErro(d.error ?? 'Erro ao solicitar agendamento.')
      setStep(3) // volta para data/hora se conflito
    }
    setEnviando(false)
  }

  const vetNome  = vets.find(v => String(v.id) === vetId)?.nome ?? null
  const dataFmt  = data ? new Date(`${data}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }) : ''

  if (concluido) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl border shadow-sm p-8 max-w-sm w-full text-center space-y-4">
          <div className="text-5xl">✅</div>
          <h2 className="text-xl font-bold text-[#19202d]">Solicitação enviada!</h2>
          <p className="text-gray-500 text-sm">
            A BioPet confirmará o agendamento em breve. Você pode acompanhar em <strong>Agendamentos</strong>.
          </p>
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => router.push('/clinica/agendamentos')}
              className="flex-1 bg-[#19202d] hover:bg-[#232d3f] text-white font-semibold py-2.5 rounded-lg text-sm transition"
            >
              Ver agendamentos
            </button>
            <button
              onClick={() => { setConcluido(false); setStep(1); setTelefone(''); setTutorInfo(null); setTutorNovo(false); setTutorNome(''); setPetSelecionado(null); setNovoPet(false); setPetNome(''); setPetEspecie(''); setPetRaca(''); setExameInfo(null); setVetId(''); setObservacoes(''); setData(''); setHoraSelecionada(''); }}
              className="flex-1 border border-gray-200 text-gray-500 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition"
            >
              Novo agendamento
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#19202d]">Novo agendamento</h1>
          <p className="text-sm text-gray-500 mt-1">Solicite um agendamento para confirmação da BioPet.</p>
        </div>

        <StepIndicator step={step} />

        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="h-1 bg-gold-stripe" />
          <div className="p-6 space-y-5">

            {/* ── STEP 1: TUTOR & PET ───────────────────────────────────── */}
            {step === 1 && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                    Telefone do resp. legal (WhatsApp) <span className="text-red-400">*</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="tel"
                      value={telefone}
                      onChange={e => { setTelefone(e.target.value); setTutorInfo(null); setTutorNovo(false); setPetSelecionado(null) }}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), buscarTutor())}
                      placeholder="(24) 99999-9999"
                      className={INPUT}
                    />
                    <button
                      type="button"
                      onClick={buscarTutor}
                      disabled={buscando || !telefone.trim()}
                      className="shrink-0 px-4 py-2 bg-amber-50 border border-[#8a6e36]/30 text-[#8a6e36] rounded-lg text-sm font-semibold hover:bg-amber-100 transition disabled:opacity-50"
                    >
                      {buscando ? '...' : 'Buscar'}
                    </button>
                  </div>
                  {tutorInfo && (
                    <p className="text-xs mt-2 px-2.5 py-1.5 rounded-lg bg-green-50 text-green-700 font-medium">
                      ✓ Resp. legal encontrado: {tutorInfo.nome ?? tutorInfo.telefone}
                    </p>
                  )}
                  {tutorNovo && (
                    <p className="text-xs mt-2 px-2.5 py-1.5 rounded-lg bg-amber-50 text-[#8a6e36] font-medium">
                      Resp. legal novo — será cadastrado automaticamente
                    </p>
                  )}
                </div>

                {tutorNovo && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                      Nome do resp. legal <span className="text-red-400">*</span>
                    </label>
                    <input type="text" value={tutorNome} onChange={e => setTutorNome(e.target.value)}
                      placeholder="Nome completo" className={INPUT} />
                  </div>
                )}

                {(tutorInfo || tutorNovo) && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                        Pet <span className="text-red-400">*</span>
                      </label>
                      {tutorInfo && (
                        <button
                          type="button"
                          onClick={() => { setNovoPet(v => !v); setPetSelecionado(null) }}
                          className="text-xs px-2 py-0.5 rounded border border-dashed border-[#8a6e36]/40 text-[#8a6e36] hover:bg-amber-50 transition"
                        >
                          {novoPet ? '← voltar à lista' : '+ Novo pet'}
                        </button>
                      )}
                    </div>

                    {!novoPet && petsDisponiveis.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {petsDisponiveis.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setPetSelecionado(p)}
                            className={`text-sm px-3 py-2 rounded-lg border transition ${
                              petSelecionado?.id === p.id
                                ? 'bg-[#19202d] text-white border-[#19202d]'
                                : 'border-gray-200 hover:border-[#8a6e36] hover:bg-amber-50'
                            }`}
                          >
                            🐾 {p.nome}
                            {p.especie && <span className="text-xs opacity-70 ml-1">({p.especie})</span>}
                          </button>
                        ))}
                      </div>
                    )}

                    {(novoPet || tutorNovo || petsDisponiveis.length === 0) && (
                      <div className="space-y-3 p-4 bg-amber-50 border border-[#8a6e36]/20 rounded-xl">
                        <p className="text-xs font-semibold text-[#8a6e36]">Dados do novo pet</p>
                        <input type="text" value={petNome} onChange={e => setPetNome(e.target.value)}
                          placeholder="Nome do pet *" className={INPUT} />
                        <div className="grid grid-cols-2 gap-3">
                          <select value={petEspecie} onChange={e => setPetEspecie(e.target.value)} className={INPUT}>
                            <option value="">Espécie</option>
                            {ESPECIES.map(s => <option key={s}>{s}</option>)}
                          </select>
                          <input type="text" value={petRaca} onChange={e => setPetRaca(e.target.value)}
                            placeholder="Raça" className={INPUT} />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* ── STEP 2: EXAME & VET ───────────────────────────────────── */}
            {step === 2 && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                    Tipo de exame <span className="text-red-400">*</span>
                  </label>
                  {exames.length === 0 ? (
                    <p className="text-sm text-gray-400 py-4 text-center">Nenhum exame disponível para sua clínica.</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-2">
                      {exames.map(ex => (
                        <button
                          key={ex.tipo_exame}
                          type="button"
                          onClick={() => setExameInfo(ex)}
                          className={`text-left px-4 py-3 rounded-xl border transition ${
                            exameInfo?.tipo_exame === ex.tipo_exame
                              ? 'bg-[#19202d] text-white border-[#19202d]'
                              : 'border-gray-200 hover:border-[#8a6e36] hover:bg-amber-50'
                          }`}
                        >
                          <span className="font-semibold text-sm">{ex.tipo_exame}</span>
                          <span className={`text-xs ml-2 ${exameInfo?.tipo_exame === ex.tipo_exame ? 'text-gray-400' : 'text-gray-400'}`}>
                            {ex.duracao_minutos} min
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                    Veterinário responsável
                  </label>
                  <select value={vetId} onChange={e => setVetId(e.target.value)} className={INPUT}>
                    <option value="">— Não informado</option>
                    {vets.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                    Observações
                  </label>
                  <textarea
                    value={observacoes}
                    onChange={e => setObservacoes(e.target.value)}
                    rows={3}
                    placeholder="Ex: Animal em jejum, medicações em uso..."
                    className={INPUT + ' resize-none'}
                  />
                </div>
              </>
            )}

            {/* ── STEP 3: DATA & HORA ───────────────────────────────────── */}
            {step === 3 && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                    Data <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="date"
                    value={data}
                    min={new Date().toLocaleDateString('en-CA')}
                    onChange={e => {
                      const v = e.target.value
                      if (v && v < new Date().toLocaleDateString('en-CA')) return
                      setData(v)
                      setHoraSelecionada('')
                    }}
                    className={INPUT}
                  />
                  {data && (
                    <p className="text-xs text-gray-500 mt-1.5 capitalize">{dataFmt}</p>
                  )}
                </div>

                {data && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                      Horário disponível <span className="text-red-400">*</span>
                      {exameInfo && <span className="ml-1 text-gray-400 font-normal normal-case">({exameInfo.duracao_minutos} min)</span>}
                    </label>
                    {loadingHorarios ? (
                      <p className="text-sm text-gray-400 py-4 text-center">Carregando horários...</p>
                    ) : horariosLivres.length === 0 ? (
                      <div className="text-center py-6 bg-gray-50 rounded-xl border border-gray-200">
                        <p className="text-2xl mb-1">😔</p>
                        <p className="text-sm text-gray-500">Nenhum horário disponível neste dia.</p>
                        <p className="text-xs text-gray-400 mt-1">Tente outra data.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                        {horariosLivres.map(h => (
                          <button
                            key={h}
                            type="button"
                            onClick={() => setHoraSelecionada(h)}
                            className={`py-2 rounded-lg text-sm font-semibold border transition ${
                              horaSelecionada === h
                                ? 'bg-[#19202d] text-white border-[#19202d]'
                                : 'border-gray-200 hover:border-[#8a6e36] hover:bg-amber-50'
                            }`}
                          >
                            {h}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* ── STEP 4: CONFIRMAÇÃO ───────────────────────────────────── */}
            {step === 4 && (
              <div className="space-y-4">
                <p className="text-sm font-semibold text-[#19202d]">Resumo da solicitação</p>
                <div className="bg-gray-50 rounded-xl border border-gray-100 divide-y divide-gray-100">
                  {[
                    { label: 'Resp. Legal', value: tutorNome || tutorInfo?.nome || telefone },
                    { label: 'Telefone', value: telefone },
                    { label: 'Pet',      value: petSelecionado ? `${petSelecionado.nome}${petSelecionado.especie ? ` (${petSelecionado.especie})` : ''}` : `${petNome}${petEspecie ? ` (${petEspecie})` : ''}` },
                    { label: 'Exame',    value: `${exameInfo?.tipo_exame} — ${exameInfo?.duracao_minutos} min` },
                    { label: 'Data',     value: dataFmt },
                    { label: 'Horário',  value: horaSelecionada },
                    vetNome ? { label: 'Veterinário', value: vetNome } : null,
                    observacoes ? { label: 'Observações', value: observacoes } : null,
                  ].filter(Boolean).map(row => (
                    <div key={row!.label} className="flex gap-3 px-4 py-3">
                      <span className="text-xs font-semibold text-gray-400 w-24 shrink-0 uppercase tracking-wide mt-0.5">{row!.label}</span>
                      <span className="text-sm text-[#19202d] font-medium">{row!.value}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-amber-50 border border-[#8a6e36]/20 rounded-xl px-4 py-3">
                  <p className="text-xs text-[#8a6e36] font-medium">
                    ⚠️ Este agendamento ficará como <strong>pendente</strong> até a BioPet confirmar.
                    Você receberá a confirmação pelo WhatsApp da clínica.
                  </p>
                </div>
              </div>
            )}

            {/* Erro */}
            {erro && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>
            )}

            {/* Navegação */}
            <div className="flex gap-3 pt-2">
              {step > 1 && (
                <button
                  type="button"
                  onClick={() => { setErro(''); setStep(s => s - 1) }}
                  className="flex-1 border border-gray-200 text-gray-500 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition"
                >
                  ← Voltar
                </button>
              )}
              {step < 4 ? (
                <button
                  type="button"
                  onClick={avancar}
                  className="flex-1 bg-[#19202d] hover:bg-[#232d3f] text-white font-semibold py-2.5 rounded-lg text-sm transition"
                >
                  Continuar →
                </button>
              ) : (
                <button
                  type="button"
                  onClick={confirmar}
                  disabled={enviando}
                  className="flex-1 bg-[#c4a35a] hover:bg-[#a88a47] text-white font-bold py-2.5 rounded-lg text-sm transition disabled:opacity-60"
                >
                  {enviando ? 'Enviando...' : 'Solicitar agendamento'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Suppress unused import warning
const _unused = { DIAS_PT, MESES_PT }
void _unused
