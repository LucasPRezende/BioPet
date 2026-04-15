'use client'

import { useState, useEffect, useCallback } from 'react'
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
  pergunta_laudo:   'Pergunta sobre laudo',
  pergunta_tecnica: 'Dúvida técnica',
  ia_travou:        'IA travou',
  erro_tecnico:     'Erro técnico',
  agendamento:      'Novo agendamento',
  remarcacao:       'Remarcação',
  cancelamento:     'Cancelamento',
}

const MOTIVO_COLOR: Record<string, string> = {
  pergunta_laudo:   'bg-blue-100 text-blue-700',
  pergunta_tecnica: 'bg-yellow-100 text-yellow-700',
  ia_travou:        'bg-orange-100 text-orange-700',
  erro_tecnico:     'bg-red-100 text-red-700',
  agendamento:      'bg-green-100 text-green-700',
  remarcacao:       'bg-purple-100 text-purple-700',
  cancelamento:     'bg-gray-100 text-gray-600',
}

const TIPOS_REQUER_ATENCAO = new Set([
  'ia_travou', 'pergunta_laudo', 'pergunta_tecnica', 'erro_tecnico',
])

const TIPOS_AGENDAMENTO = new Set(['agendamento', 'remarcacao', 'cancelamento'])

function tipoEfetivo(n: Notificacao): string {
  return n.tipo_evento ?? n.motivo
}

function isRequerAtencao(n: Notificacao): boolean {
  return !n.tipo_evento || TIPOS_REQUER_ATENCAO.has(n.tipo_evento)
}

function iconeNotificacao(n: Notificacao): string {
  const tipo = tipoEfetivo(n)
  if (tipo === 'agendamento')  return '📅'
  if (tipo === 'remarcacao')   return '🔄'
  if (tipo === 'cancelamento') return '❌'
  return '🔴'
}

