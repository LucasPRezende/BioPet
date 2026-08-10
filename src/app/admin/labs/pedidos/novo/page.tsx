'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface PetOpt   { id: number; nome: string; especie: string | null }
interface TutorOpt { id: number; nome: string | null; telefone: string; pets: PetOpt[] }

interface LabExame {
  id:              number
  laboratorio_id:  number
  codigo:          string | null
  nome:            string
  categoria:       string | null
  cor_tubo:        string | null
  prazo_dias_uteis: number | null
  preco_cliente:   number | null
  preco_parceiro:  number | null
  sob_consulta:    boolean
  ativo:           boolean
}

interface Laboratorio { id: number; nome: string }
interface ClinicaOpt  { id: number; nome: string; ativo: boolean }
interface VetOpt      { id: number; nome: string }

type Origem = 'admin' | 'clinica' | 'vet'

// ── Helpers ───────────────────────────────────────────────────────────────────

const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36] bg-white'

function fmtBRL(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function normalizar(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function precoParaOrigem(e: LabExame, origem: Origem): number | null {
  return origem === 'admin' ? e.preco_cliente : e.preco_parceiro
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function NovoPedidoLabPage() {
  const router = useRouter()

  // Origem
  const [origem,     setOrigem]     = useState<Origem>('admin')
  const [clinicas,   setClinicas]   = useState<ClinicaOpt[]>([])
  const [clinicaId,  setClinicaId]  = useState('')
  const [vets,       setVets]       = useState<VetOpt[]>([])
  const [vetId,      setVetId]      = useState('')

  // Tutor / pet
  const [buscaTutor,      setBuscaTutor]      = useState('')
  const [buscandoTutor,   setBuscandoTutor]   = useState(false)
  const [resultadosTutor, setResultadosTutor] = useState<TutorOpt[]>([])
  const [tutor,           setTutor]           = useState<TutorOpt | null>(null)
  const [petSelecionado,  setPetSelecionado]  = useState<PetOpt | null>(null)

  // Catálogo
  const [labs,      setLabs]      = useState<Laboratorio[]>([])
  const [exames,    setExames]    = useState<LabExame[]>([])
  const [labFiltro, setLabFiltro] = useState<number | 0>(0)
  const [buscaExame, setBuscaExame] = useState('')
  const [selecionados, setSelecionados] = useState<number[]>([])

  const [observacoes, setObservacoes] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro,     setErro]     = useState('')

  useEffect(() => {
    fetch('/api/labs/exames').then(r => r.json()).then(d => {
      if (d.laboratorios) setLabs(d.laboratorios)
      if (d.exames) setExames(d.exames)
    }).catch(() => setErro('Erro ao carregar o catálogo de labs.'))
    fetch('/api/admin/clinicas').then(r => r.ok ? r.json() : []).then((d: ClinicaOpt[]) => setClinicas((d ?? []).filter(c => c.ativo))).catch(() => {})
    fetch('/api/veterinarios').then(r => r.ok ? r.json() : []).then(d => setVets(d ?? [])).catch(() => {})
  }, [])

  useEffect(() => {
    const q = buscaTutor.trim()
    if (q.length < 2 || tutor) { setResultadosTutor([]); return }
    const timer = setTimeout(async () => {
      setBuscandoTutor(true)
      const res = await fetch(`/api/tutores/buscar?q=${encodeURIComponent(q)}`)
      if (res.ok) setResultadosTutor(await res.json())
      setBuscandoTutor(false)
    }, 350)
    return () => clearTimeout(timer)
  }, [buscaTutor, tutor])

  function selecionarTutor(t: TutorOpt) {
    setTutor(t)
    setResultadosTutor([])
    setPetSelecionado(t.pets?.length === 1 ? t.pets[0] : null)
  }

  function limparTutor() {
    setTutor(null); setBuscaTutor(''); setPetSelecionado(null); setResultadosTutor([])
  }

  const labNome = (id: number) => labs.find(l => l.id === id)?.nome ?? '?'

  const examesVisiveis = useMemo(() => {
    const q = normalizar(buscaExame.trim())
    return exames.filter(e => {
      if (!e.ativo) return false
      if (labFiltro && e.laboratorio_id !== labFiltro) return false
      if (q && !normalizar(`${e.codigo ?? ''} ${e.nome}`).includes(q)) return false
      return true
    })
  }, [exames, labFiltro, buscaExame])

  const itensSelecionados = useMemo(
    () => selecionados.map(id => exames.find(e => e.id === id)).filter((e): e is LabExame => !!e),
    [selecionados, exames],
  )

  const semPreco = itensSelecionados.filter(e => precoParaOrigem(e, origem) === null)
  const totalPedido = itensSelecionados.reduce((s, e) => s + (precoParaOrigem(e, origem) ?? 0), 0)

  const porLab = useMemo(() => {
    const grupos = new Map<number, LabExame[]>()
    for (const e of itensSelecionados) {
      const arr = grupos.get(e.laboratorio_id) ?? []
      arr.push(e)
      grupos.set(e.laboratorio_id, arr)
    }
    return Array.from(grupos.entries())
  }, [itensSelecionados])

  function toggleExame(id: number) {
    setSelecionados(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function podeCriar() {
    return !!tutor && !!petSelecionado && selecionados.length > 0 && semPreco.length === 0
      && (origem !== 'clinica' || !!clinicaId) && (origem !== 'vet' || !!vetId)
  }

  async function criar() {
    if (!podeCriar()) return
    setEnviando(true); setErro('')
    const res = await fetch('/api/labs/pedidos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tutor_id:    tutor!.id,
        pet_id:      petSelecionado!.id,
        origem,
        clinica_id:  origem === 'clinica' ? Number(clinicaId) : null,
        vet_id:      origem === 'vet'     ? Number(vetId)     : null,
        observacoes: observacoes.trim() || null,
        itens:       selecionados,
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      setErro(data.error ?? 'Erro ao criar pedido.')
      setEnviando(false)
      return
    }
    router.push(`/admin/labs/pedidos/${data.id}`)
  }

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#19202d]">Novo Pedido — Labs Parceiros</h1>
          <p className="text-sm text-gray-400">Encaminhamento de exames a Tecsa/Hormonalle</p>
        </div>
        <Link href="/admin/labs/pedidos" className="text-sm text-gray-400 hover:text-[#19202d] transition">← Voltar</Link>
      </div>

      {erro && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{erro}</p>}

      <div className="space-y-6">
        {/* Origem */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Origem do pedido</p>
          <div className="grid grid-cols-3 gap-2">
            {([
              { v: 'admin' as const,   label: 'Admin',   desc: 'Cliente ligou/mandou mensagem' },
              { v: 'clinica' as const, label: 'Clínica',  desc: 'Solicitação de clínica parceira' },
              { v: 'vet' as const,     label: 'Vet',      desc: 'Solicitação de vet parceiro' },
            ]).map(opt => (
              <button key={opt.v} type="button" onClick={() => setOrigem(opt.v)}
                className={`text-left px-4 py-3 rounded-xl border transition ${origem === opt.v ? 'bg-[#19202d] text-white border-[#19202d]' : 'border-gray-200 hover:border-[#8a6e36] hover:bg-amber-50'}`}>
                <p className="text-sm font-semibold">{opt.label}</p>
                <p className={`text-xs mt-0.5 ${origem === opt.v ? 'text-gray-300' : 'text-gray-400'}`}>{opt.desc}</p>
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {origem === 'admin' ? 'Cobrança: preço cliente (venda direta).' : 'Cobrança: preço parceiro.'}
          </p>

          {origem === 'clinica' && (
            <div className="mt-3">
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Clínica <span className="text-red-400">*</span></label>
              <select value={clinicaId} onChange={e => setClinicaId(e.target.value)} className={INPUT}>
                <option value="">Selecione...</option>
                {clinicas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
          )}
          {origem === 'vet' && (
            <div className="mt-3">
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Veterinário <span className="text-red-400">*</span></label>
              <select value={vetId} onChange={e => setVetId(e.target.value)} className={INPUT}>
                <option value="">Selecione...</option>
                {vets.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Tutor / Pet */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Responsável legal & pet</p>
          {!tutor ? (
            <div className="relative">
              <input type="text" value={buscaTutor} onChange={e => setBuscaTutor(e.target.value)}
                placeholder="Buscar por nome, telefone ou CPF..." className={INPUT} />
              {buscandoTutor && <p className="text-xs text-gray-400 mt-1">Buscando...</p>}
              {resultadosTutor.length > 0 && (
                <div className="mt-1 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                  {resultadosTutor.map(t => (
                    <button key={t.id} type="button" onClick={() => selecionarTutor(t)}
                      className="w-full text-left px-4 py-3 hover:bg-amber-50 border-b border-gray-100 last:border-0 transition">
                      <p className="text-sm font-semibold text-[#19202d]">{t.nome ?? '—'}</p>
                      <p className="text-xs text-gray-400">{t.telefone}</p>
                    </button>
                  ))}
                </div>
              )}
              {buscaTutor.trim().length >= 2 && !buscandoTutor && resultadosTutor.length === 0 && (
                <p className="text-xs text-gray-400 mt-1.5">
                  Nenhum responsável encontrado. Cadastre em <Link href="/admin/tutores" className="text-[#8a6e36] font-medium">Resp. Legais</Link> primeiro.
                </p>
              )}
            </div>
          ) : (
            <>
              <p className="text-xs px-2.5 py-1.5 rounded-lg bg-green-50 text-green-700 font-medium flex items-center justify-between mb-3">
                <span>✓ {tutor.nome ?? '—'} · {tutor.telefone}</span>
                <button type="button" onClick={limparTutor} className="ml-2 text-gray-400 hover:text-red-400">✕</button>
              </p>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Pet <span className="text-red-400">*</span></p>
              {tutor.pets.length === 0 ? (
                <p className="text-xs text-gray-400">
                  Este responsável não tem pet cadastrado. Cadastre em <Link href="/admin/tutores" className="text-[#8a6e36] font-medium">Resp. Legais</Link>.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {tutor.pets.map(p => (
                    <button key={p.id} type="button" onClick={() => setPetSelecionado(p)}
                      className={`text-sm px-3 py-2 rounded-lg border transition ${petSelecionado?.id === p.id ? 'bg-[#19202d] text-white border-[#19202d]' : 'border-gray-200 hover:border-[#8a6e36] hover:bg-amber-50'}`}>
                      🐾 {p.nome}{p.especie && <span className="text-xs opacity-70 ml-1">({p.especie})</span>}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Exames */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Exames <span className="text-red-400">*</span></p>
          <div className="flex flex-wrap gap-2 mb-3">
            <select value={labFiltro} onChange={e => setLabFiltro(Number(e.target.value))}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#8a6e36]">
              <option value={0}>Todos os laboratórios</option>
              {labs.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
            <input type="text" value={buscaExame} onChange={e => setBuscaExame(e.target.value)}
              placeholder="Buscar exame por nome ou código..."
              className="flex-1 min-w-[200px] border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36]" />
          </div>

          <div className="max-h-72 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50">
            {examesVisiveis.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">Nenhum exame encontrado.</p>
            )}
            {examesVisiveis.map(e => {
              const preco = precoParaOrigem(e, origem)
              const sel   = selecionados.includes(e.id)
              return (
                <button key={e.id} type="button" onClick={() => toggleExame(e.id)}
                  className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 transition ${sel ? 'bg-amber-50' : 'hover:bg-gray-50'}`}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#19202d] truncate">
                      {sel && <span className="text-[#8a6e36] mr-1">✓</span>}
                      {e.nome}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {labNome(e.laboratorio_id)}{e.codigo ? ` · ${e.codigo}` : ''}{e.cor_tubo ? ` · ${e.cor_tubo}` : ''}
                      {e.prazo_dias_uteis !== null ? ` · ${e.prazo_dias_uteis}d` : ''}
                    </p>
                  </div>
                  <span className={`text-sm font-semibold shrink-0 ${preco === null ? 'text-orange-500' : 'text-[#8a6e36]'}`}>
                    {preco === null ? 'sem preço' : fmtBRL(preco)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Resumo */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Resumo</p>
          {itensSelecionados.length === 0 ? (
            <p className="text-sm text-gray-400 py-2">Nenhum exame selecionado ainda.</p>
          ) : (
            <div className="space-y-3">
              {porLab.map(([labId, itens]) => (
                <div key={labId}>
                  <p className="text-xs font-bold text-[#8a6e36] mb-1">{labNome(labId)}</p>
                  {itens.map(e => {
                    const preco = precoParaOrigem(e, origem)
                    return (
                      <div key={e.id} className="flex items-center justify-between text-sm py-1">
                        <span className="text-gray-600">{e.nome}</span>
                        <div className="flex items-center gap-2">
                          <span className={preco === null ? 'text-orange-500 text-xs font-semibold' : 'text-[#19202d] font-medium'}>
                            {preco === null ? 'sem preço parceiro' : fmtBRL(preco)}
                          </span>
                          <button type="button" onClick={() => toggleExame(e.id)} className="text-gray-300 hover:text-red-400">✕</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
              {semPreco.length > 0 && (
                <p className="text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                  {semPreco.length} exame(s) sem preço {origem === 'admin' ? 'cliente' : 'parceiro'} definido — remova-os ou preencha em{' '}
                  <Link href="/admin/labs" className="font-semibold underline">/admin/labs</Link> antes de criar o pedido.
                </p>
              )}
              <div className="flex items-center justify-between border-t border-gray-100 pt-2 font-bold text-[#19202d]">
                <span>Total</span>
                <span>{fmtBRL(totalPedido)}</span>
              </div>
            </div>
          )}

          <div className="mt-4">
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Observações</label>
            <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} rows={2} className={INPUT} />
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Link href="/admin/labs/pedidos" className="border border-gray-200 text-gray-500 py-2.5 px-5 rounded-lg text-sm hover:bg-gray-50 transition">
            Cancelar
          </Link>
          <button type="button" onClick={criar} disabled={!podeCriar() || enviando}
            className="bg-[#19202d] hover:bg-[#232d3f] text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition disabled:opacity-40">
            {enviando ? 'Criando...' : 'Criar pedido'}
          </button>
        </div>
      </div>
    </div>
  )
}
