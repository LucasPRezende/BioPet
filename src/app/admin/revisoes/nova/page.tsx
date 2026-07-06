'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { gerarFeriadosPorAno } from '@/lib/feriados'

interface AgendamentoOriginal {
  id: number
  tipo_exame: string
  data_hora: string
  status: string
  veterinario_id: number | null
  duracao_minutos: number | null
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
  permite_revisao: boolean
  prazo_dias: number
  valor_horario_comercial: number
  valor_fora_comercial: number
  gera_laudo: boolean
  valor_laudo_extra: number
}

interface Vet { id: number; nome: string }

const INPUT = 'w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36] bg-white'

function fmtDT(s: string) {
  return new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function isComercial(dataHora: string, inicio: string, fim: string, feriados: string[] = []) {
  const d = new Date(dataHora)
  const dow = d.getDay()
  if (dow === 0 || dow === 6) return false
  const dateStr = d.toLocaleDateString('en-CA')
  if (feriados.includes(dateStr)) return false
  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
  const atual = d.getHours() * 60 + d.getMinutes()
  return atual >= toMin(inicio) && atual < toMin(fim)
}

export default function NovaRevisaoPage() {
  const router = useRouter()

  const [feriadoDatas,    setFeriadoDatas]    = useState<string[]>([])
  const [horarioInicio,   setHorarioInicio]   = useState('08:00')
  const [horarioFim,      setHorarioFim]      = useState('17:00')

  const [busca,        setBusca]        = useState('')
  const [resultados,   setResultados]   = useState<AgendamentoOriginal[]>([])
  const [buscando,     setBuscando]     = useState(false)
  const [buscouUmaVez, setBuscouUmaVez] = useState(false)
  const [original,     setOriginal]     = useState<AgendamentoOriginal | null>(null)
  const [config,       setConfig]       = useState<RevisaoConfig | null>(null)

  const [data,            setData]            = useState('')
  const [horaSelecionada, setHoraSelecionada] = useState('')
  const [horariosLivres,  setHorariosLivres]  = useState<string[]>([])
  const [loadingHorarios, setLoadingHorarios] = useState(false)
  const [laudoSolic,      setLaudoSolic]      = useState(false)
  const [formaPagamento,  setFormaPagamento]  = useState<'pix' | 'cartao'>('pix')
  const [enviarLink,      setEnviarLink]      = useState(true)
  const [veterinario,     setVeterinario]     = useState('')
  const [obs,             setObs]             = useState('')
  const [vets,            setVets]            = useState<Vet[]>([])
  const [salvando,        setSalvando]        = useState(false)
  const [erro,            setErro]            = useState('')
  const [linkPagamento,   setLinkPagamento]   = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/veterinarios').then(r => r.ok ? r.json() : []).then(setVets).catch(() => {})
    const y = new Date().getFullYear()
    const gerados = [y - 1, y, y + 1, y + 2].flatMap(gerarFeriadosPorAno).map(f => f.data)
    fetch('/api/feriados?todos=1')
      .then(r => r.ok ? r.json() : [])
      .then((d: { data: string }[]) => setFeriadoDatas(Array.from(new Set([...d.map(f => f.data), ...gerados]))))
    fetch('/api/feriados/horario').then(r => r.ok ? r.json() : {}).then((d: { horario_inicio?: string; horario_fim?: string }) => {
      if (d.horario_inicio) setHorarioInicio(d.horario_inicio)
      if (d.horario_fim)    setHorarioFim(d.horario_fim)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!data || !original) { setHorariosLivres([]); return }
    const duracao = original.duracao_minutos ?? 30
    setLoadingHorarios(true)
    setHoraSelecionada('')
    fetch(`/api/agendamentos/horarios-livres?data=${data}&duracao=${duracao}`)
      .then(r => r.ok ? r.json() : { horarios_livres: [] })
      .then(d => { setHorariosLivres(d.horarios_livres ?? []); setLoadingHorarios(false) })
      .catch(() => setLoadingHorarios(false))
  }, [data, original])

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
    setData('')
    setHoraSelecionada('')
    setLaudoSolic(false)
    setFormaPagamento('pix')
    setEnviarLink(true)
    setLinkPagamento(null)
    setErro('')
    setVeterinario(String(ag.veterinario_id ?? ''))

    const res = await fetch('/api/revisoes/config')
    if (res.ok) {
      const configs: RevisaoConfig[] = await res.json()
      // Suporta tipo_exame combinado (ex: "Raio-X, Ultrassom Abdominal Total"):
      // usa o primeiro tipo do agendamento que permite revisão (mesma regra da API)
      const tipos = ag.tipo_exame.split(',').map(t => t.trim())
      setConfig(
        tipos
          .map(t => configs.find(c => c.tipo_exame === t && c.permite_revisao))
          .find(Boolean) ?? null
      )
    }
  }

  const dataHora             = data && horaSelecionada ? `${data}T${horaSelecionada}:00` : ''
  const comercial            = dataHora ? isComercial(dataHora, horarioInicio, horarioFim, feriadoDatas) : false
  const originalFoiComercial = original  ? isComercial(original.data_hora, horarioInicio, horarioFim, feriadoDatas) : false
  const horarioInvalido      = !!(originalFoiComercial && dataHora && !comercial)

  const valorBase  = config
    ? config.gera_laudo
      ? (comercial ? config.valor_horario_comercial : config.valor_fora_comercial)
      : (laudoSolic ? config.valor_laudo_extra : 0)
    : 0
  const valorTotal = valorBase

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!original || !config || !data || !horaSelecionada || horarioInvalido) return
    setErro('')
    setSalvando(true)

    const res = await fetch('/api/revisoes', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        agendamento_original_id: original.id,
        data_hora:               `${data}T${horaSelecionada}:00`,
        laudo_solicitado:        laudoSolic,
        forma_pagamento:         valorTotal > 0 ? formaPagamento : undefined,
        enviar_link:             valorTotal > 0 ? enviarLink : undefined,
        veterinario_id:          veterinario ? Number(veterinario) : undefined,
        observacoes:             obs || null,
      }),
    })

    const resData = await res.json()
    if (!res.ok) { setErro(resData.error ?? 'Erro ao criar revisão.'); setSalvando(false); return }

    if (resData.mp_init_point) {
      setLinkPagamento(resData.mp_init_point)
      setSalvando(false)
    } else {
      router.push('/admin/revisoes')
    }
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
                      <p className={`text-xs mt-1 font-medium ${ag.prazo_ok ? 'text-green-600' : 'text-red-500'}`}>
                        {ag.prazo_ok
                          ? `✓ Prazo válido até ${ag.prazo_limite}`
                          : `✗ Prazo expirado em ${ag.prazo_limite}`}
                      </p>
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

      {/* Formulário */}
      {/* Tela de sucesso com link de pagamento */}
      {linkPagamento && (
        <div className="bg-white rounded-xl border shadow-sm p-6 space-y-4 text-center">
          <div className="text-4xl">✅</div>
          <h2 className="text-lg font-bold text-[#19202d]">Revisão criada com sucesso!</h2>
          <p className="text-sm text-gray-500">
            {enviarLink ? 'O link de pagamento foi gerado e enviado ao tutor via WhatsApp.' : 'O link de pagamento foi gerado. Você pode copiá-lo abaixo.'}
          </p>
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 flex items-center justify-between gap-3">
            <span className="text-xs text-gray-500 truncate flex-1">{linkPagamento}</span>
            <button type="button" onClick={() => navigator.clipboard.writeText(linkPagamento)}
              className="text-xs font-semibold text-[#8a6e36] hover:underline shrink-0">Copiar</button>
          </div>
          <button onClick={() => router.push('/admin/revisoes')}
            className="w-full bg-[#19202d] hover:bg-[#232d3f] text-white font-bold py-3 rounded-lg transition text-sm">
            Ver revisões
          </button>
        </div>
      )}

      {original && !config && !linkPagamento && (
        <div className="bg-white rounded-xl border shadow-sm p-6 text-center space-y-3">
          <p className="text-sm text-gray-600">
            Não foi encontrada configuração de revisão para o exame <strong>{original.tipo_exame}</strong>.
          </p>
          <button onClick={() => { setOriginal(null); setConfig(null) }}
            className="text-sm font-semibold text-[#8a6e36] hover:underline">
            ← Voltar para a busca
          </button>
        </div>
      )}

      {original && config && !linkPagamento && (
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

            {/* Data */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Data</label>
              <p className={`text-xs mb-1.5 font-medium ${originalFoiComercial ? 'text-blue-600' : 'text-violet-600'}`}>
                {originalFoiComercial
                  ? `ℹ Exame original em horário comercial — revisão também deve ser em horário comercial`
                  : `ℹ Exame original em horário especial — revisão pode ser agendada em qualquer horário`}
              </p>
              <input type="date" value={data} onChange={e => setData(e.target.value)} required className={INPUT} />
            </div>

            {/* Grade de horários */}
            {data && (
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Horário</label>
                {loadingHorarios ? (
                  <p className="text-sm text-gray-400 py-3 text-center">Carregando horários...</p>
                ) : horariosLivres.length === 0 ? (
                  <input type="time" value={horaSelecionada} onChange={e => setHoraSelecionada(e.target.value)} className={INPUT} />
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
                    <div className="mt-2">
                      <p className="text-xs text-gray-400 mb-1">Ou digite um horário personalizado:</p>
                      <input type="time" value={horaSelecionada} onChange={e => setHoraSelecionada(e.target.value)} className={INPUT} />
                    </div>
                  </>
                )}

                {horaSelecionada && !horarioInvalido && (
                  <p className={`text-xs mt-1 font-medium ${comercial ? 'text-green-600' : 'text-amber-600'}`}>
                    {comercial ? '✓ Horário comercial' : '⚠ Fora do horário comercial'}
                    {' '}({horarioInicio}–{horarioFim}, seg–sex)
                  </p>
                )}
                {horarioInvalido && (
                  <p className="text-xs mt-1 font-medium text-red-600">
                    ✗ Revisões de exames em horário comercial só podem ser agendadas em horário comercial ({horarioInicio}–{horarioFim}, seg–sex)
                  </p>
                )}
              </div>
            )}

            {/* Solicitar laudo (só quando o config não inclui laudo automaticamente) */}
            {!config.gera_laudo && (
              <label className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg cursor-pointer hover:bg-amber-50/40 transition">
                <input type="checkbox" checked={laudoSolic} onChange={e => { setLaudoSolic(e.target.checked); setFormaPagamento('pix') }}
                  className="w-4 h-4 accent-[#8a6e36]" />
                <div>
                  <span className="text-sm font-semibold text-[#19202d]">Solicitar emissão de laudo</span>
                  {config.valor_laudo_extra > 0 && (
                    <span className="text-xs text-gray-500 ml-2">
                      (+ R$ {Number(config.valor_laudo_extra).toFixed(2).replace('.', ',')})
                    </span>
                  )}
                </div>
              </label>
            )}

            {/* Forma de pagamento (quando há cobrança) */}
            {valorTotal > 0 && (
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Forma de pagamento</label>
                <div className="flex gap-3">
                  {(['pix', 'cartao'] as const).map(op => (
                    <label key={op} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border cursor-pointer transition text-sm font-semibold ${formaPagamento === op ? 'bg-[#19202d] text-white border-[#19202d]' : 'border-gray-200 text-gray-700 hover:border-[#8a6e36] hover:bg-amber-50'}`}>
                      <input type="radio" name="forma_pagamento" value={op} checked={formaPagamento === op}
                        onChange={() => setFormaPagamento(op)} className="sr-only" />
                      {op === 'pix' ? '💠 Pix' : '💳 Cartão'}
                    </label>
                  ))}
                </div>
                <label className="flex items-center gap-2 mt-2 cursor-pointer">
                  <input type="checkbox" checked={enviarLink} onChange={e => setEnviarLink(e.target.checked)}
                    className="w-4 h-4 accent-[#8a6e36]" />
                  <span className="text-xs text-gray-600">Enviar link ao tutor pelo WhatsApp</span>
                </label>
              </div>
            )}

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

            <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Resumo de valores</p>
              <div className="space-y-1 text-sm">
                {config.gera_laudo ? (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Revisão com laudo ({comercial ? 'horário comercial' : 'fora do horário'})</span>
                    <span className="font-semibold">
                      {valorBase === 0 ? <span className="text-green-600">Gratuito</span> : `R$ ${valorBase.toFixed(2).replace('.', ',')}`}
                    </span>
                  </div>
                ) : laudoSolic ? (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Revisão + laudo solicitado</span>
                    <span className="font-semibold">
                      {valorBase === 0 ? <span className="text-green-600">Gratuito</span> : `R$ ${valorBase.toFixed(2).replace('.', ',')}`}
                    </span>
                  </div>
                ) : (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Revisão sem laudo</span>
                    <span className="font-semibold text-green-600">Gratuito</span>
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

            <button type="submit" disabled={salvando || !data || !horaSelecionada || horarioInvalido}
              className="w-full bg-[#19202d] hover:bg-[#232d3f] disabled:opacity-60 text-white font-bold py-3 rounded-lg transition text-sm">
              {salvando ? 'Criando...' : 'Criar revisão'}
            </button>
          </form>
        </>
      )}
    </div>
  )
}
