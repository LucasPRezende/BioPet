'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'


interface Stats {
  total: number
  receita: number
  custo: number
  comissao: number
  lucro: number
  porTipo: {
    tipo_exame: string
    quantidade: number
    receita: number
    custo: number
    comissao: number
    lucro: number
    percentual: number
  }[]
  porDia: { data: string; quantidade: number }[]
  porVet: { nome: string; recebe_comissao: boolean; quantidade: number; receita: number; comissao: number; lucro: number }[]
}

type Periodo = 'hoje' | 'semana' | 'mes' | 'personalizado'

function formatBRL(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(d: string) {
  const [, m, day] = d.split('-')
  return `${day}/${m}`
}

function getRange(periodo: Periodo, inicio: string, fim: string) {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  if (periodo === 'hoje') { const t = toISO(now); return { inicio: t, fim: t } }
  if (periodo === 'semana') { const dom = new Date(now); dom.setDate(now.getDate() - now.getDay()); return { inicio: toISO(dom), fim: toISO(now) } }
  if (periodo === 'mes') { return { inicio: toISO(new Date(now.getFullYear(), now.getMonth(), 1)), fim: toISO(now) } }
  return { inicio, fim }
}

function BarChart({ data }: { data: { data: string; quantidade: number }[] }) {
  if (data.length === 0) return (
    <div className="flex items-center justify-center h-32 text-gray-300 text-sm">Sem dados no período</div>
  )
  const max  = Math.max(...data.map(d => d.quantidade), 1)
  const barW = Math.max(8, Math.min(40, Math.floor(560 / data.length) - 4))
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${Math.max(600, data.length * (barW + 4))} 110`} className="w-full" style={{ minHeight: 110 }}>
        {data.map((d, i) => {
          const barH = Math.max(4, Math.round((d.quantidade / max) * 80))
          const x = i * (barW + 4)
          return (
            <g key={d.data}>
              <rect x={x} y={90 - barH} width={barW} height={barH} rx={3} fill="#c4a35a" opacity={0.85} />
              <text x={x + barW / 2} y={88 - barH} textAnchor="middle" fontSize={9} fill="#8a6e36" fontWeight="600">
                {d.quantidade > 0 ? d.quantidade : ''}
              </text>
              <text x={x + barW / 2} y={104} textAnchor="middle" fontSize={8} fill="#9ca3af">
                {formatDate(d.data)}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function Card({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
      <div className="h-1 bg-gold-stripe" />
      <div className="p-5">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
        <p className={`text-2xl font-bold ${color ?? 'text-[#19202d]'}`}>{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const [stats, setStats]               = useState<Stats | null>(null)
  const [loading, setLoading]           = useState(true)
  const [periodo, setPeriodo]           = useState<Periodo>('mes')
  const [inicioCustom, setInicioCustom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toLocaleDateString('en-CA')
  })
  const [fimCustom, setFimCustom] = useState(() => new Date().toLocaleDateString('en-CA'))
  const router = useRouter()

  const fetchStats = useCallback(async () => {
    setLoading(true)
    const { inicio, fim } = getRange(periodo, inicioCustom, fimCustom)
    const res = await fetch(`/api/laudos/stats?inicio=${inicio}&fim=${fim}`)
    if (res.status === 401 || res.status === 403) { router.push('/login'); return }
    if (res.ok) setStats(await res.json())
    setLoading(false)
  }, [periodo, inicioCustom, fimCustom, router])

  useEffect(() => { fetchStats() }, [fetchStats])

  const { inicio, fim } = getRange(periodo, inicioCustom, fimCustom)
  const fmtRange = inicio === fim
    ? inicio.split('-').reverse().join('/')
    : `${inicio.split('-').reverse().join('/')} — ${fim.split('-').reverse().join('/')}`

  return (
    <div className="min-h-screen bg-gray-50">


      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">

        {/* Filtros */}
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="h-1 bg-gold-stripe" />
          <div className="p-4 flex flex-wrap items-center gap-3">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Período:</span>
            {(['hoje', 'semana', 'mes', 'personalizado'] as Periodo[]).map(p => (
              <button key={p} onClick={() => setPeriodo(p)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${periodo === p ? 'bg-[#19202d] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                {p === 'hoje' ? 'Hoje' : p === 'semana' ? 'Esta semana' : p === 'mes' ? 'Este mês' : 'Personalizado'}
              </button>
            ))}
            {periodo === 'personalizado' && (
              <div className="flex items-center gap-2 ml-2">
                <input type="date" value={inicioCustom} onChange={e => setInicioCustom(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36]" />
                <span className="text-gray-400 text-sm">até</span>
                <input type="date" value={fimCustom} onChange={e => setFimCustom(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36]" />
              </div>
            )}
            <span className="text-xs text-gray-400 ml-auto">{fmtRange}</span>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400">Carregando estatísticas...</div>
        ) : stats ? (
          <>
            {/* Cards financeiros */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <Card label="Total de Laudos"  value={String(stats.total)} />
              <Card label="Receita Bruta"    value={formatBRL(stats.receita)}  color="text-blue-700" />
              <Card label="Custo"            value={formatBRL(stats.custo)}    color="text-red-500" />
              <Card label="Comissões"        value={formatBRL(stats.comissao)} color="text-amber-600" sub="a pagar aos vets" />
              <Card
                label="Lucro BioPet"
                value={formatBRL(stats.lucro)}
                color={stats.lucro >= 0 ? 'text-green-600' : 'text-red-500'}
                sub="receita − custo − comissão"
              />
            </div>

            {/* Gráfico de laudos por dia */}
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="h-1 bg-gold-stripe" />
              <div className="p-6">
                <h3 className="text-sm font-bold text-[#19202d] uppercase tracking-wide mb-4">Laudos por Dia</h3>
                <BarChart data={stats.porDia} />
              </div>
            </div>

            {/* Tabela por tipo de exame */}
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="h-1 bg-gold-stripe" />
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-[#19202d] uppercase tracking-wide">Por Tipo de Exame</h3>
                  <Link href="/admin/comissoes" className="text-xs text-[#8a6e36] hover:underline">Editar preços →</Link>
                </div>
                {stats.porTipo.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-4">Nenhum laudo com tipo de exame no período.</p>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        {['Tipo', 'Qtd', '%', 'Receita', 'Custo', 'Comissão', 'Lucro'].map(h => (
                          <th key={h} className="text-left py-2 px-3 text-xs font-bold text-gray-400 uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {stats.porTipo.map(row => (
                        <tr key={row.tipo_exame} className="hover:bg-amber-50/20 transition">
                          <td className="py-3 px-3 font-medium text-[#19202d] text-sm">{row.tipo_exame}</td>
                          <td className="py-3 px-3 text-gray-600 text-sm">{row.quantidade}</td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1.5">
                              <div className="w-12 bg-gray-100 rounded-full h-1.5">
                                <div className="bg-[#c4a35a] h-1.5 rounded-full" style={{ width: `${row.percentual}%` }} />
                              </div>
                              <span className="text-xs text-gray-500">{row.percentual}%</span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-blue-700 text-sm font-medium">{formatBRL(row.receita)}</td>
                          <td className="py-3 px-3 text-red-500 text-sm">{formatBRL(row.custo)}</td>
                          <td className="py-3 px-3 text-amber-600 text-sm">{formatBRL(row.comissao)}</td>
                          <td className={`py-3 px-3 text-sm font-semibold ${row.lucro >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {formatBRL(row.lucro)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Desempenho por usuário */}
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="h-1 bg-gold-stripe" />
              <div className="p-6">
                <h3 className="text-sm font-bold text-[#19202d] uppercase tracking-wide mb-4">Desempenho por Usuário</h3>
                {stats.porVet.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-4">Nenhum laudo vinculado a usuários no período.</p>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        {['Usuário', 'Laudos', 'Receita', 'Comissão a Pagar', 'Lucro Gerado'].map(h => (
                          <th key={h} className="text-left py-2 px-3 text-xs font-bold text-gray-400 uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {stats.porVet.map(row => (
                        <tr key={row.nome} className="hover:bg-amber-50/20 transition">
                          <td className="py-3 px-3 font-semibold text-[#19202d]">{row.nome}</td>
                          <td className="py-3 px-3 text-gray-600">{row.quantidade}</td>
                          <td className="py-3 px-3 text-blue-700 font-medium">{formatBRL(row.receita)}</td>
                          <td className="py-3 px-3">
                            {row.recebe_comissao ? (
                              <span className="bg-amber-50 text-[#8a6e36] border border-[#8a6e36]/20 px-2 py-1 rounded text-sm font-semibold">
                                {formatBRL(row.comissao)}
                              </span>
                            ) : (
                              <span className="bg-gray-100 text-gray-400 px-2 py-1 rounded text-xs">Salário fixo</span>
                            )}
                          </td>
                          <td className={`py-3 px-3 font-semibold ${row.lucro >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {formatBRL(row.lucro)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-16 text-gray-400">Erro ao carregar estatísticas.</div>
        )}
      </main>
    </div>
  )
}
