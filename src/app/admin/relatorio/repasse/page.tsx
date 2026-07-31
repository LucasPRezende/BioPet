'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

interface AgClinica {
  id:                    number
  tipo_exame:            string
  data_hora:             string
  valor:                 number | null
  status_pagamento:      string
  pet_nome:              string
  tutor_nome:            string
  pagamento_responsavel: string | null
  repasse_confirmado:    boolean
  repasse_em:            string | null
}

interface ClinicaRow {
  clinica_id:       number
  clinica_nome:     string
  total:            number
  total_valor:      number
  a_receber:        number
  recebido:         number
  repasse_pendente: number
  pendente_mp:      number
  agendamentos:     AgClinica[]
}

function formatBRL(n: number | null | undefined) {
  return Number(n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(dt: string) {
  return new Date(dt).toLocaleDateString('pt-BR')
}

function examesRepasse(c: ClinicaRow) {
  return c.agendamentos.filter(ag => ag.pagamento_responsavel === 'clinica')
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function isFullMonth(inicio: string, fim: string) {
  const i = new Date(`${inicio}T12:00:00`)
  const f = new Date(`${fim}T12:00:00`)
  if (i.getFullYear() !== f.getFullYear() || i.getMonth() !== f.getMonth()) return false
  if (i.getDate() !== 1) return false
  const lastDay = new Date(i.getFullYear(), i.getMonth() + 1, 0).getDate()
  return f.getDate() === lastDay
}

function RelatorioRepasseContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const hoje = new Date()
  const inicioDefault = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toLocaleDateString('en-CA')
  const fimDefault = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toLocaleDateString('en-CA')

  const inicio = searchParams.get('inicio') ?? inicioDefault
  const fim = searchParams.get('fim') ?? fimDefault

  const [clinicas, setClinicas] = useState<ClinicaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selecionada, setSelecionada] = useState<string>(searchParams.get('clinica') ?? 'todas')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/admin/relatorio/clinicas?inicio=${inicio}&fim=${fim}`)
      .then(r => (r.status === 401 || r.status === 403) ? (router.push('/login'), null) : r.json())
      .then(d => setClinicas(d?.clinicas ?? []))
      .finally(() => setLoading(false))
  }, [inicio, fim, router])

  const periodoLabel = isFullMonth(inicio, fim)
    ? capitalize(new Date(`${inicio}T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }))
    : inicio === fim
      ? new Date(`${inicio}T12:00:00`).toLocaleDateString('pt-BR')
      : `${new Date(`${inicio}T12:00:00`).toLocaleDateString('pt-BR')} — ${new Date(`${fim}T12:00:00`).toLocaleDateString('pt-BR')}`

  const clinicasFiltradas = (selecionada === 'todas'
    ? clinicas
    : clinicas.filter(c => String(c.clinica_id) === selecionada)
  ).filter(c => examesRepasse(c).length > 0)

  const totalExames = clinicasFiltradas.reduce((s, c) => s + examesRepasse(c).length, 0)
  const valorTotal  = clinicasFiltradas.reduce((s, c) => s + examesRepasse(c).reduce((ss, ag) => ss + (ag.valor ?? 0), 0), 0)
  const jaRepassado = clinicasFiltradas.reduce((s, c) => s + examesRepasse(c).filter(ag => ag.repasse_confirmado).reduce((ss, ag) => ss + (ag.valor ?? 0), 0), 0)
  const pendente    = clinicasFiltradas.reduce((s, c) => s + examesRepasse(c).filter(ag => !ag.repasse_confirmado).reduce((ss, ag) => ss + (ag.valor ?? 0), 0), 0)

  const geradoEm = new Date().toLocaleString('pt-BR')
  const clinicaSelecionadaNome = selecionada !== 'todas'
    ? clinicas.find(c => String(c.clinica_id) === selecionada)?.clinica_nome
    : undefined

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4 print:bg-white print:p-0">
      <style>{'@media print { @page { margin: 10mm; size: A4; } }'}</style>
      <div className="max-w-3xl mx-auto space-y-4 print:max-w-none print:space-y-0">

        {/* Controles — ocultos na impressão */}
        <div className="flex items-center justify-between gap-3 flex-wrap print:hidden">
          <button
            onClick={() => router.push('/admin/dashboard')}
            className="px-4 py-2 bg-white border rounded-lg text-sm font-semibold text-[#19202d] hover:bg-gray-50 transition"
          >
            ← Voltar ao Dashboard
          </button>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={selecionada}
              onChange={e => setSelecionada(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm bg-white text-[#19202d]"
            >
              <option value="todas">Todas as clínicas</option>
              {clinicas.map(c => (
                <option key={c.clinica_id} value={String(c.clinica_id)}>{c.clinica_nome}</option>
              ))}
            </select>
            <button
              onClick={() => window.print()}
              className="px-4 py-2 bg-[#19202d] text-white rounded-lg text-sm font-semibold hover:bg-[#232d3f] transition"
            >
              🖨️ Imprimir / Salvar PDF
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400 print:hidden">Carregando...</div>
        ) : (
          <div className="bg-white rounded-2xl shadow-2xl print:shadow-none print:rounded-none overflow-hidden">
            <div className="h-1.5 bg-gold-stripe" />
            <div className="p-8">

              {/* Cabeçalho */}
              <div className="flex items-start justify-between border-b-2 border-[#19202d] pb-4 mb-6 flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <img src="/logo.png" alt="BioPet" className="w-10 h-10 object-contain" />
                  <div>
                    <p className="font-extrabold text-[#19202d] text-lg leading-tight">BioPet Medicina Veterinária</p>
                    <p className="text-gray-500 text-sm">
                      Relatório de repasse — clínicas parceiras{clinicaSelecionadaNome ? ` · ${clinicaSelecionadaNome}` : ''}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Período de referência</p>
                  <p className="font-bold text-[#19202d]">{periodoLabel}</p>
                </div>
              </div>

              {/* Cards de totais */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                <div className="bg-gray-50 border rounded-lg p-3">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Total de exames</p>
                  <p className="text-xl font-bold text-[#19202d]">{totalExames}</p>
                </div>
                <div className="bg-gray-50 border rounded-lg p-3">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Valor total</p>
                  <p className="text-xl font-bold text-[#19202d]">{formatBRL(valorTotal)}</p>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-[10px] font-bold text-green-600 uppercase tracking-wide mb-1">Já repassado</p>
                  <p className="text-xl font-bold text-green-700">{formatBRL(jaRepassado)}</p>
                </div>
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                  <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wide mb-1">Pendente</p>
                  <p className="text-xl font-bold text-indigo-700">{formatBRL(pendente)}</p>
                </div>
              </div>

              {/* Seções por clínica */}
              {clinicasFiltradas.length === 0 && (
                <p className="text-center text-gray-400 py-10">Nenhum exame de repasse no período selecionado.</p>
              )}
              <div className="space-y-5">
                {clinicasFiltradas.map(c => {
                  const exames = examesRepasse(c).slice().sort((a, b) => new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime())
                  const repassadoC = exames.filter(ag => ag.repasse_confirmado).reduce((s, ag) => s + (ag.valor ?? 0), 0)
                  const pendenteC  = exames.filter(ag => !ag.repasse_confirmado).reduce((s, ag) => s + (ag.valor ?? 0), 0)
                  return (
                    <div key={c.clinica_id} className="break-inside-avoid">
                      <div className="bg-[#19202d] text-white px-4 py-2.5 rounded-t-lg flex items-center justify-between flex-wrap gap-1">
                        <p className="font-bold text-sm">{c.clinica_nome}</p>
                        <p className="text-xs text-gray-300">
                          {exames.length} exame{exames.length !== 1 ? 's' : ''} · repassado {formatBRL(repassadoC)} · pendente {formatBRL(pendenteC)}
                        </p>
                      </div>
                      <table className="w-full text-sm border border-t-0 rounded-b-lg overflow-hidden">
                        <thead>
                          <tr className="border-b bg-gray-50 text-xs text-gray-400 uppercase">
                            <th className="text-left py-2 px-3 font-bold">Data</th>
                            <th className="text-left py-2 px-3 font-bold">Pet</th>
                            <th className="text-left py-2 px-3 font-bold">Tutor</th>
                            <th className="text-left py-2 px-3 font-bold">Exame</th>
                            <th className="text-right py-2 px-3 font-bold">Valor</th>
                            <th className="text-right py-2 px-3 font-bold">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {exames.map(ag => (
                            <tr key={ag.id}>
                              <td className="py-2 px-3 text-gray-500">{formatDate(ag.data_hora)}</td>
                              <td className="py-2 px-3 font-semibold text-[#19202d]">{ag.pet_nome}</td>
                              <td className="py-2 px-3 text-gray-600">{ag.tutor_nome}</td>
                              <td className="py-2 px-3 text-gray-600">{ag.tipo_exame}</td>
                              <td className="py-2 px-3 text-right text-gray-700">{formatBRL(ag.valor ?? 0)}</td>
                              <td className="py-2 px-3 text-right">
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ag.repasse_confirmado ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-indigo-50 text-indigo-700 border border-indigo-200'}`}>
                                  {ag.repasse_confirmado ? 'Repassado' : 'Pendente'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                })}
              </div>

              <p className="text-xs text-gray-400 mt-8 pt-4 border-t">
                Relatório gerado em {geradoEm} · BioPet Medicina Veterinária
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function RelatorioRepassePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <RelatorioRepasseContent />
    </Suspense>
  )
}
