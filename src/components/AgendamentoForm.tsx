'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ESPECIES } from '@/lib/especies'
import { isHorarioEspecial as isHorarioEspecialLib, motivoHorarioEspecial } from '@/lib/feriados'

// ─── Interfaces ────────────────────────────────────────────────────────────────

interface ExameInfo {
  tipo_exame:            string
  duracao_minutos:       number
  varia_por_horario:     boolean
  valor_pix:             number | null
  valor_cartao:          number | null
  valor_especial_pix:    number | null
  valor_especial_cartao: number | null
}

interface BioquimicaExame {
  id:           number
  nome:         string
  codigo:       string | null
  preco_pix:    number
  preco_cartao: number
}

interface VetOpt    { id: number; nome: string }
interface PetOpt    { id: number; nome: string; especie: string | null; raca: string | null }
interface TutorInfo { id: number; nome: string | null; telefone: string }

export interface AgendamentoFormProps {
  modo:       'admin' | 'clinica'
  onClose?:   () => void
  onCreated?: () => void
  dataPadrao?: string
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36] bg-white'

function brl(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function isHorarioEspecial(hora: string, totalDuracao: number, data?: string, feriadoDatas?: string[], horarioFim?: string, horarioInicio?: string): boolean {
  return isHorarioEspecialLib(hora, totalDuracao, data, feriadoDatas, horarioFim, horarioInicio)
}

function formatCPFInput(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`
}

function validarCPF(cpf: string): boolean {
  const c = cpf.replace(/\D/g, '')
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false
  const calc = (n: number) => {
    let s = 0
    for (let i = 0; i < n; i++) s += parseInt(c[i]) * (n + 1 - i)
    const r = (s * 10) % 11
    return r === 10 || r === 11 ? 0 : r
  }
  return calc(9) === parseInt(c[9]) && calc(10) === parseInt(c[10])
}

function calcularValorExame(
  exame: ExameInfo,
  formaPagamento: 'pix' | 'cartao',
  especial: boolean,
): number {
  if (!exame.varia_por_horario) return formaPagamento === 'cartao' ? (exame.valor_cartao ?? exame.valor_pix ?? 0) : (exame.valor_pix ?? 0)
  if (especial) {
    return formaPagamento === 'cartao'
      ? (exame.valor_especial_cartao ?? exame.valor_cartao ?? 0)
      : (exame.valor_especial_pix    ?? exame.valor_pix    ?? 0)
  }
  return formaPagamento === 'cartao'
    ? (exame.valor_cartao ?? 0)
    : (exame.valor_pix    ?? 0)
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function StepIndicator({ step, total }: { step: number; total: number }) {
  const labels = total === 3
    ? ['Resp. Legal & Pet', 'Exames & Info', 'Data & Hora']
    : ['Resp. Legal & Pet', 'Exames & Info', 'Data & Hora', 'Confirmação']
  return (
    <div className="flex items-center gap-0 mb-6">
      {labels.map((label, i) => {
        const n = i + 1; const ativo = n === step; const feito = n < step
        return (
          <div key={n} className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition ${
                feito ? 'bg-[#c4a35a] text-white' : ativo ? 'bg-[#19202d] text-white' : 'bg-gray-100 text-gray-400'
              }`}>{feito ? '✓' : n}</div>
              <span className={`text-[10px] mt-0.5 font-medium whitespace-nowrap hidden sm:block ${ativo ? 'text-[#19202d]' : 'text-gray-400'}`}>{label}</span>
            </div>
            {i < labels.length - 1 && <div className={`flex-1 h-0.5 mx-1 ${n < step ? 'bg-[#c4a35a]' : 'bg-gray-200'}`} />}
          </div>
        )
      })}
    </div>
  )
}

function SimNao({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        {([false, true] as const).map(v => (
          <button key={String(v)} type="button" onClick={() => onChange(v)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition ${
              value === v
                ? v ? 'bg-amber-500 text-white border-amber-500' : 'bg-[#19202d] text-white border-[#19202d]'
                : 'border-gray-200 text-gray-600 hover:border-[#8a6e36] hover:bg-amber-50'
            }`}>
            <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${value === v ? 'border-white' : 'border-gray-300'}`}>
              {value === v && <span className="w-2 h-2 rounded-full bg-white" />}
            </span>
            {v ? 'Sim' : 'Não'}
          </button>
        ))}
      </div>
    </div>
  )
}

