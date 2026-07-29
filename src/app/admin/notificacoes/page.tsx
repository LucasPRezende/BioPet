'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'


interface Notificacao {
  id:               number
  telefone:         string
  nome_tutor:       string | null
  motivo:           string
  mensagem_cliente: string | null
  mensagem_ia:      string | null
  visualizado:      boolean
  criado_em:        string
  tipo_evento:      string | null
  agendamento_id:   number | null
}

const MOTIVO_LABEL: Record<string, string> = {
  pergunta_laudo:      'Pergunta sobre laudo',
  pergunta_tecnica:    'Dúvida técnica',
  ia_travou:           'IA travou',
  erro_tecnico:        'Erro técnico',
  agendamento:         'Novo agendamento',
  agendamento_clinica: 'Agendamento (clínica)',
  remarcacao:          'Remarcação',
  cancelamento:        'Cancelamento',
}

const MOTIVO_COLOR: Record<string, string> = {
  pergunta_laudo:      'bg-blue-100 text-blue-700',
  pergunta_tecnica:    'bg-yellow-100 text-yellow-700',
  ia_travou:           'bg-orange-100 text-orange-700',
  erro_tecnico:        'bg-red-100 text-red-700',
  agendamento:         'bg-green-100 text-green-700',
  agendamento_clinica: 'bg-teal-100 text-teal-700',
  remarcacao:          'bg-purple-100 text-purple-700',
  cancelamento:        'bg-gray-100 text-gray-600',
}

const TIPOS_REQUER_ATENCAO = new Set([
  'ia_travou', 'pergunta_laudo', 'pergunta_tecnica', 'erro_tecnico',
])

const TIPOS_AGENDAMENTO = new Set([
  'agendamento', 'remarcacao', 'cancelamento', 'agendamento_clinica',
])

function tipoEfetivo(n: Notificacao): string {
  return n.tipo_evento ?? n.motivo
}

function isRequerAtencao(n: Notificacao): boolean {
  return !n.tipo_evento || TIPOS_REQUER_ATENCAO.has(n.tipo_evento)
}

function iconeNotificacao(n: Notificacao): string {
  const tipo = tipoEfetivo(n)
  if (tipo === 'agendamento' || tipo === 'agendamento_clinica') return '📅'
  if (tipo === 'remarcacao')   return '🔄'
  if (tipo === 'cancelamento') return '❌'
  return '🔴'
}