function tempoAtras(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const min  = Math.floor(diff / 60_000)
  const h    = Math.floor(min / 60)
  const d    = Math.floor(h / 24)
  if (min < 1)  return 'agora mesmo'
  if (min < 60) return `há ${min} minuto${min > 1 ? 's' : ''}`
  if (h   < 24) return `há ${h} hora${h > 1 ? 's' : ''}`
  return `há ${d} dia${d > 1 ? 's' : ''}`
}

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
  const [resolving, setResolving] = useState<number | null>(null)

  const fetchNotifs = useCallback(async () => {
    const res = await fetch('/api/admin/notificacoes')
    if (res.status === 401 || res.status === 403) { router.push('/login'); return }
    if (res.ok) {
      const d = await res.json()
      setNotifs(d.notificacoes ?? [])
    }
    setLoading(false)
  }, [router])

  useEffect(() => { fetchNotifs() }, [fetchNotifs])

  async function resolver(id: number, resetarAtendimento: boolean) {
    setResolving(id)
    await fetch(`/api/admin/notificacoes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resetar_atendimento: resetarAtendimento }),
    })
    await fetchNotifs()
    setResolving(null)
  }

  const pendentesAtencao = notifs.filter(n => !n.visualizado && isRequerAtencao(n)).length
  const totalAtencao     = notifs.filter(n => isRequerAtencao(n)).length
  const totalAgendamentos = notifs.filter(n => n.tipo_evento && TIPOS_AGENDAMENTO.has(n.tipo_evento)).length

  const exibidas = filtro === 'atencao'
    ? notifs.filter(n => isRequerAtencao(n))
    : filtro === 'agendamentos'
      ? notifs.filter(n => n.tipo_evento && TIPOS_AGENDAMENTO.has(n.tipo_evento))
      : notifs

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#19202d]">Notificações</h1>
            {pendentesAtencao > 0 && (
              <p className="text-sm text-red-600 font-medium mt-0.5">
                {pendentesAtencao} pendente{pendentesAtencao > 1 ? 's' : ''} de atendimento
              </p>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setFiltro('atencao')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                filtro === 'atencao'
                  ? 'bg-[#19202d] text-white'
                  : 'bg-white border text-gray-600 hover:bg-gray-50'
              }`}
            >
              🔴 Requer atenção {totalAtencao > 0 && `(${totalAtencao})`}
            </button>
            <button
              onClick={() => setFiltro('agendamentos')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                filtro === 'agendamentos'
                  ? 'bg-[#19202d] text-white'
                  : 'bg-white border text-gray-600 hover:bg-gray-50'
              }`}
            >
              📅 Agendamentos {totalAgendamentos > 0 && `(${totalAgendamentos})`}
            </button>
            <button
              onClick={() => setFiltro('todos')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                filtro === 'todos'
                  ? 'bg-[#19202d] text-white'
                  : 'bg-white border text-gray-600 hover:bg-gray-50'
              }`}
            >
              Todos ({notifs.length})
            </button>
          </div>
        </div>

        {/* Lista */}
        {loading ? (
          <p className="text-gray-400 text-center py-12">Carregando...</p>
        ) : exibidas.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-2">🔔</p>
            <p className="font-medium">
              {filtro === 'atencao'
                ? 'Nenhuma notificação de atenção'
                : filtro === 'agendamentos'
                  ? 'Nenhum registro de agendamento'
                  : 'Nenhuma notificação'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {exibidas.map(n => {
              const requerAtencao = isRequerAtencao(n)
              const tipo = tipoEfetivo(n)
              return (
                <div
                  key={n.id}
                  className={`bg-white rounded-xl border shadow-sm overflow-hidden ${
                    n.visualizado ? 'opacity-60' : ''
                  }`}
                >
                  <div className="h-1 bg-gold-stripe" />
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      {/* Info do cliente */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-base">{iconeNotificacao(n)}</span>
                          <span className="font-bold text-[#19202d]">
                            {n.nome_tutor ?? 'Cliente desconhecido'}
                          </span>
                          <span className="text-sm text-gray-400">{formatTelefone(n.telefone)}</span>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${MOTIVO_COLOR[tipo] ?? 'bg-gray-100 text-gray-600'}`}>
                            {MOTIVO_LABEL[tipo] ?? tipo}
                          </span>
                          {n.agendamento_id && (
                            <span className="text-xs text-gray-400">
                              #{n.agendamento_id}
                            </span>
                          )}
                          {n.visualizado && requerAtencao && (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                              Resolvido
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400">{tempoAtras(n.criado_em)}</p>
                      </div>
                    </div>

                    {/* Mensagens */}
                    <div className="mt-3 space-y-2">
                      {n.mensagem_cliente && (
                        <div className="bg-blue-50 rounded-lg px-3 py-2">
                          <p className="text-xs font-semibold text-blue-500 mb-0.5">Cliente disse:</p>
                          <p className="text-sm text-gray-700">&quot;{n.mensagem_cliente}&quot;</p>
                        </div>
                      )}
                      {n.mensagem_ia && (
                        <div className="bg-gray-50 rounded-lg px-3 py-2">
                          <p className="text-xs font-semibold text-gray-400 mb-0.5">IA respondeu:</p>
                          <p className="text-sm text-gray-600">{n.mensagem_ia}</p>
                        </div>
                      )}
                    </div>

                    {/* Ações — apenas para notificações que requerem atenção */}
                    {requerAtencao && !n.visualizado && (
                      <div className="mt-4 flex gap-2 flex-wrap">
                        <button
                          onClick={() => resolver(n.id, false)}
                          disabled={resolving === n.id}
                          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50"
                        >
                          {resolving === n.id ? 'Salvando...' : '✓ Marcar como resolvido'}
                        </button>
                        <button
                          onClick={() => resolver(n.id, true)}
                          disabled={resolving === n.id}
                          className="px-4 py-2 bg-[#c4a35a] hover:bg-[#a88a47] text-white text-sm font-semibold rounded-lg transition disabled:opacity-50"
                        >
                          {resolving === n.id ? 'Salvando...' : '✓ Resolver e liberar IA'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
