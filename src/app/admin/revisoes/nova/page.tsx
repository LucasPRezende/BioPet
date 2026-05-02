'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface AgendamentoOriginal {
  id: number
  tipo_exame: string
  data_hora: string
  status: string
  tutores: { nome: string; telefone: string } | null
  pets: { nome: string; especie: string } | null
  pode_agendar: boolean
  prazo_ok: boolean
  prazo_limite: string
  revisoes_ativas: number
  max_revisoes: number
  motivo_bloqueio: string | null
}

interface RevisaoConfig {
  tipo_exame: string
  prazo_dias: number
  valor_horario_comercial: number
  valor_fora_comercial: number
  gera_laudo: boolean
  valor_laudo_extra: number
  horario_inicio: string
  horario_fim: string
}

interface Vet { id: number; nome: string }

const INPUT = 'w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36] bg-white'

function fmtDT(s: string) {
  return new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function isComercial(dataHora: string, inicio: string, fim: string) {
  const d = new Date(dataHora)
  const dow = d.getDay()
  if (dow === 0 || dow === 6) return false
  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
  const atual = d.getHours() * 60 + d.getMinutes()
  return atual >= toMin(inicio) && atual < toMin(fim)
}

export default function NovaRevisaoPage() {
  const router = useRouter()

  const [busca,      setBusca]      = useState('')
  const [resultados, setResultados] = useState<AgendamentoOriginal[]>([])
  const [buscando,   setBuscando]   = useState(false)
  const [buscouUmaVez, setBuscouUmaVez] = useState(false)
  const [original,   setOriginal]   = useState<AgendamentoOriginal | null>(null)
  const [config,     setConfig]     = useState<RevisaoConfig | null>(null)

  const [dataHora,   setDataHora]   = useState('')
  const [laudoSolic, setLaudoSolic] = useState(false)
  const [veterinario, setVeterinario] = useState('')
  const [obs,        setObs]        = useState('')
  const [vets,       setVets]       = useState<Vet[]>([])
  const [salvando,   setSalvando]   = useState(false)
  const [erro,       setErro]       = useState('')

  useEffect(() => {
    fetch('/api/veterinarios').then(r => r.ok ? r.json() : []).then(setVets).catch(() => {})
  }, [])

  async function handleBuscar(e: React.FormEvent) {
    e.preventDefault()
    if (!busca.trim()) return
    setBuscando(true)
    setResultados([])
    setOriginal(null)
    setConfig(null)
    setBuscouUmaVez(true)

    const res = await fetch(`/api/revisoes/buscar-original?busca=${encodeURIComponent(busca.trim())}`)
    if (res.ok) setResultados(await res.json())
    setBuscando(false)
  }

  async function handleSelecionar(ag: AgendamentoOriginal) {
    setOriginal(ag)
    setResultados([])
    setDataHora('')
    setLaudoSolic(false)
    setErro('')

    const res = await fetch('/api/revisoes/config')
    if (res.ok) {
      const configs: RevisaoConfig[] = await res.json()
      setConfig(configs.find(c => c.tipo_exame === ag.tipo_exame) ?? null)
    }
  }

  const comercial  = dataHora && config ? isComercial(dataHora, config.horario_inicio, config.horario_fim) : false
  const valorBase  = config ? (comercial ? config.valor_horario_comercial : config.valor_fora_comercial) : 0
  const valorLaudo = config && !config.gera_laudo && laudoSolic ? config.valor_laudo_extra : 0
  const valorTotal = valorBase + valorLaudo

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!original || !config || !dataHora) return
    setErro('')
    setSalvando(true)

    const res = await fetch('/api/revisoes', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        agendamento_original_id: original.id,
        data_hora:               dataHora,
        laudo_solicitado:        laudoSolic,
        veterinario_id:          veterinario ? Number(veterinario) : undefined,
        observacoes:             obs || null,
      }),
    })

    const data = await res.json()
    if (!res.ok) { setErro(data.error ?? 'Erro ao criar revisão.'); setSalvando(false); return }
    router.push('/admin/revisoes')
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600 transition text-sm">← Voltar</button>
        <h1 className="text-xl font-bold text-[#19202d]">Nova Revisão</h1>
      </div>

      {/* Busca */}
      {!original && (
        <div className="bg-white rounded-xl border shadow-sm p-5 mb-4">
          <h2 className="text-sm font-bold text-[#19202d] uppercase tracking-wide mb-3">Buscar agendamento original</h2>
          <form onSubmit={handleBuscar} className="flex gap-2">
            <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Nome do tutor, pet ou telefone..."
              className={INPUT + ' flex-1'} autoFocus />
            <button type="submit" disabled={buscando}
              className="bg-[#19202d] hover:bg-[#232d3f] text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition disabled:opacity-60">
              {buscando ? '...' : 'Buscar'}
            </button>
          </form>

          {/* Resultados com status já visível */}
          {resultados.length > 0 && (
            <div className="mt-3 space-y-2">
              {resultados.map(ag => (
                <div key={ag.id}
                  onClick={() => ag.pode_agendar ? handleSelecionar(ag) : undefined}
                  className={[
                    'rounded-xl border px-4 py-3 transition',
                    ag.pode_agendar
                      ? 'cursor-pointer hover:bg-amber-50/40 border-gray-200 hover:border-[#8a6e36]/30'
                      : 'cursor-not-allowed bg-gray-50 border-gray-100 opacity-70',
                  ].join(' ')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-[#19202d] text-sm">{ag.pets?.nome ?? '—'}</span>
                        <span className="text-xs text-gray-400">{ag.pets?.especie}</span>
                        <span className="text-xs text-[#8a6e36] font-medium bg-amber-50 px-2 py-0.5 rounded">{ag.tipo_exame}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {ag.tutores?.nome} · {fmtDT(ag.data_hora)}
                      </p>

                      {/* Prazo */}
                      <p className={`text-xs mt-1 font-medium ${ag.prazo_ok ? 'text-green-600' : 'text-red-500'}`}>
                        {ag.prazo_ok
                          ? `✓ Prazo válido até ${ag.prazo_limite}`
                          : `✗ Prazo expirado em ${ag.prazo_limite}`}
                      </p>

                      {/* Revisões existentes */}
                      {ag.revisoes_ativas > 0 && (
                        <p className={`text-xs mt-0.5 font-medium ${ag.revisoes_ativas >= ag.max_revisoes ? 'text-red-500' : 'text-amber-600'}`}>
                          {ag.revisoes_ativas >= ag.max_revisoes
                            ? `✗ Limite atingido (${ag.revisoes_ativas}/${ag.max_revisoes} revisões)`
                            : `⚠ ${ag.revisoes_ativas}/${ag.max_revisoes} revisões utilizadas`}
                        </p>
                      )}
                      {ag.revisoes_ativas === 0 && ag.prazo_ok && (
                        <p className="text-xs mt-0.5 text-green-600 font-medium">✓ Sem revisões anteriores</p>
                      )}
                    </div>

                    {/* Ícone de ação */}
                    <div className="shrink-0 mt-0.5">
                      {ag.pode_agendar
                        ? <span className="text-[#8a6e36] text-sm font-bold">→</span>
                        : <span className="text-gray-300 text-sm">🚫</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!buscando && buscouUmaVez && resultados.length === 0 && (
            <p className="text-sm text-gray-400 mt-3 text-center">Nenhum agendamento com exame de revisão encontrado.</p>
          )}
        </div>
      )}

      {/* Agendamento selecionado + formulário */}
      {original && config && (
        <>
          <div className="bg-amber-50 border border-[#8a6e36]/20 rounded-xl p-4 mb-4 flex items-start justify-between">
            <div>
              <p className="text-xs font-bold text-[#8a6e36] uppercase tracking-wide mb-1">Agendamento original</p>
              <p className="font-semibold text-[#19202d]">{original.pets?.nome} · {original.tipo_exame}</p>
              <p className="text-sm text-gray-500">{original.tutores?.nome} · {fmtDT(original.data_hora)}</p>
              <p className="text-xs text-gray-400 mt-1">Prazo até {original.prazo_limite}</p>
            </div>
            <button onClick={() => { setOriginal(null); setConfig(null) }}
              className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
          </div>

          <form onSubmit={handleSubmit} className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
            <h2 className="text-sm font-bold text-[#19202d] uppercase tracking-wide">Configurar revisão</h2>

            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Data e hora</label>
              <input type="datetime-local" value={dataHora} onChange={e => setDataHora(e.target.value)}
                required className={INPUT} />
              {dataHora && (
                <p className={`text-xs mt-1 font-medium ${comercial ? 'text-green-600' : 'text-amber-600'}`}>
                  {comercial ? '✓ Horário comercial' : '⚠ Fora do horário comercial'}
                  {' '}({config.horario_inicio}–{config.horario_fim}, seg–sex)
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Veterinário</label>
              <select value={veterinario} onChange={e => setVeterinario(e.target.value)} className={INPUT}>
                <option value="">Não informado</option>
                {vets.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Observações</label>
              <input type="text" value={obs} onChange={e => setObs(e.target.value)} placeholder="Opcional" className={INPUT} />
            </div>

            {!config.gera_laudo && (
              <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition">
                <input type="checkbox" checked={laudoSolic} onChange={e => setLaudoSolic(e.target.checked)}
                  className="w-4 h-4 accent-[#8a6e36]" />
                <div>
                  <p className="text-sm font-semibold text-[#19202d]">Solicitar laudo</p>
                  <p className="text-xs text-gray-500">
                    Revisão de ultra não inclui laudo. Custo extra: R$ {config.valor_laudo_extra.toFixed(2).replace('.', ',')}
                  </p>
                </div>
              </label>
            )}

            <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Resumo de valores</p>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Revisão ({comercial ? 'horário comercial' : 'fora do horário'})</span>
                  <span className="font-semibold">
                    {valorBase === 0 ? <span className="text-green-600">Gratuito</span> : `R$ ${valorBase.toFixed(2).replace('.', ',')}`}
                  </span>
                </div>
                {laudoSolic && !config.gera_laudo && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Laudo extra</span>
                    <span className="font-semibold">R$ {valorLaudo.toFixed(2).replace('.', ',')}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-1 mt-1">
                  <span className="font-bold text-[#19202d]">Total</span>
                  <span className="font-bold text-[#19202d]">
                    {valorTotal === 0 ? <span className="text-green-600">Gratuito</span> : `R$ ${valorTotal.toFixed(2).replace('.', ',')}`}
                  </span>
                </div>
              </div>
            </div>

            {erro && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>}

            <button type="submit" disabled={salvando || !dataHora}
              className="w-full bg-[#19202d] hover:bg-[#232d3f] disabled:opacity-60 text-white font-bold py-3 rounded-lg transition text-sm">
              {salvando ? 'Criando...' : 'Criar revisão'}
            </button>
          </form>
        </>
      )}
    </div>
  )
}