// `criado_em` vem do Postgres como TIMESTAMP sem timezone (ex.: "2026-07-29T17:47:59"),
// já em UTC — mas sem o "Z", o Date() do JS interpreta como horário local, adiantando
// o relógio em 3h (UTC-3). Força a leitura como UTC antes de converter pro fuso do navegador.
function parseUtc(iso: string): Date {
  return new Date(/Z|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`)
}

function tempoAtras(iso: string) {
  const diff = Date.now() - parseUtc(iso).getTime()
  const min  = Math.floor(diff / 60_000)
  const h    = Math.floor(min / 60)
  const d    = Math.floor(h / 24)
  if (min < 1)  return 'agora mesmo'
  if (min < 60) return `há ${min} minuto${min > 1 ? 's' : ''}`
  if (h   < 24) return `há ${h} hora${h > 1 ? 's' : ''}`
  return `há ${d} dia${d > 1 ? 's' : ''}`
}

function horaExata(iso: string) {
  return parseUtc(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
}

function dayKey(iso: string, nowMs: number): string {
  const d = new Date(iso), n = new Date(nowMs)
  const d0 = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const n0 = new Date(n.getFullYear(), n.getMonth(), n.getDate())
  const diffDays = Math.round((n0.getTime() - d0.getTime()) / 86_400_000)
  if (diffDays <= 0) return 'Hoje'
  if (diffDays === 1) return 'Ontem'
  if (diffDays <= 7) return 'Esta semana'
  return 'Mais antigas'
}

const GRUPOS_ORDEM = ['Hoje', 'Ontem', 'Esta semana', 'Mais antigas']

function formatTelefone(tel: string) {
  const digits = tel.replace(/\D/g, '').replace(/^55/, '')
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return tel
}

type Filtro = 'todos' | 'atencao' | 'agendamentos'

export default function NotificacoesPage() {
  const router = useRouter()
  const [notifs,    setNotifs]    = useState<Notificacao[]>([])
  const [loading,   setLoading]   = useState(true)
  const [filtro,    setFiltro]    = useState<Filtro>('atencao')
  const [search,    setSearch]    = useState('')
  const [resolving, setResolving] = useState<number | null>(null)
  const [liberarIA, setLiberarIA] = useState<Record<number, boolean>>({})
  const [now,       setNow]       = useState(() => Date.now())
  const [lastSync,  setLastSync]  = useState(() => Date.now())
  const [toast,     setToast]     = useState<string | null>(null)
  const [newIds,    setNewIds]    = useState<Set<number>>(new Set())

  const knownIdsRef = useRef<Set<number> | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchNotifs = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    const res = await fetch('/api/admin/notificacoes')
    if (res.status === 401 || res.status === 403) { router.push('/login'); return }
    if (res.ok) {
      const d = await res.json()
      const rows: Notificacao[] = d.notificacoes ?? []

      if (knownIdsRef.current) {
        const idsNovos = rows.filter(n => !knownIdsRef.current!.has(n.id)).map(n => n.id)
        if (idsNovos.length > 0) {
          setNewIds(prev => new Set([...Array.from(prev), ...idsNovos]))
          setToast(idsNovos.length > 1 ? `🔔 ${idsNovos.length} novas notificações recebidas` : '🔔 Nova notificação recebida agora')
          if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
          toastTimerRef.current = setTimeout(() => setToast(null), 5000)
          setTimeout(() => {
            setNewIds(prev => {
              const next = new Set(prev)
              idsNovos.forEach(id => next.delete(id))
              return next
            })
          }, 2600)
        }
      }
      knownIdsRef.current = new Set(rows.map(n => n.id))

      setNotifs(rows)
      setLastSync(Date.now())
    }
    if (!silent) setLoading(false)
  }, [router])

  useEffect(() => {
    fetchNotifs(false)
    const pollInterval = setInterval(() => fetchNotifs(true), 20_000)
    const tickInterval = setInterval(() => setNow(Date.now()), 1_000)
    return () => {
      clearInterval(pollInterval)
      clearInterval(tickInterval)
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [fetchNotifs])

  async function resolver(id: number, resetarAtendimento: boolean) {
    setResolving(id)
    await fetch(`/api/admin/notificacoes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resetar_atendimento: resetarAtendimento }),
    })
    setLiberarIA(prev => { const next = { ...prev }; delete next[id]; return next })
    await fetchNotifs(true)
    setResolving(null)
  }

  function toggleLiberarIA(id: number) {
    setLiberarIA(prev => ({ ...prev, [id]: !prev[id] }))
  }

  async function abrirAgendamentos() {
    setFiltro('agendamentos')
    // Agendamentos são informativos: ao abrir a aba, marca todos como vistos
    // para limpar o badge do menu.
    if (notifs.some(n => !n.visualizado && n.tipo_evento && TIPOS_AGENDAMENTO.has(n.tipo_evento))) {
      await fetch('/api/admin/notificacoes/marcar-vistos', { method: 'POST' })
      fetchNotifs(true)
    }
  }

  const pendentesAtencao   = notifs.filter(n => !n.visualizado && isRequerAtencao(n)).length
  const totalAtencao       = notifs.filter(n => isRequerAtencao(n)).length
  const totalAgendamentos  = notifs.filter(n => n.tipo_evento && TIPOS_AGENDAMENTO.has(n.tipo_evento)).length
  const agendamentosNovos  = notifs.filter(n => !n.visualizado && n.tipo_evento && TIPOS_AGENDAMENTO.has(n.tipo_evento)).length

  let exibidas = filtro === 'atencao'
    ? notifs.filter(n => isRequerAtencao(n))
    : filtro === 'agendamentos'
      ? notifs.filter(n => n.tipo_evento && TIPOS_AGENDAMENTO.has(n.tipo_evento))
      : notifs

  const q = search.trim().toLowerCase()
  if (q) {
    exibidas = exibidas.filter(n =>
      `${n.nome_tutor ?? ''} ${n.telefone} ${n.mensagem_cliente ?? ''} ${n.mensagem_ia ?? ''}`.toLowerCase().includes(q)
    )
  }

  const bucketMap: Record<string, Notificacao[]> = {}
  exibidas.forEach(n => {
    const key = dayKey(n.criado_em, now)
    ;(bucketMap[key] = bucketMap[key] ?? []).push(n)
  })
  const grupos = GRUPOS_ORDEM.filter(k => bucketMap[k]?.length).map(k => ({ label: k, items: bucketMap[k] }))

  let emptyMessage = filtro === 'atencao' ? 'Nenhuma notificação de atenção'
    : filtro === 'agendamentos' ? 'Nenhum registro de agendamento' : 'Nenhuma notificação'
  if (q && exibidas.length === 0) emptyMessage = `Nenhum resultado para "${search}"`

  const lastSyncSeconds = Math.max(0, Math.round((now - lastSync) / 1000))
  const lastSyncLabel = lastSyncSeconds < 3 ? 'Atualizado agora' : `Atualizado há ${lastSyncSeconds}s`

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#19202d]">Notificações</h1>
            {pendentesAtencao > 0 && (
              <p className="text-sm text-red-600 font-medium mt-0.5">
                {pendentesAtencao} pendente{pendentesAtencao > 1 ? 's' : ''} de atendimento
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-full px-3 py-1.5">
              <span className="w-[7px] h-[7px] rounded-full bg-green-600 animate-pulse inline-block" />
              <span className="text-xs text-gray-500 font-semibold">{lastSyncLabel}</span>
            </div>
            <button
              onClick={() => fetchNotifs(true)}
              title="Atualizar agora"
              className="w-8 h-8 rounded-full border border-gray-200 bg-white text-gray-500 text-sm hover:bg-gray-100 transition"
            >
              ↻
            </button>
          </div>
        </div>

        {/* Filtros + busca */}
        <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
          <div className="flex gap-1.5 bg-[#eef0f3] p-1 rounded-xl">
            <button
              onClick={() => setFiltro('atencao')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition ${
                filtro === 'atencao' ? 'bg-[#19202d] text-white' : 'bg-transparent text-gray-600 hover:text-[#19202d]'
              }`}
            >
              🔴 Requer atenção {totalAtencao > 0 && `(${totalAtencao})`}
            </button>
            <button
              onClick={abrirAgendamentos}
              className={`relative px-3.5 py-2 rounded-lg text-xs font-bold transition ${
                filtro === 'agendamentos' ? 'bg-[#19202d] text-white' : 'bg-transparent text-gray-600 hover:text-[#19202d]'
              }`}
            >
              📅 Agendamentos {totalAgendamentos > 0 && `(${totalAgendamentos})`}
              {agendamentosNovos > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-extrabold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1">
                  {agendamentosNovos > 99 ? '99+' : agendamentosNovos}
                </span>
              )}
            </button>
            <button
              onClick={() => setFiltro('todos')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition ${
                filtro === 'todos' ? 'bg-[#19202d] text-white' : 'bg-transparent text-gray-600 hover:text-[#19202d]'
              }`}
            >
              Todos ({notifs.length})
            </button>
          </div>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, telefone ou mensagem…"
            className="w-[280px] max-w-full px-3.5 py-2 rounded-lg border border-gray-200 bg-white text-sm text-[#19202d] outline-none focus:ring-2 focus:ring-[#8a6e36]"
          />
        </div>

        {toast && (
          <div className="fixed top-5 right-5 z-50 bg-[#19202d] text-white px-4.5 py-3 rounded-xl text-sm font-semibold shadow-2xl border-t-2 border-[#c4a35a]">
            {toast}
          </div>
        )}

        {/* Lista */}
        {loading ? (
          <p className="text-gray-400 text-center py-12">Carregando...</p>
        ) : grupos.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-2">🔔</p>
            <p className="font-medium">{emptyMessage}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-7">
            {grupos.map(grupo => (
              <div key={grupo.label}>
                <p className="text-[11px] font-extrabold text-gray-400 uppercase tracking-widest mb-2.5">
                  {grupo.label}
                </p>
                <div className="flex flex-col gap-2.5">
                  {grupo.items.map(n => {
                    const requerAtencao = isRequerAtencao(n)
                    const tipo = tipoEfetivo(n)
                    const isNovo = newIds.has(n.id)
                    const barColor = requerAtencao && !n.visualizado ? 'bg-red-600'
                      : requerAtencao && n.visualizado ? 'bg-green-600' : 'bg-[#c4a35a]'
                    const isResolving = resolving === n.id
                    const liberarChecked = !!liberarIA[n.id]

                    return (
                      <div
                        key={n.id}
                        className={`flex bg-white border border-[#eef0f3] rounded-xl shadow-sm overflow-hidden transition ${
                          n.visualizado ? 'opacity-60' : ''
                        } ${isNovo ? 'ring-2 ring-[#c4a35a]/50 bg-[#fdf8ee]' : ''}`}
                      >
                        <div className={`w-[3px] shrink-0 ${barColor}`} />
                        <div className="flex-1 min-w-0 p-4">
                          <div className="flex items-start justify-between gap-2.5 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                              <span className="text-[15px]">{iconeNotificacao(n)}</span>
                              <span className="font-bold text-[#19202d] text-sm">
                                {n.nome_tutor ?? 'Cliente desconhecido'}
                              </span>
                              <span className="text-xs text-gray-400">{formatTelefone(n.telefone)}</span>
                              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${MOTIVO_COLOR[tipo] ?? 'bg-gray-100 text-gray-600'}`}>
                                {MOTIVO_LABEL[tipo] ?? tipo}
                              </span>
                              {n.agendamento_id && (
                                <span className="text-xs text-gray-400">#{n.agendamento_id}</span>
                              )}
                              {n.visualizado && requerAtencao && (
                                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-green-100 text-green-700">
                                  Resolvido
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-gray-400 whitespace-nowrap">
                              {horaExata(n.criado_em)} · {tempoAtras(n.criado_em)}
                            </span>
                          </div>

                          {n.mensagem_cliente && (
                            <div className="mt-2.5 bg-blue-50 rounded-lg px-3 py-2">
                              <p className="text-xs font-semibold text-blue-500 mb-0.5">Cliente disse:</p>
                              <p className="text-sm text-gray-700">&quot;{n.mensagem_cliente}&quot;</p>
                            </div>
                          )}
                          {n.mensagem_ia && (
                            <div className="mt-2 bg-gray-50 rounded-lg px-3 py-2">
                              <p className="text-xs font-semibold text-gray-400 mb-0.5">IA respondeu:</p>
                              <p className="text-sm text-gray-600">{n.mensagem_ia}</p>
                            </div>
                          )}

                          {requerAtencao && !n.visualizado && (
                            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-3.5 flex-wrap">
                              <button
                                onClick={() => resolver(n.id, liberarChecked)}
                                disabled={isResolving}
                                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-lg transition disabled:opacity-50"
                              >
                                {isResolving ? 'Salvando...' : liberarChecked ? 'Resolver e liberar IA' : 'Marcar como resolvido'}
                              </button>
                              <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={liberarChecked}
                                  onChange={() => toggleLiberarIA(n.id)}
                                  className="w-3.5 h-3.5 accent-[#c4a35a]"
                                />
                                Liberar IA para responder de novo
                              </label>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
