'use client'

import { useState, useEffect, useCallback } from 'react'

interface VetDash {
  vet_id:   number
  vet_nome: string
  total:    number
  pendente: number
  pago:     number
}

interface Extracao {
  id:                number
  data_hora:         string
  tipo_exame:        string
  valor:             number | null
  status:            string
  vet_extracao_id:   number | null
  comissao_extracao: number | null
  comissao_paga:     boolean
  comissao_paga_em:  string | null
  pets:              { nome: string; especie: string | null } | null
  tutores:           { nome: string | null; telefone: string } | null
  vet_responsavel:   { nome: string } | null
  vet_extracao:      { id: number; nome: string } | null
}

interface DashData {
  por_vet:        VetDash[]
  total_pendente: number
  total_pago:     number
}

interface Vet { id: number; nome: string }

type Tab = 'sem_vet' | 'pendente' | 'pago'

function brl(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function mesLabel(mes: string) {
  const [y, m] = mes.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

const DIAS = ['dom','seg','ter','qua','qui','sex','sáb']

function fmtDH(iso: string) {
  const [d = '', t = ''] = iso.split('T')
  const [y, mo, dy] = d.split('-').map(Number)
  const hm = (t.substring(0, 5) || '00:00')
  const [h, min] = hm.split(':').map(Number)
  const date = new Date(y, mo - 1, dy)
  return `${DIAS[date.getDay()]} ${String(dy).padStart(2,'0')}/${String(mo).padStart(2,'0')} ${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`
}

export default function ExtracoesPage() {
  const today = new Date()
  const [mes, setMes] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`)
  const [tab, setTab] = useState<Tab>('sem_vet')
  const [dash, setDash] = useState<DashData | null>(null)
  const [extracoes, setExtracoes] = useState<Extracao[]>([])
  const [vets, setVets] = useState<Vet[]>([])
  const [loading, setLoading] = useState(true)
  const [vetsCarregados, setVetsCarregados] = useState(false)

  const [vetSel, setVetSel]           = useState<Record<number, string>>({})
  const [salvando, setSalvando]       = useState<Record<number, boolean>>({})
  const [marcando, setMarcando]       = useState<Record<string, boolean>>({})
  const [apiErro,  setApiErro]        = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setApiErro('')
    const res = await fetch(`/api/admin/extracoes?mes=${mes}&tab=${tab}`)
    if (res.ok) {
      const d = await res.json()
      setDash(d.dashboard)
      setExtracoes(d.extracoes)
    } else {
      const d = await res.json().catch(() => ({}))
      setApiErro(d.error ?? `Erro ${res.status} ao carregar extrações.`)
    }
    setLoading(false)
  }, [mes, tab])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (vetsCarregados) return
    fetch('/api/veterinarios').then(r => r.ok ? r.json() : []).then(d => { setVets(d); setVetsCarregados(true) })
  }, [vetsCarregados])

  function prevMes() {
    const [y, m] = mes.split('-').map(Number)
    const d = new Date(y, m - 2, 1)
    setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  function nextMes() {
    const [y, m] = mes.split('-').map(Number)
    const d = new Date(y, m, 1)
    setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  async function salvarVet(id: number) {
    const vetId = vetSel[id]
    if (!vetId) return
    setSalvando(p => ({ ...p, [id]: true }))
    await fetch(`/api/admin/extracoes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vet_extracao_id: Number(vetId) }),
    })
    setSalvando(p => ({ ...p, [id]: false }))
    setVetSel(p => { const n = { ...p }; delete n[id]; return n })
    load()
  }

  async function marcarPago(id: number) {
    const key = String(id)
    setMarcando(p => ({ ...p, [key]: true }))
    await fetch(`/api/admin/extracoes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comissao_paga: true }),
    })
    setMarcando(p => ({ ...p, [key]: false }))
    load()
  }

  async function marcarPagoVet(vetId: number) {
    const key = `vet_${vetId}`
    setMarcando(p => ({ ...p, [key]: true }))
    await fetch('/api/admin/extracoes/marcar-pago', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vet_id: vetId, mes }),
    })
    setMarcando(p => ({ ...p, [key]: false }))
    load()
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'sem_vet',  label: 'Aguardando vet' },
    { key: 'pendente', label: 'Pendente pagamento' },
    { key: 'pago',     label: 'Pagos' },
  ]

  const emptyMsg = {
    sem_vet:  'Nenhum exame aguardando atribuição de vet.',
    pendente: 'Nenhuma comissão pendente de pagamento.',
    pago:     'Nenhuma comissão paga neste período.',
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#19202d]">Extrações · Hemogasometria</h1>
          <p className="text-sm text-gray-500 mt-0.5">Comissões dos veterinários por coleta de sangue</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button onClick={prevMes}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500 transition text-lg">
            ‹
          </button>
          <span className="text-sm font-semibold text-[#19202d] w-36 text-center capitalize">
            {mesLabel(mes)}
          </span>
          <button onClick={nextMes}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500 transition text-lg">
            ›
          </button>
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">A Pagar</p>
          <p className="text-3xl font-bold text-[#19202d]">{dash ? brl(dash.total_pendente) : '—'}</p>
          <p className="text-xs text-gray-400 mt-1.5 capitalize">comissões pendentes em {mesLabel(mes)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">Pago</p>
          <p className="text-3xl font-bold text-green-600">{dash ? brl(dash.total_pago) : '—'}</p>
          <p className="text-xs text-gray-400 mt-1.5 capitalize">comissões pagas em {mesLabel(mes)}</p>
        </div>
      </div>

      {/* Por veterinário */}
      {dash && dash.por_vet.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-xs font-bold text-[#19202d] uppercase tracking-widest">Por Veterinário</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-5 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">Veterinário</th>
                  <th className="text-center px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">Extrações</th>
                  <th className="text-right px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">A Pagar</th>
                  <th className="text-right px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">Pago</th>
                  <th className="px-4 py-3 w-40" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {dash.por_vet.map(v => (
                  <tr key={v.vet_id} className="hover:bg-gray-50/60 transition">
                    <td className="px-5 py-3.5 font-semibold text-[#19202d]">{v.vet_nome}</td>
                    <td className="px-4 py-3.5 text-center text-gray-600">{v.total}</td>
                    <td className="px-4 py-3.5 text-right font-bold text-[#19202d]">{brl(v.pendente)}</td>
                    <td className="px-4 py-3.5 text-right text-green-600 font-semibold">{brl(v.pago)}</td>
                    <td className="px-4 py-3.5 text-right">
                      {v.pendente > 0 && (
                        <button
                          onClick={() => marcarPagoVet(v.vet_id)}
                          disabled={!!marcando[`vet_${v.vet_id}`]}
                          className="text-xs px-3 py-1.5 bg-green-50 border border-green-200 text-green-700 rounded-lg hover:bg-green-100 transition disabled:opacity-50 font-semibold whitespace-nowrap"
                        >
                          {marcando[`vet_${v.vet_id}`] ? '...' : `Pagar ${brl(v.pendente)}`}
                        </button>
                      )}
                      {v.pendente === 0 && v.pago > 0 && (
                        <span className="text-xs text-green-600 font-semibold">✓ Quitado</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Lista de extrações */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-gray-200 overflow-x-auto">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={[
                'px-5 py-3.5 text-sm font-semibold whitespace-nowrap border-b-2 transition shrink-0',
                tab === t.key
                  ? 'border-[#c4a35a] text-[#19202d]'
                  : 'border-transparent text-gray-400 hover:text-gray-600',
              ].join(' ')}>
              {t.label}
            </button>
          ))}
        </div>

        {apiErro ? (
          <div className="py-16 text-center px-6 space-y-2">
            <p className="text-2xl">⚠️</p>
            <p className="text-sm font-semibold text-red-600">{apiErro}</p>
            {apiErro.includes('column') && (
              <p className="text-xs text-gray-400 max-w-sm mx-auto">
                Parece que a migration_v19.sql ainda não foi rodada no Supabase. Execute-a para criar as colunas necessárias.
              </p>
            )}
          </div>
        ) : loading ? (
          <div className="py-20 text-center text-gray-400 text-sm">Carregando...</div>
        ) : extracoes.length === 0 ? (
          <div className="py-20 text-center space-y-2">
            <p className="text-3xl">🩸</p>
            <p className="text-sm text-gray-400">{emptyMsg[tab]}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {extracoes.map(ex => (
              <div key={ex.id} className="px-5 py-4 hover:bg-gray-50/40 transition">
                <div className="flex items-center gap-4 flex-wrap sm:flex-nowrap">

                  {/* Info principal */}
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono text-gray-400">{fmtDH(ex.data_hora)}</span>
                      {ex.comissao_paga && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-bold">PAGO</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-[#19202d]">
                        🐾 {ex.pets?.nome ?? '—'}
                        {ex.pets?.especie && <span className="text-xs font-normal text-gray-400 ml-1">({ex.pets.especie})</span>}
                      </span>
                      <span className="text-xs text-gray-400 hidden sm:inline">·</span>
                      <span className="text-xs text-gray-500">{ex.tutores?.nome ?? ex.tutores?.telefone ?? '—'}</span>
                    </div>
                    {ex.vet_responsavel && (
                      <p className="text-xs text-gray-400">Vet responsável: {ex.vet_responsavel.nome}</p>
                    )}
                    {ex.comissao_extracao != null && (
                      <p className="text-xs font-semibold text-[#8a6e36]">
                        Comissão: {brl(ex.comissao_extracao)}
                        {ex.comissao_paga_em && (
                          <span className="text-gray-400 font-normal ml-2">
                            · pago em {new Date(ex.comissao_paga_em).toLocaleDateString('pt-BR')}
                          </span>
                        )}
                      </p>
                    )}
                  </div>

                  {/* Ações */}
                  <div className="shrink-0 flex items-center gap-2">
                    {!ex.vet_extracao_id ? (
                      <>
                        <select
                          value={vetSel[ex.id] ?? ''}
                          onChange={e => setVetSel(p => ({ ...p, [ex.id]: e.target.value }))}
                          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#8a6e36] bg-white"
                        >
                          <option value="">— Vet que extraiu</option>
                          {vets.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
                        </select>
                        <button
                          onClick={() => salvarVet(ex.id)}
                          disabled={!vetSel[ex.id] || !!salvando[ex.id]}
                          className="text-sm px-4 py-1.5 bg-[#19202d] text-white rounded-lg hover:bg-[#232d3f] disabled:opacity-40 transition font-semibold"
                        >
                          {salvando[ex.id] ? '...' : 'Salvar'}
                        </button>
                      </>
                    ) : !ex.comissao_paga ? (
                      <>
                        <span className="text-sm font-semibold text-[#19202d]">
                          🩺 {ex.vet_extracao?.nome ?? '—'}
                        </span>
                        <button
                          onClick={() => marcarPago(ex.id)}
                          disabled={!!marcando[String(ex.id)]}
                          className="text-xs px-3 py-1.5 bg-green-50 border border-green-200 text-green-700 rounded-lg hover:bg-green-100 transition disabled:opacity-50 font-semibold"
                        >
                          {marcando[String(ex.id)] ? '...' : 'Marcar pago'}
                        </button>
                      </>
                    ) : (
                      <span className="text-sm font-semibold text-[#19202d]">
                        🩺 {ex.vet_extracao?.nome ?? '—'}
                      </span>
                    )}
                  </div>

                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
