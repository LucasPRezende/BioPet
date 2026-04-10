'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'


interface NumeroBloqueado {
  numero:   string
  descricao: string
}

interface Config {
  tempo_retorno_ia_horas: number
  numeros_bloqueados:     NumeroBloqueado[]
}

interface TutorBloqueado {
  id:                    number
  nome:                  string | null
  telefone:              string
  atendimento_humano_ate: string | null
}

function normalizeNumero(n: string) {
  const digits = n.replace(/\D/g, '')
  return digits.startsWith('55') ? digits : `55${digits}`
}

function formatTelefone(tel: string) {
  const digits = tel.replace(/\D/g, '').replace(/^55/, '')
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return tel
}

export default function ConfiguracaoAgentePage() {
  const router = useRouter()
  const [config,   setConfig]   = useState<Config>({ tempo_retorno_ia_horas: 2, numeros_bloqueados: [] })
  const [loading,  setLoading]  = useState(true)
  const [saving,        setSaving]        = useState(false)
  const [saved,         setSaved]         = useState(false)
  const [saveError,     setSaveError]     = useState('')
  const [novoNum,       setNovoNum]       = useState('')
  const [novoDesc,      setNovoDesc]      = useState('')
  const [tutoresBloq,   setTutoresBloq]   = useState<TutorBloqueado[]>([])
  const [liberando,     setLiberando]     = useState<number | null>(null)

  const fetchTutoresBloqueados = useCallback(async () => {
    const res = await fetch('/api/admin/tutores-bloqueados')
    if (res.ok) setTutoresBloq(await res.json())
  }, [])

  async function liberarTutor(id: number) {
    setLiberando(id)
    await fetch(`/api/admin/tutores-bloqueados/${id}`, { method: 'PATCH' })
    await fetchTutoresBloqueados()
    setLiberando(null)
  }

  const fetchConfig = useCallback(async () => {
    // Busca a versão completa (admin) via PUT endpoint ou diretamente do DB via GET
    const res = await fetch('/api/agente/configuracoes')
    if (res.status === 401 || res.status === 403) { router.push('/login'); return }
    if (res.ok) {
      const d = await res.json()
      // GET público retorna só números; precisamos da versão completa com descrições
      // Buscamos via rota admin
      const resAdmin = await fetch('/api/admin/configuracoes-agente')
      if (resAdmin.ok) {
        const full = await resAdmin.json()
        setConfig({
          tempo_retorno_ia_horas: full.tempo_retorno_ia_horas ?? 2,
          numeros_bloqueados:     full.numeros_bloqueados ?? [],
        })
      } else {
        // Fallback: usa o GET público sem descrições
        setConfig({
          tempo_retorno_ia_horas: d.tempo_retorno_ia_horas ?? 2,
          numeros_bloqueados:     (d.numeros_bloqueados ?? []).map((n: string) => ({ numero: n, descricao: '' })),
        })
      }
    }
    setLoading(false)
  }, [router])

  useEffect(() => { fetchConfig(); fetchTutoresBloqueados() }, [fetchConfig, fetchTutoresBloqueados])

  async function salvar() {
    setSaving(true)
    setSaveError('')
    const res = await fetch('/api/agente/configuracoes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
    if (res.status === 401 || res.status === 403) { router.push('/login'); return }
    if (res.ok) {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } else {
      const d = await res.json().catch(() => ({}))
      setSaveError(d.error ?? `Erro ${res.status} ao salvar`)
    }
    setSaving(false)
  }

  function adicionarNumero() {
    const norm = normalizeNumero(novoNum.trim())
    if (!norm || norm.length < 10) return
    if (config.numeros_bloqueados.some(n => n.numero === norm)) return
    setConfig(c => ({
      ...c,
      numeros_bloqueados: [...c.numeros_bloqueados, { numero: norm, descricao: novoDesc.trim() }],
    }))
    setNovoNum('')
    setNovoDesc('')
  }

  function removerNumero(numero: string) {
    setConfig(c => ({
      ...c,
      numeros_bloqueados: c.numeros_bloqueados.filter(n => n.numero !== numero),
    }))
  }

  return (
    <div className="min-h-screen bg-gray-50">


      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#19202d]">Configurações do Agente WhatsApp</h1>
          <p className="text-sm text-gray-500 mt-1">Apenas administradores podem alterar estas configurações.</p>
        </div>

        {loading ? (
          <p className="text-gray-400 text-center py-12">Carregando...</p>
        ) : (
          <div className="space-y-6">
            {/* Tempo de retorno da IA */}
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="h-1 bg-gold-stripe" />
              <div className="p-6">
                <h2 className="font-bold text-[#19202d] mb-1">Tempo de retorno da IA</h2>
                <p className="text-sm text-gray-500 mb-4">
                  Após um atendimento humano, quanto tempo (em horas) a IA fica bloqueada antes de responder novamente.
                </p>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={0}
                    max={168}
                    value={config.tempo_retorno_ia_horas}
                    onChange={e => setConfig(c => ({ ...c, tempo_retorno_ia_horas: Number(e.target.value) }))}
                    className="w-24 border rounded-lg px-3 py-2 text-center font-bold text-lg focus:outline-none focus:ring-2 focus:ring-[#c4a35a]"
                  />
                  <span className="text-gray-500 text-sm">horas</span>
                </div>
              </div>
            </div>

            {/* Números bloqueados */}
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="h-1 bg-gold-stripe" />
              <div className="p-6">
                <h2 className="font-bold text-[#19202d] mb-1">Números bloqueados</h2>
                <p className="text-sm text-gray-500 mb-4">
                  O agente não responderá mensagens desses números.
                </p>

                {/* Lista de bloqueados */}
                {config.numeros_bloqueados.length === 0 ? (
                  <p className="text-sm text-gray-400 mb-4">Nenhum número bloqueado.</p>
                ) : (
                  <div className="space-y-2 mb-4">
                    {config.numeros_bloqueados.map(n => (
                      <div key={n.numero} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 gap-2">
                        <div>
                          <span className="font-mono text-sm text-[#19202d]">{n.numero}</span>
                          {n.descricao && (
                            <span className="ml-2 text-xs text-gray-400">— {n.descricao}</span>
                          )}
                        </div>
                        <button
                          onClick={() => removerNumero(n.numero)}
                          className="text-red-400 hover:text-red-600 text-sm font-bold transition"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Adicionar número */}
                <div className="flex gap-2 flex-wrap">
                  <input
                    type="text"
                    placeholder="5524999999999"
                    value={novoNum}
                    onChange={e => setNovoNum(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && adicionarNumero()}
                    className="flex-1 min-w-40 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c4a35a]"
                  />
                  <input
                    type="text"
                    placeholder="Descrição (ex: Andreza)"
                    value={novoDesc}
                    onChange={e => setNovoDesc(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && adicionarNumero()}
                    className="flex-1 min-w-40 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c4a35a]"
                  />
                  <button
                    onClick={adicionarNumero}
                    className="bg-[#19202d] hover:bg-[#2a3447] text-white font-semibold px-4 py-2 rounded-lg text-sm transition"
                  >
                    + Adicionar
                  </button>
                </div>
              </div>
            </div>

            {/* Tutores com IA bloqueada automaticamente */}
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="h-1 bg-gold-stripe" />
              <div className="p-6">
                <h2 className="font-bold text-[#19202d] mb-1">IA bloqueada automaticamente</h2>
                <p className="text-sm text-gray-500 mb-4">
                  Tutores em que o bot parou de responder após solicitação de atendimento humano.
                </p>
                {tutoresBloq.length === 0 ? (
                  <p className="text-sm text-gray-400">Nenhum tutor com IA bloqueada.</p>
                ) : (
                  <div className="space-y-2">
                    {tutoresBloq.map(t => (
                      <div key={t.id} className="flex items-center justify-between bg-orange-50 border border-orange-100 rounded-lg px-4 py-3 gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-sm text-[#19202d]">{formatTelefone(t.telefone)}</p>
                          {t.nome && !t.nome.includes('?') && (
                            <p className="text-xs text-gray-400 mt-0.5">{t.nome}</p>
                          )}
                          {t.atendimento_humano_ate && (
                            <p className="text-xs text-orange-500 mt-0.5">
                              Bloqueado desde {new Date(t.atendimento_humano_ate).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => liberarTutor(t.id)}
                          disabled={liberando === t.id}
                          className="shrink-0 text-xs font-semibold bg-green-100 hover:bg-green-200 text-green-700 px-3 py-1.5 rounded-lg transition disabled:opacity-50 whitespace-nowrap"
                        >
                          {liberando === t.id ? 'Liberando...' : '✓ Liberar IA'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Salvar */}
            <button
              onClick={salvar}
              disabled={saving}
              className="w-full bg-[#c4a35a] hover:bg-[#a88a47] text-white font-bold py-3 rounded-xl text-sm transition disabled:opacity-50"
            >
              {saving ? 'Salvando...' : saved ? '✓ Salvo!' : 'Salvar configurações'}
            </button>
            {saveError && (
              <p className="text-center text-sm text-red-600 font-medium">{saveError}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