function RadioGroup<T extends string>({
  label, value, onChange, options,
}: {
  label: string
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; desc?: string }[]
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{label}</p>
      <div className={`grid gap-2 ${options.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {options.map(opt => (
          <button key={opt.value} type="button" onClick={() => onChange(opt.value)}
            className={`flex flex-col items-start px-4 py-3 rounded-xl border text-sm font-medium transition ${
              value === opt.value
                ? 'bg-[#19202d] text-white border-[#19202d]'
                : 'border-gray-200 text-gray-600 hover:border-[#8a6e36] hover:bg-amber-50'
            }`}>
            <div className="flex items-center gap-2">
              <span className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${value === opt.value ? 'border-white' : 'border-gray-300'}`}>
                {value === opt.value && <span className="w-2 h-2 rounded-full bg-white" />}
              </span>
              <span>{opt.label}</span>
            </div>
            {opt.desc && (
              <span className={`text-xs mt-0.5 ml-6 ${value === opt.value ? 'text-gray-300' : 'text-gray-400'}`}>{opt.desc}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function AgendamentoForm({ modo, onClose, onCreated, dataPadrao }: AgendamentoFormProps) {
  const router     = useRouter()
  const totalSteps = 4
  const [step, setStep] = useState(1)

  // Step 1 — Resp. Legal & Pet
  const [buscaQuery,      setBuscaQuery]      = useState('')
  const [telefone,        setTelefone]        = useState('')
  const [buscaResultados, setBuscaResultados] = useState<TutorInfo[]>([])
  const [buscando,        setBuscando]        = useState(false)
  const [tutorInfo,       setTutorInfo]       = useState<TutorInfo | null>(null)
  const [tutorNovo,       setTutorNovo]       = useState(false)
  const [tutorNome,       setTutorNome]       = useState('')
  const [cpfTutor,        setCpfTutor]        = useState('')
  const [petsDisponiveis, setPetsDisponiveis] = useState<PetOpt[]>([])
  const [notificar,       setNotificar]       = useState(true)
  const [petSelecionado,  setPetSelecionado]  = useState<PetOpt | null>(null)
  const [novoPet,         setNovoPet]         = useState(false)
  const [petNome,          setPetNome]          = useState('')
  const [petEspecie,       setPetEspecie]       = useState('')
  const [petRaca,          setPetRaca]          = useState('')
  const [petPelagem,       setPetPelagem]       = useState('')
  const [petNascimento,    setPetNascimento]    = useState('')
  const [petSexo,          setPetSexo]         = useState('')
  const [petCastrado,      setPetCastrado]     = useState(false)
  const [petTemperamento,  setPetTemperamento] = useState('')

  // Step 2 — Exames & Info
  const [examesDisponiveis,    setExamesDisponiveis]    = useState<ExameInfo[]>([])
  const [examesSelecionados,   setExamesSelecionados]   = useState<ExameInfo[]>([])
  const [vets,                 setVets]                 = useState<VetOpt[]>([])
  const [vetId,                setVetId]                = useState('')
  const [observacoes,          setObservacoes]          = useState('')
  const [sedacaoNecessaria,    setSedacaoNecessaria]    = useState(false)
  const [petInternado,         setPetInternado]         = useState(false)
  const [pagamentoResp,        setPagamentoResp]        = useState<'tutor' | 'clinica'>('tutor')
  const [clinicaId,            setClinicaId]            = useState('')
  const [clinicas,             setClinicas]             = useState<{ id: number; nome: string }[]>([])
  const [formaPagamento,       setFormaPagamento]       = useState<'pix' | 'cartao'>('pix')
  const [entregaPagamento,     setEntregaPagamento]     = useState<'link' | 'presencial'>('link')
  const [gratuito,             setGratuito]             = useState(false)
  const [descontos,            setDescontos]            = useState<Record<string, number>>({})
  const [descontosAbertos,     setDescontosAbertos]     = useState<Set<string>>(new Set())
  const [isAdmin,              setIsAdmin]              = useState(false)

  // Bioquímica
  const [bioquimicaExames,       setBioquimicaExames]       = useState<BioquimicaExame[]>([])
  const [bioquimicaSelecionados, setBioquimicaSelecionados] = useState<number[]>([])
  const [loadingBio,             setLoadingBio]             = useState(false)

  // Raio-X estudos adicionais — array de descrições (uma por estudo adicional)
  const [estudosAdicionaisDesc, setEstudosAdicionaisDesc] = useState<string[]>([])
  // Descrição opcional por exame principal (keyed by tipo_exame)
  const [descricoesPorExame,   setDescricoesPorExame]   = useState<Record<string, string>>({})

  // Step 3 — Data & Hora
  const [data,            setData]            = useState(dataPadrao ?? '')
  const [horariosLivres,  setHorariosLivres]  = useState<string[]>([])
  const [loadingHorarios, setLoadingHorarios] = useState(false)
  const [horaSelecionada, setHoraSelecionada] = useState('')
  const [encaixe,         setEncaixe]         = useState(false)
  const [feriadoDatas,    setFeriadoDatas]    = useState<string[]>([])
  const [horarioFim,      setHorarioFim]      = useState('17:00')
  const [horarioInicio,   setHorarioInicio]   = useState('08:00')

  // Geral
  const [enviando,  setEnviando]  = useState(false)
  const [erro,      setErro]      = useState('')
  const [concluido, setConcluido] = useState(false)

  // Derivados
  const acrescimoExame   = examesDisponiveis.find(e => e.tipo_exame.toLowerCase().includes('acréscim') || e.tipo_exame.toLowerCase().includes('acrescim'))
  const examesVisiveis   = examesDisponiveis.filter(e => !e.tipo_exame.toLowerCase().includes('acréscim') && !e.tipo_exame.toLowerCase().includes('acrescim'))
  const raioXSelecionado = examesSelecionados.some(e => e.tipo_exame.toLowerCase().includes('raio') && !e.tipo_exame.toLowerCase().includes('acréscim'))
  const temBioquimica    = examesSelecionados.some(e => e.tipo_exame === 'Bioquímica')
  const totalDuracao     = examesSelecionados.reduce((s, e) => s + e.duracao_minutos, 0)
                         + (acrescimoExame ? estudosAdicionaisDesc.length * acrescimoExame.duracao_minutos : 0)
  const especial         = isHorarioEspecial(horaSelecionada, totalDuracao, data, feriadoDatas, horarioFim, horarioInicio)
  const motivoEspecial   = especial && data ? motivoHorarioEspecial(horaSelecionada, totalDuracao, data, feriadoDatas, horarioFim, horarioInicio) : null
  const vetNome          = vets.find(v => String(v.id) === vetId)?.nome ?? null
  const dataFmt          = data ? new Date(`${data}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }) : ''
  const totalBioquimica  = bioquimicaSelecionados.reduce((s, id) => {
    const b = bioquimicaExames.find(x => x.id === id)
    return s + (b ? (formaPagamento === 'cartao' ? b.preco_cartao : b.preco_pix) : 0)
  }, 0)
  const totalBioquimicaPix = bioquimicaSelecionados.reduce((s, id) => {
    const b = bioquimicaExames.find(x => x.id === id)
    return s + (b?.preco_pix ?? 0)
  }, 0)
  const valorUnitarioAcrescimo = acrescimoExame
    ? calcularValorExame(acrescimoExame, pagamentoResp === 'clinica' ? 'pix' : formaPagamento, especial)
    : 0
  const valorAcrescimo = estudosAdicionaisDesc.length * valorUnitarioAcrescimo
  // valor bruto (sem desconto) de um exame selecionado
  const valorBrutoExame = (e: ExameInfo) => e.tipo_exame === 'Bioquímica'
    ? (pagamentoResp === 'clinica' ? totalBioquimicaPix : totalBioquimica)
    : calcularValorExame(e, pagamentoResp === 'clinica' ? 'pix' : formaPagamento, especial)
  const podeDescontar = modo === 'admin' && isAdmin && !gratuito
  const descontoTotal = podeDescontar
    ? examesSelecionados.reduce((s, e) => s + Math.min(descontos[e.tipo_exame] ?? 0, valorBrutoExame(e)), 0)
    : 0
  const totalBruto = gratuito ? 0 : examesSelecionados.reduce((s, e) => s + valorBrutoExame(e), 0) + valorAcrescimo
  const totalValor = Math.max(0, totalBruto - descontoTotal)

  // Detecta admin (desconto é exclusivo de admin no modo admin)
  useEffect(() => {
    if (modo !== 'admin') return
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(u => setIsAdmin(u?.role === 'admin'))
  }, [modo])

  // Carrega exames e vets
  useEffect(() => {
    Promise.all([
      fetch('/api/feriados').then(r => r.ok ? r.json() : []),
      fetch('/api/feriados/horario').then(r => r.ok ? r.json() : { horario_fim: '17:00', horario_inicio: '08:00' }),
    ]).then(([feriados, horario]) => {
      setFeriadoDatas((feriados as { data: string }[]).map(f => f.data))
      setHorarioFim(horario.horario_fim ?? '17:00')
      setHorarioInicio(horario.horario_inicio ?? '08:00')
    })
  }, [])

  useEffect(() => {
    if (modo === 'clinica') {
      fetch('/api/clinica/exames-permitidos').then(r => r.ok ? r.json() : { exames: [] }).then(d => setExamesDisponiveis(d.exames ?? []))
      fetch('/api/clinica/veterinarios').then(r => r.ok ? r.json() : []).then(d => setVets(d ?? []))
    } else {
      fetch('/api/comissoes').then(r => r.ok ? r.json() : []).then((d: {
        tipo_exame: string; duracao_minutos: number | null; varia_por_horario: boolean
        preco_pix_comercial: number | null; preco_cartao_comercial: number | null
        preco_pix_fora_horario: number | null; preco_cartao_fora_horario: number | null
      }[]) => setExamesDisponiveis(d.map(c => ({
        tipo_exame:            c.tipo_exame,
        duracao_minutos:       c.duracao_minutos ?? 30,
        varia_por_horario:     c.varia_por_horario,
        valor_pix:             c.preco_pix_comercial    ?? null,
        valor_cartao:          c.preco_cartao_comercial ?? null,
        valor_especial_pix:    c.preco_pix_fora_horario    ?? null,
        valor_especial_cartao: c.preco_cartao_fora_horario ?? null,
      }))))
      fetch('/api/veterinarios').then(r => r.ok ? r.json() : []).then(d => setVets(d ?? []))
      fetch('/api/admin/clinicas').then(r => r.ok ? r.json() : []).then(d =>
        setClinicas((d ?? []).filter((c: { ativo: boolean }) => c.ativo))
      ).catch(() => {})
    }
  }, [modo])

  // Carrega sub-exames bioquímica
  useEffect(() => {
    if (!temBioquimica || bioquimicaExames.length > 0) return
    setLoadingBio(true)
    fetch('/api/comissoes/bioquimica').then(r => r.ok ? r.json() : []).then(d => setBioquimicaExames(d)).finally(() => setLoadingBio(false))
  }, [temBioquimica, bioquimicaExames.length])

  // Carrega horários livres (admin e clinica)
  const fetchHorarios = useCallback(async () => {
    if (!data || examesSelecionados.length === 0) return
    setLoadingHorarios(true); setHoraSelecionada('')
    const url = modo === 'clinica'
      ? `/api/clinica/horarios-livres?data=${data}&duracao=${totalDuracao}`
      : `/api/agendamentos/horarios-livres?data=${data}&duracao=${totalDuracao}`
    const res = await fetch(url)
    if (res.ok) { const d = await res.json(); setHorariosLivres(d.horarios_livres ?? []) }
    setLoadingHorarios(false)
  }, [data, examesSelecionados, totalDuracao, modo])

  useEffect(() => { fetchHorarios() }, [fetchHorarios])

  // Busca dinâmica por nome ou telefone
  useEffect(() => {
    const q = buscaQuery.trim()
    if (q.length < 2 || tutorInfo) { setBuscaResultados([]); return }
    const timer = setTimeout(async () => {
      setBuscando(true)
      if (modo === 'clinica') {
        const res = await fetch(`/api/clinica/buscar-tutor?q=${encodeURIComponent(q)}`)
        if (res.ok) {
          const d = await res.json()
          if (Array.isArray(d)) setBuscaResultados(d)
          else if (d.tutor) setBuscaResultados([d.tutor])
        }
      } else {
        const res = await fetch(`/api/tutores/buscar?q=${encodeURIComponent(q)}`, { credentials: 'include' })
        if (res.ok) setBuscaResultados(await res.json())
      }
      setBuscando(false)
    }, 350)
    return () => clearTimeout(timer)
  }, [buscaQuery, tutorInfo, modo])

  function selecionarTutor(t: TutorInfo & { pets?: PetOpt[]; cpf?: string | null }) {
    setTutorInfo(t)
    setTelefone(t.telefone)
    setTutorNome(t.nome ?? '')
    setCpfTutor(t.cpf ?? '')
    setPetsDisponiveis(t.pets ?? [])
    setBuscaResultados([])
    setTutorNovo(false)
  }

  function novoTutorManual() {
    const q      = buscaQuery.trim()
    const digits = q.replace(/\D/g, '')
    setBuscaResultados([])
    setTutorNovo(true)
    setNovoPet(true)
    if (digits.length >= 8) setTelefone(q)
    else if (q) setTutorNome(q)
  }

  async function buscarTutor() {
    if (!buscaQuery.trim()) return
    const q      = buscaQuery.trim()
    const digits = q.replace(/\D/g, '')
    const tel    = digits.startsWith('55') ? digits : `55${digits}`
    setBuscando(true); setTutorInfo(null); setPetsDisponiveis([]); setPetSelecionado(null); setTutorNovo(false)

    if (modo === 'clinica') {
      const res = await fetch(`/api/clinica/buscar-tutor?q=${encodeURIComponent(q)}`)
      if (res.ok) {
        const d = await res.json()
        if (Array.isArray(d) && d.length > 0) { selecionarTutor(d[0]) }
        else if (d.tutor) { selecionarTutor(d.tutor) }
        else { setTutorNovo(true); setNovoPet(true); if (digits.length >= 8) setTelefone(q); else setTutorNome(q) }
      }
    } else {
      const res = await fetch(`/api/agente/contexto?telefone=${tel}`, { headers: { 'x-api-key': 'biopet_agent_2026' } })
      if (res.ok) {
        const d = await res.json()
        if (d.tutor) { selecionarTutor({ ...d.tutor, pets: d.pets ?? [] }) }
        else { setTutorNovo(true); setNovoPet(true); if (digits.length >= 8) setTelefone(q); else setTutorNome(q) }
      } else { setTutorNovo(true); setNovoPet(true); if (digits.length >= 8) setTelefone(q) }
    }
    setBuscando(false)
  }

  function toggleExame(exame: ExameInfo) {
    setExamesSelecionados(prev => {
      const exists = prev.find(e => e.tipo_exame === exame.tipo_exame)
      if (exists) {
        if (exame.tipo_exame === 'Bioquímica') setBioquimicaSelecionados([])
        if (exame.tipo_exame.toLowerCase().includes('raio')) {
          setEstudosAdicionaisDesc([])
          setDescricoesPorExame(prev => { const n = { ...prev }; delete n[exame.tipo_exame]; return n })
        }
        return prev.filter(e => e.tipo_exame !== exame.tipo_exame)
      }
      return [...prev, exame]
    })
    setHoraSelecionada('')
  }

  function toggleSubExame(id: number) {
    setBioquimicaSelecionados(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function validarStep1(): string | null {
    if (!telefone.trim()) return 'Informe o telefone do responsável legal.'
    if (tutorNovo && !tutorNome.trim()) return 'Informe o nome do responsável legal.'
    if (cpfTutor.replace(/\D/g, '').length === 11 && !validarCPF(cpfTutor)) return 'CPF inválido — verifique os dígitos.'
    if (!petSelecionado && !novoPet) return 'Selecione ou cadastre um pet.'
    if (novoPet && !petNome.trim()) return 'Informe o nome do pet.'
    return null
  }
  function validarStep2(): string | null {
    if (examesSelecionados.length === 0) return 'Selecione ao menos um exame.'
    if (temBioquimica && bioquimicaSelecionados.length === 0) return 'Selecione ao menos um sub-exame de Bioquímica.'
    return null
  }
  function validarStep3(): string | null {
    if (!data) return 'Selecione a data.'
    if (!encaixe && !horaSelecionada) return modo === 'admin' ? 'Informe o horário ou selecione Encaixe.' : 'Selecione um horário disponível.'
    return null
  }

  function avancar() {
    setErro('')
    const err = step === 1 ? validarStep1() : step === 2 ? validarStep2() : step === 3 ? validarStep3() : null
    if (err) { setErro(err); return }
    setStep(s => s + 1)
  }

  function buildPayload() {
    const dataHora = encaixe ? `${data}T00:00:00` : `${data}T${horaSelecionada}:00`
    const examesPayload = examesSelecionados.map(e => {
      const bruto = valorBrutoExame(e)
      const desc  = podeDescontar ? Math.min(descontos[e.tipo_exame] ?? 0, bruto) : 0
      return {
        tipo_exame: e.tipo_exame, duracao_minutos: e.duracao_minutos,
        valor: Math.max(0, bruto - desc), desconto: desc,
        horario_especial: especial,
        descricao: descricoesPorExame[e.tipo_exame]?.trim() || null,
      }
    })
    if (acrescimoExame && estudosAdicionaisDesc.length > 0) {
      for (const desc of estudosAdicionaisDesc) {
        examesPayload.push({
          tipo_exame:       acrescimoExame.tipo_exame,
          duracao_minutos:  acrescimoExame.duracao_minutos,
          valor:            valorUnitarioAcrescimo,
          desconto:         0,
          horario_especial: especial,
          descricao:        desc.trim() || null,
        })
      }
    }
    const bioquimicaPayload = bioquimicaSelecionados.map(id => {
      const b = bioquimicaExames.find(x => x.id === id)!
      return { bioquimica_exame_id: id, valor_pix: b.preco_pix, valor_cartao: b.preco_cartao }
    })
    const base: Record<string, unknown> = {
      telefone:              telefone.trim(),
      tutor_nome:            tutorNome.trim() || null,
      exames:                examesPayload,
      tipo_exame:            [...examesSelecionados.map(e => e.tipo_exame), ...(acrescimoExame ? estudosAdicionaisDesc.map(() => acrescimoExame.tipo_exame) : [])].join(', '),
      duracao_minutos:       totalDuracao,
      data_hora:             dataHora,
      veterinario_id:        vetId ? Number(vetId) : null,
      observacoes:           observacoes.trim() || null,
      sedacao_necessaria:    sedacaoNecessaria,
      pet_internado:         petInternado,
      pagamento_responsavel: gratuito ? 'tutor' : pagamentoResp,
      forma_pagamento:       gratuito ? 'gratuito' : pagamentoResp === 'tutor' ? formaPagamento : 'a confirmar',
      entrega_pagamento:     gratuito ? null : pagamentoResp === 'tutor' ? entregaPagamento : null,
      clinica_id:            pagamentoResp === 'clinica' && clinicaId ? Number(clinicaId) : null,
      valor:                 totalValor,
      bioquimica_selecionados: bioquimicaPayload,
      encaixe,
      notificar,
    }
    if (cpfTutor.trim()) base.cpf = cpfTutor.replace(/\D/g, '')
    if (petSelecionado && !novoPet) { base.pet_id = petSelecionado.id }
    else {
      base.pet_nome        = petNome.trim()
      base.pet_especie     = petEspecie || null
      base.pet_raca        = petRaca.trim() || null
      base.pet_pelagem     = petPelagem.trim() || null
      base.pet_nascimento  = petNascimento || null
      base.pet_sexo        = petSexo || null
      base.pet_castrado    = petCastrado
      base.pet_temperamento = petTemperamento.trim() || null
    }
    return base
  }

  async function confirmar() {
    setErro(''); setEnviando(true)
    const body = buildPayload()
    const url  = modo === 'admin' ? '/api/admin/agendar' : '/api/clinica/agendamentos'
    const res  = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (res.ok) {
      if (modo === 'admin') { onCreated?.(); onClose?.() }
      else { setConcluido(true) }
    } else {
      const d = await res.json()
      setErro(d.error ?? 'Erro ao criar agendamento.')
      if (modo === 'clinica') setStep(3)
    }
    setEnviando(false)
  }

  function resetar() {
    setConcluido(false); setStep(1)
    setBuscaQuery(''); setTelefone(''); setTutorInfo(null); setTutorNovo(false); setTutorNome(''); setCpfTutor(''); setBuscaResultados([])
    setPetSelecionado(null); setNovoPet(false); setPetNome(''); setPetEspecie(''); setPetRaca('')
    setPetPelagem(''); setPetNascimento(''); setPetSexo(''); setPetCastrado(false); setPetTemperamento('')
    setExamesSelecionados([]); setVetId(''); setObservacoes('')
    setSedacaoNecessaria(false); setPetInternado(false); setNotificar(true)
    setPagamentoResp('tutor'); setFormaPagamento('pix'); setEntregaPagamento('link'); setGratuito(false)
    setData(dataPadrao ?? ''); setHoraSelecionada(''); setEncaixe(false)
    setBioquimicaSelecionados([]); setEstudosAdicionaisDesc([]); setDescricoesPorExame({}); setErro('')
  }

  if (modo === 'clinica' && concluido) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl border shadow-sm p-8 max-w-sm w-full text-center space-y-4">
          <div className="text-5xl">✅</div>
          <h2 className="text-xl font-bold text-[#19202d]">Solicitação enviada!</h2>
          <p className="text-gray-500 text-sm">A BioPet confirmará o agendamento em breve.</p>
          <div className="flex gap-3 pt-2">
            <button onClick={() => { window.location.href = '/clinica/agendamentos' }}
              className="flex-1 bg-[#19202d] hover:bg-[#232d3f] text-white font-semibold py-2.5 rounded-lg text-sm transition">
              Ver agendamentos
            </button>
            <button onClick={resetar}
              className="flex-1 border border-gray-200 text-gray-500 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition">
              Novo agendamento
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Step renderers ─────────────────────────────────────────────────────────

  function renderStep1() {
    return (
      <>
        <div className="relative">
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
            Resp. legal — Telefone ou Nome <span className="text-red-400">*</span>
          </label>
          {!tutorInfo && !tutorNovo && (
            <div className="flex gap-2">
              <input type="text" value={buscaQuery}
                onChange={e => { setBuscaQuery(e.target.value); setTutorInfo(null); setTutorNovo(false); setPetSelecionado(null) }}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), buscarTutor())}
                placeholder="(24) 99999-9999 ou nome" className={INPUT} />
              <button type="button" onClick={buscarTutor} disabled={buscando || !buscaQuery.trim()}
                className="shrink-0 px-4 py-2 bg-amber-50 border border-[#8a6e36]/30 text-[#8a6e36] rounded-lg text-sm font-semibold hover:bg-amber-100 transition disabled:opacity-50">
                {buscando ? '...' : 'Buscar'}
              </button>
            </div>
          )}
          {buscaResultados.length > 0 && !tutorInfo && (
            <div className="mt-1 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              {buscaResultados.map(t => (
                <button key={t.id} type="button" onClick={() => selecionarTutor(t as TutorInfo & { pets?: PetOpt[] })}
                  className="w-full text-left px-4 py-3 hover:bg-amber-50 border-b border-gray-100 last:border-0 transition">
                  <p className="text-sm font-semibold text-[#19202d]">{t.nome ?? '—'}</p>
                  <p className="text-xs text-gray-400">{t.telefone}</p>
                </button>
              ))}
              <button type="button" onClick={novoTutorManual}
                className="w-full text-left px-4 py-3 text-[#8a6e36] text-sm font-medium hover:bg-amber-50 border-t border-gray-100">
                + Cadastrar como novo responsável
              </button>
            </div>
          )}
          {tutorInfo && (
            <p className="text-xs mt-2 px-2.5 py-1.5 rounded-lg bg-green-50 text-green-700 font-medium flex items-center justify-between">
              <span>✓ Resp. legal: {tutorInfo.nome ?? tutorInfo.telefone}</span>
              <button type="button" onClick={() => { setTutorInfo(null); setBuscaQuery(''); setTelefone(''); setPetsDisponiveis([]); setPetSelecionado(null) }}
                className="ml-2 text-gray-400 hover:text-red-400 shrink-0">✕</button>
            </p>
          )}
          {tutorNovo && (
            <p className="text-xs mt-2 px-2.5 py-1.5 rounded-lg bg-amber-50 text-[#8a6e36] font-medium flex items-center justify-between">
              <span>Resp. legal novo — será cadastrado automaticamente</span>
              <button type="button" onClick={() => { setTutorNovo(false); setBuscaQuery(''); setTelefone(''); setTutorNome(''); setNovoPet(false); setBuscaResultados([]) }}
                className="ml-2 text-gray-400 hover:text-red-400 shrink-0">✕</button>
            </p>
          )}
        </div>

        {/* Telefone separado — exibido após seleção ou em novo tutor */}
        {(tutorInfo || tutorNovo) && (
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
              Telefone <span className="text-red-400">*</span>
            </label>
            <input
              type="tel"
              value={telefone}
              onChange={e => setTelefone(e.target.value)}
              readOnly={!!tutorInfo}
              placeholder="(24) 99999-9999"
              className={INPUT + (tutorInfo ? ' bg-gray-50 text-gray-500' : '')}
            />
          </div>
        )}

        {tutorNovo && (
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
              Nome do resp. legal <span className="text-red-400">*</span>
            </label>
            <input type="text" value={tutorNome} onChange={e => setTutorNome(e.target.value)} placeholder="Nome completo" className={INPUT} />
          </div>
        )}

        {(tutorInfo || tutorNovo) && (
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
              CPF do resp. legal <span className="text-gray-300 font-normal">(opcional)</span>
            </label>
            <input type="text" inputMode="numeric" value={cpfTutor}
              onChange={e => setCpfTutor(formatCPFInput(e.target.value))}
              placeholder="000.000.000-00" className={INPUT} />
            {cpfTutor.replace(/\D/g,'').length === 11 && !validarCPF(cpfTutor) && (
              <p className="text-xs text-red-500 mt-1">CPF inválido — verifique os dígitos.</p>
            )}
          </div>
        )}

        {(tutorInfo || tutorNovo) && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Pet <span className="text-red-400">*</span></label>
              {tutorInfo && (
                <button type="button" onClick={() => { setNovoPet(v => !v); setPetSelecionado(null) }}
                  className="text-xs px-2 py-0.5 rounded border border-dashed border-[#8a6e36]/40 text-[#8a6e36] hover:bg-amber-50 transition">
                  {novoPet ? '← voltar à lista' : '+ Novo pet'}
                </button>
              )}
            </div>
            {!novoPet && petsDisponiveis.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {petsDisponiveis.map(p => (
                  <button key={p.id} type="button" onClick={() => setPetSelecionado(p)}
                    className={`text-sm px-3 py-2 rounded-lg border transition ${
                      petSelecionado?.id === p.id ? 'bg-[#19202d] text-white border-[#19202d]' : 'border-gray-200 hover:border-[#8a6e36] hover:bg-amber-50'
                    }`}>
                    🐾 {p.nome}{p.especie && <span className="text-xs opacity-70 ml-1">({p.especie})</span>}
                  </button>
                ))}
              </div>
            )}
            {(novoPet || tutorNovo || petsDisponiveis.length === 0) && (
              <div className="space-y-3 p-4 bg-amber-50 border border-[#8a6e36]/20 rounded-xl">
                <p className="text-xs font-semibold text-[#8a6e36]">Dados do novo pet</p>
                <input type="text" value={petNome} onChange={e => setPetNome(e.target.value)} placeholder="Nome do pet *" className={INPUT} />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Espécie</label>
                    <select value={petEspecie} onChange={e => setPetEspecie(e.target.value)} className={INPUT}>
                      <option value="">—</option>
                      {ESPECIES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Raça</label>
                    <input type="text" value={petRaca} onChange={e => setPetRaca(e.target.value)} placeholder="Ex: Golden" className={INPUT} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Sexo</label>
                    <select value={petSexo} onChange={e => setPetSexo(e.target.value)} className={INPUT}>
                      <option value="">—</option>
                      <option value="macho">Macho</option>
                      <option value="femea">Fêmea</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Nascimento</label>
                    <input type="date" value={petNascimento} onChange={e => setPetNascimento(e.target.value)} className={INPUT} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Pelagem</label>
                    <input type="text" value={petPelagem} onChange={e => setPetPelagem(e.target.value)} placeholder="Ex: Dourada" className={INPUT} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Temperamento</label>
                    <select value={petTemperamento} onChange={e => setPetTemperamento(e.target.value)} className={INPUT}>
                      <option value="">—</option>
                      <option value="manso">Manso</option>
                      <option value="medroso">Medroso</option>
                      <option value="reativo">Reativo</option>
                      <option value="bravo">Bravo</option>
                    </select>
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm text-[#19202d] cursor-pointer">
                  <input type="checkbox" checked={petCastrado} onChange={e => setPetCastrado(e.target.checked)} className="w-4 h-4 accent-[#8a6e36]" />
                  Castrado
                </label>
              </div>
            )}
          </div>
        )}
      </>
    )
  }

  function renderStep2() {
    return (
      <>
        {/* Exames */}
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Exames <span className="text-red-400">*</span></label>
          {examesVisiveis.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">Nenhum exame disponível.</p>
          ) : (
            <div className="space-y-2">
              {examesVisiveis.map(ex => {
                const sel   = examesSelecionados.some(e => e.tipo_exame === ex.tipo_exame)
                const isBio = ex.tipo_exame === 'Bioquímica'
                const isRaio = ex.tipo_exame.toLowerCase().includes('raio')
                return (
                  <div key={ex.tipo_exame}>
                    <button type="button" onClick={() => toggleExame(ex)}
                      className={`w-full text-left px-4 py-3 rounded-xl border transition ${sel ? 'bg-[#19202d] text-white border-[#19202d]' : 'border-gray-200 hover:border-[#8a6e36] hover:bg-amber-50'}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${sel ? 'border-white bg-white' : 'border-gray-300'}`}>
                            {sel && <span className="w-2 h-2 bg-[#19202d] rounded-sm" />}
                          </span>
                          <span className="font-semibold text-sm">{ex.tipo_exame}</span>
                        </div>
                        <div className="text-right text-xs shrink-0 ml-2">
                          <span className={sel ? 'text-gray-300' : 'text-gray-400'}>{ex.duracao_minutos} min</span>
                          {isBio && <span className={`ml-3 font-medium ${sel ? 'text-[#c4a35a]' : 'text-gray-400'}`}>preços por exame</span>}
                          {!isBio && ex.valor_pix != null && <span className={`ml-3 font-semibold ${sel ? 'text-[#c4a35a]' : 'text-[#8a6e36]'}`}>{brl(ex.valor_pix)}</span>}
                        </div>
                      </div>
                    </button>

                    {isRaio && sel && (
                      <div className="mt-2 ml-4 space-y-2">
                        <input
                          type="text"
                          placeholder="Descrição do estudo (ex: Tórax PA) — opcional"
                          value={descricoesPorExame[ex.tipo_exame] ?? ''}
                          onChange={e => setDescricoesPorExame(prev => ({ ...prev, [ex.tipo_exame]: e.target.value }))}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36] bg-white"
                        />
                        {acrescimoExame && (
                          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-2">
                            <p className="text-xs font-semibold text-blue-700">📐 Estudos adicionais</p>
                            {estudosAdicionaisDesc.map((desc, i) => (
                              <div key={i} className="flex gap-2 items-center">
                                <input
                                  type="text"
                                  placeholder={`Estudo ${i + 1} (ex: Coluna Lombar) — opcional`}
                                  value={desc}
                                  onChange={e => setEstudosAdicionaisDesc(prev => prev.map((d, j) => j === i ? e.target.value : d))}
                                  className="flex-1 border border-blue-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                                />
                                <button type="button"
                                  onClick={() => setEstudosAdicionaisDesc(prev => prev.filter((_, j) => j !== i))}
                                  className="w-8 h-8 rounded-lg border border-red-200 bg-white text-red-500 font-bold hover:bg-red-50 transition shrink-0">×</button>
                              </div>
                            ))}
                            {estudosAdicionaisDesc.length > 0 && (
                              <p className="text-xs text-blue-700 font-medium">
                                + {brl(valorAcrescimo)} ({estudosAdicionaisDesc.length}× {brl(valorUnitarioAcrescimo)})
                              </p>
                            )}
                            <button type="button"
                              onClick={() => setEstudosAdicionaisDesc(prev => [...prev, ''])}
                              className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition">
                              + Adicionar estudo adicional
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {isBio && sel && (
                      <div className="mt-2 ml-4 p-3 bg-amber-50 border border-[#8a6e36]/20 rounded-xl space-y-2">
                        <p className="text-xs font-semibold text-[#8a6e36] mb-2">🧪 Selecione os exames de bioquímica: <span className="text-red-400">*</span></p>
                        {loadingBio ? <p className="text-xs text-gray-400">Carregando...</p> : bioquimicaExames.length === 0 ? (
                          <p className="text-xs text-gray-400">Nenhum sub-exame cadastrado.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {bioquimicaExames.map(b => {
                              const checked = bioquimicaSelecionados.includes(b.id)
                              const preco   = formaPagamento === 'cartao' ? b.preco_cartao : b.preco_pix
                              return (
                                <button key={b.id} type="button" onClick={() => toggleSubExame(b.id)}
                                  className={`w-full text-left flex items-center justify-between px-3 py-2 rounded-lg border transition text-sm ${checked ? 'bg-[#19202d] text-white border-[#19202d]' : 'bg-white border-gray-200 hover:border-[#8a6e36]'}`}>
                                  <div className="flex items-center gap-2">
                                    <span className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center shrink-0 ${checked ? 'border-white bg-white' : 'border-gray-300'}`}>
                                      {checked && <span className="w-1.5 h-1.5 bg-[#19202d] rounded-sm" />}
                                    </span>
                                    <span className="font-medium">{b.nome}</span>
                                    {b.codigo && <span className={`text-[10px] font-mono ${checked ? 'text-gray-300' : 'text-gray-400'}`}>{b.codigo}</span>}
                                  </div>
                                  {preco > 0 && <span className={`text-xs font-semibold ${checked ? 'text-[#c4a35a]' : 'text-[#8a6e36]'}`}>{brl(preco)}</span>}
                                </button>
                              )
                            })}
                          </div>
                        )}
                        {bioquimicaSelecionados.length > 0 && pagamentoResp === 'tutor' && (
                          <div className="mt-2 pt-2 border-t border-[#8a6e36]/20 space-y-1">
                            {bioquimicaSelecionados.map(id => {
                              const b = bioquimicaExames.find(x => x.id === id)!
                              return (
                                <div key={id} className="flex justify-between text-xs text-[#8a6e36]">
                                  <span>{b.nome}</span>
                                  <span className="font-semibold">{brl(formaPagamento === 'cartao' ? b.preco_cartao : b.preco_pix)}</span>
                                </div>
                              )
                            })}
                            <div className="flex justify-between text-xs font-bold text-[#19202d] border-t border-[#8a6e36]/20 pt-1">
                              <span>Total Bioquímica</span><span>{brl(totalBioquimica)}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          {examesSelecionados.length > 0 && (
            <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm space-y-1.5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Resumo</p>
              {examesSelecionados.map(e => (
                <div key={e.tipo_exame} className="flex justify-between text-gray-600">
                  <span>{e.tipo_exame}</span><span className="font-medium">{e.duracao_minutos} min</span>
                </div>
              ))}
              {estudosAdicionaisDesc.length > 0 && acrescimoExame && (
                <div className="flex justify-between text-blue-600">
                  <span>Raio-X +{estudosAdicionaisDesc.length} estudo{estudosAdicionaisDesc.length > 1 ? 's' : ''} adicional</span>
                  <span className="font-medium">{acrescimoExame.duracao_minutos * estudosAdicionaisDesc.length} min</span>
                </div>
              )}
              <div className="border-t border-gray-200 pt-1.5 flex justify-between font-semibold text-[#19202d]">
                <span>Duração total</span><span>{totalDuracao} min</span>
              </div>
              {pagamentoResp === 'tutor' && totalValor > 0 && (
                <div className="flex justify-between text-[#8a6e36] font-semibold">
                  <span>Total ({formaPagamento === 'cartao' ? 'cartão' : 'pix'})</span><span>{brl(totalValor)}</span>
                </div>
              )}
            </div>
          )}
          {podeDescontar && examesSelecionados.length > 0 && totalBruto > 0 && (
            <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Desconto (admin)</p>
              {examesSelecionados.map(e => {
                const bruto  = valorBrutoExame(e)
                const desc   = Math.min(descontos[e.tipo_exame] ?? 0, bruto)
                const aberto = descontosAbertos.has(e.tipo_exame) || desc > 0
                return (
                  <div key={e.tipo_exame}>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-700">{e.tipo_exame}</span>
                      {desc > 0
                        ? <span className="text-xs"><span className="text-gray-400 line-through">{brl(bruto)}</span> <span className="text-green-700 font-semibold">{brl(bruto - desc)}</span></span>
                        : <span className="text-xs text-gray-400">{brl(bruto)}</span>}
                    </div>
                    {aberto ? (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-500">Desconto R$</span>
                        <input
                          type="number" min="0" step="0.01" value={desc || ''}
                          onChange={ev => setDescontos(prev => ({ ...prev, [e.tipo_exame]: Math.min(Math.max(0, Number(ev.target.value)), bruto) }))}
                          placeholder="0,00"
                          className="w-24 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#8a6e36]"
                        />
                        <button
                          type="button"
                          onClick={() => { setDescontos(prev => { const n = { ...prev }; delete n[e.tipo_exame]; return n }); setDescontosAbertos(prev => { const n = new Set(prev); n.delete(e.tipo_exame); return n }) }}
                          className="text-xs text-gray-400 hover:text-red-500"
                          title="Remover desconto"
                        >✕</button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDescontosAbertos(prev => new Set(prev).add(e.tipo_exame))}
                        className="text-xs text-[#8a6e36] hover:underline mt-0.5"
                      >+ dar desconto</button>
                    )}
                  </div>
                )
              })}
              {descontoTotal > 0 && (
                <div className="border-t border-gray-200 pt-1.5 space-y-0.5">
                  <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>{brl(totalBruto)}</span></div>
                  <div className="flex justify-between text-green-700"><span>Desconto</span><span>− {brl(descontoTotal)}</span></div>
                  <div className="flex justify-between font-bold text-[#19202d]"><span>Total</span><span>{brl(totalValor)}</span></div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Veterinário */}
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Veterinário responsável</label>
          <select value={vetId} onChange={e => setVetId(e.target.value)} className={INPUT}>
            <option value="">— Não informado</option>
            {vets.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
          </select>
        </div>

        {/* Sedação */}
        <SimNao label="Sedação necessária?" value={sedacaoNecessaria} onChange={setSedacaoNecessaria} />
        {sedacaoNecessaria && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            ⚠️ O valor informado é apenas do exame. A sedação é cobrada diretamente pela clínica.
          </p>
        )}

        {/* Internado */}
        <SimNao label="Pet internado na Clínica?" value={petInternado} onChange={setPetInternado} />
        {petInternado && (
          <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
            🏥 O valor informado é apenas do exame. A internação é cobrada diretamente pela clínica.
          </p>
        )}

        {/* Exame gratuito (só admin) */}
        {modo === 'admin' && (
          <label className={`flex items-center justify-between px-4 py-3 rounded-xl border cursor-pointer transition select-none ${
            gratuito ? 'border-violet-300 bg-violet-50' : 'border-gray-200 bg-gray-50'
          }`}>
            <span className={`text-sm font-medium ${gratuito ? 'text-violet-800' : 'text-gray-500'}`}>
              {gratuito ? '🎁 Exame gratuito — sem cobrança' : '💳 Exame com pagamento'}
            </span>
            <div className="relative ml-3 shrink-0">
              <input type="checkbox" className="sr-only peer" checked={gratuito} onChange={e => setGratuito(e.target.checked)} />
              <div className="w-10 h-5 rounded-full transition-colors bg-gray-300 peer-checked:bg-violet-500" />
              <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5" />
            </div>
          </label>
        )}

        {/* Responsável pelo pagamento */}
        {!gratuito && (
          <>
            <RadioGroup<'tutor' | 'clinica'>
              label="Responsável pelo pagamento *"
              value={pagamentoResp}
              onChange={v => { setPagamentoResp(v); if (v !== 'clinica') setClinicaId('') }}
              options={[
                { value: 'tutor',   label: 'Tutor paga diretamente à BioPet' },
                { value: 'clinica', label: 'Clínica já pagou / vai pagar' },
              ]}
            />

            {pagamentoResp === 'clinica' && modo === 'admin' && clinicas.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Clínica parceira *</label>
                <select value={clinicaId} onChange={e => setClinicaId(e.target.value)} className={INPUT}>
                  <option value="">Selecione a clínica</option>
                  {clinicas.map(c => (
                    <option key={c.id} value={String(c.id)}>{c.nome}</option>
                  ))}
                </select>
              </div>
            )}

            {pagamentoResp === 'tutor' && (
              <>
                <RadioGroup<'pix' | 'cartao'>
                  label="Forma de pagamento"
                  value={formaPagamento}
                  onChange={setFormaPagamento}
                  options={[
                    { value: 'pix',    label: 'Pix / Dinheiro' },
                    { value: 'cartao', label: 'Cartão até 3x' },
                  ]}
                />
                <RadioGroup<'link' | 'presencial'>
                  label="Entrega do pagamento"
                  value={entregaPagamento}
                  onChange={setEntregaPagamento}
                  options={[
                    { value: 'link',       label: 'Enviar link',  desc: 'Tutor paga pelo WhatsApp' },
                    { value: 'presencial', label: 'Presencial',   desc: 'Tutor paga na BioPet' },
                  ]}
                />
              </>
            )}
          </>
        )}

        {/* Observações */}
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Observações</label>
          <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)}
            rows={3} placeholder="Ex: Animal em jejum, medicações em uso..." className={INPUT + ' resize-none'} />
        </div>
      </>
    )
  }

  function renderStep3() {
    const today = new Date().toLocaleDateString('en-CA')
    return (
      <>
        {modo === 'admin' && (
          <RadioGroup<'normal' | 'encaixe'>
            label="Tipo de agendamento"
            value={encaixe ? 'encaixe' : 'normal'}
            onChange={v => { setEncaixe(v === 'encaixe'); setHoraSelecionada('') }}
            options={[
              { value: 'normal',  label: 'Com horário',  desc: 'Horário fixo definido' },
              { value: 'encaixe', label: 'Encaixe',      desc: 'Só o dia, sem horário fixo' },
            ]}
          />
        )}

        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
            Data <span className="text-red-400">*</span>
          </label>
          <input type="date" value={data}
            min={modo === 'clinica' ? today : undefined}
            onChange={e => { const v = e.target.value; if (modo === 'clinica' && v < today) return; setData(v); setHoraSelecionada('') }}
            className={INPUT} />
          {data && <p className="text-xs text-gray-500 mt-1.5 capitalize">{dataFmt}</p>}
        </div>

        {!encaixe && (
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Horário <span className="text-red-400">*</span>
              {totalDuracao > 0 && <span className="ml-1 text-gray-400 font-normal normal-case">({totalDuracao} min total)</span>}
            </label>
            {data ? (
              loadingHorarios ? (
                <p className="text-sm text-gray-400 py-4 text-center">Carregando horários...</p>
              ) : horariosLivres.length === 0 ? (
                modo === 'admin' ? (
                  <input type="time" value={horaSelecionada} onChange={e => setHoraSelecionada(e.target.value)} className={INPUT} />
                ) : (
                  <div className="text-center py-6 bg-gray-50 rounded-xl border border-gray-200">
                    <p className="text-2xl mb-1">😔</p>
                    <p className="text-sm text-gray-500">Nenhum horário disponível neste dia.</p>
                    <p className="text-xs text-gray-400 mt-1">Tente outra data.</p>
                  </div>
                )
              ) : (
                <>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {horariosLivres.map(h => (
                      <button key={h} type="button" onClick={() => setHoraSelecionada(h)}
                        className={`py-2 rounded-lg text-sm font-semibold border transition ${horaSelecionada === h ? 'bg-[#19202d] text-white border-[#19202d]' : 'border-gray-200 hover:border-[#8a6e36] hover:bg-amber-50'}`}>
                        {h}
                      </button>
                    ))}
                  </div>
                  {modo === 'admin' && (
                    <div className="mt-2">
                      <p className="text-xs text-gray-400 mb-1">Ou digite um horário personalizado:</p>
                      <input type="time" value={horaSelecionada} onChange={e => setHoraSelecionada(e.target.value)} className={INPUT} />
                    </div>
                  )}
                </>
              )
            ) : null}
          </div>
        )}

        {encaixe && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
            <p className="text-sm text-blue-700 font-medium">
              🔄 Encaixe — o atendimento será realizado no dia selecionado sem horário fixo.
            </p>
          </div>
        )}

        {especial && !encaixe && modo === 'admin' && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-1">
            <p className="text-sm font-semibold text-amber-800">⚠️ Horário especial</p>
            <p className="text-xs text-amber-700">
              {motivoEspecial === 'feriado'     && 'Feriado — tarifa diferenciada aplicada.'}
              {motivoEspecial === 'fimdesemana' && 'Fim de semana — tarifa diferenciada aplicada.'}
              {motivoEspecial === 'antes'       && `Início antes das ${horarioInicio} — tarifa diferenciada aplicada.`}
              {motivoEspecial === 'depois'      && `Término após ${horarioFim} — tarifa diferenciada aplicada.`}
            </p>
            {totalValor > 0 && (
              <p className="text-sm font-semibold text-amber-900 pt-0.5">
                Valor calculado: {brl(totalValor)}
                {pagamentoResp === 'clinica' ? ' (repasse BioPet)' : ''}
              </p>
            )}
          </div>
        )}

        {modo === 'admin' && (
          <label className="flex items-center justify-between px-4 py-3 rounded-xl border cursor-pointer transition select-none
            border-green-200 bg-green-50 has-[:not(:checked)]:border-gray-200 has-[:not(:checked)]:bg-gray-50">
            <span className={`text-sm font-medium ${notificar ? 'text-green-800' : 'text-gray-500'}`}>
              {notificar ? '📱 Notificar cliente via WhatsApp' : '🔕 Sem notificação ao cliente'}
            </span>
            <div className="relative ml-3 shrink-0">
              <input type="checkbox" className="sr-only peer" checked={notificar} onChange={e => setNotificar(e.target.checked)} />
              <div className="w-10 h-5 rounded-full transition-colors bg-gray-300 peer-checked:bg-green-500" />
              <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5" />
            </div>
          </label>
        )}

        {horaSelecionada && pagamentoResp === 'tutor' && modo === 'clinica' && (
          <div className="space-y-3">
            {especial && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <p className="text-sm text-amber-700 font-medium">⚠️ Um ou mais exames fora do horário comercial. Valor especial aplicado.</p>
              </div>
            )}
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm space-y-1.5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Valores finais</p>
              {examesSelecionados.map(e => {
                if (e.tipo_exame === 'Bioquímica') return (
                  <div key={e.tipo_exame}>
                    <div className="flex justify-between text-gray-600 mb-1"><span className="font-medium">🧪 Bioquímica</span><span className="font-medium">{brl(totalBioquimica)}</span></div>
                    {bioquimicaSelecionados.map(id => {
                      const b = bioquimicaExames.find(x => x.id === id)!
                      return <div key={id} className="flex justify-between text-gray-400 text-xs pl-3"><span>• {b.nome}</span><span>{brl(formaPagamento === 'cartao' ? b.preco_cartao : b.preco_pix)}</span></div>
                    })}
                  </div>
                )
                return <div key={e.tipo_exame} className="flex justify-between text-gray-600"><span>{e.tipo_exame}</span><span className="font-medium">{brl(calcularValorExame(e, formaPagamento, especial))}</span></div>
              })}
              <div className="border-t border-gray-200 pt-1.5 flex justify-between font-bold text-[#19202d]">
                <span>Total ({formaPagamento === 'cartao' ? 'cartão' : 'pix'})</span><span>{brl(totalValor)}</span>
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  function renderStep4() {
    return (
      <div className="space-y-4">
        <p className="text-sm font-semibold text-[#19202d]">Resumo da solicitação</p>
        <div className="bg-gray-50 rounded-xl border border-gray-100 divide-y divide-gray-100">
          {[
            { label: 'Resp. Legal', value: tutorNome || tutorInfo?.nome || telefone },
            { label: 'Telefone',    value: telefone },
            { label: 'Pet',         value: petSelecionado ? `${petSelecionado.nome}${petSelecionado.especie ? ` (${petSelecionado.especie})` : ''}` : `${petNome}${petEspecie ? ` (${petEspecie})` : ''}` },
            { label: 'Exame(s)',    value: examesSelecionados.map(e => e.tipo_exame === 'Bioquímica' && bioquimicaSelecionados.length > 0 ? `Bioquímica (${bioquimicaSelecionados.map(id => bioquimicaExames.find(x => x.id === id)?.nome ?? '').join(', ')})` : e.tipo_exame).join(', ') },
            { label: 'Duração',     value: `${totalDuracao} min` },
            { label: 'Data',        value: dataFmt },
            { label: 'Horário',     value: encaixe ? 'Encaixe (sem horário fixo)' : horaSelecionada },
            vetNome           ? { label: 'Veterinário', value: vetNome } : null,
            sedacaoNecessaria ? { label: 'Sedação',     value: '⚠️ Necessária' } : null,
            petInternado      ? { label: 'Internado',   value: '🏥 Sim' } : null,
            { label: 'Pagamento', value: gratuito ? '🎁 Gratuito' : pagamentoResp === 'clinica' ? `Clínica: ${clinicas.find(c => String(c.id) === clinicaId)?.nome ?? '—'} · Repasse BioPet: ${brl(totalValor)}` : `Tutor — ${formaPagamento === 'cartao' ? 'Cartão' : 'Pix'} · ${entregaPagamento === 'link' ? 'Link WhatsApp' : 'Presencial'} · ${brl(totalValor)}` },
            modo === 'admin' ? { label: 'Notificar', value: notificar ? '📱 Sim (WhatsApp)' : '🔕 Não' } : null,
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
            {modo === 'admin' ? (
              <>✅ Revise os dados acima e clique em <strong>Criar agendamento</strong> para confirmar.</>
            ) : (
              <>
                ⚠️ Este agendamento ficará como <strong>pendente</strong> até a BioPet confirmar.
                {pagamentoResp === 'tutor' && entregaPagamento === 'link' && ' Após confirmação, o link de pagamento será enviado pelo WhatsApp.'}
                {pagamentoResp === 'tutor' && entregaPagamento === 'presencial' && ' O tutor realizará o pagamento presencialmente na BioPet.'}
                {pagamentoResp === 'clinica' && <> A clínica receberá o pagamento do tutor. O valor de repasse esperado pela BioPet é <strong>{brl(totalValor)}</strong>.</>}
              </>
            )}
          </p>
        </div>
      </div>
    )
  }

  // ── Layout ─────────────────────────────────────────────────────────────────

  const isLastStep = step === totalSteps

  const formContent = (
    <div className="space-y-5">
      <StepIndicator step={step} total={totalSteps} />
      {step === 1 && renderStep1()}
      {step === 2 && renderStep2()}
      {step === 3 && renderStep3()}
      {step === 4 && renderStep4()}
    </div>
  )

  const navButtons = (
    <div className="border-t border-gray-100 px-6 py-4 flex gap-3">
      {step > 1 && (
        <button type="button" onClick={() => { setErro(''); setStep(s => s - 1) }}
          className="flex-1 border border-gray-200 text-gray-500 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition">
          ← Voltar
        </button>
      )}
      <button type="button" onClick={isLastStep ? confirmar : avancar} disabled={enviando}
        className={`flex-1 font-bold py-2.5 rounded-lg text-sm transition disabled:opacity-50 ${
          isLastStep ? 'bg-[#c4a35a] hover:bg-[#b8944e] text-white' : 'bg-[#19202d] hover:bg-[#232d3f] text-white font-semibold'
        }`}>
        {enviando ? 'Aguarde...' : isLastStep ? (modo === 'admin' ? 'Criar agendamento' : 'Solicitar agendamento') : 'Continuar →'}
      </button>
    </div>
  )

  const errorBlock = erro ? (
    <div className="px-6 pb-4">
      <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>
    </div>
  ) : null

  if (modo === 'clinica') {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-[#19202d]">Novo agendamento</h1>
            <p className="text-sm text-gray-500 mt-1">Solicite um agendamento para confirmação da BioPet.</p>
          </div>
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="h-1 bg-gold-stripe" />
            <div className="p-6">{formContent}</div>
            {navButtons}
            {errorBlock}
          </div>
        </div>
      </div>
    )
  }

  // Admin: flex layout — content scrolls, navButtons stays at bottom
  return (
    <>
      <div className="p-5 flex-1 overflow-y-auto min-h-0">{formContent}</div>
      {navButtons}
      {errorBlock}
    </>
  )
}
