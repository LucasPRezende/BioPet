'use client'

import { useState, useEffect, useMemo, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

interface PedidoItem {
  id:             number
  laboratorio_id: number
  nome:           string
  preco_snapshot: number | null
  lab_laboratorios: { nome: string } | null
}

interface Pedido {
  id:               number
  origem:           string
  status:           string
  status_pagamento: string
  valor_total:      number | null
  criado_em:        string
  tutores:          { nome: string | null } | null
  pets:             { nome: string } | null
  clinicas:         { nome: string } | null
  pedido_lab_item:  PedidoItem[]
}

const STATUS_LABEL: Record<string, string> = {
  rascunho:        'Rascunho',
  confirmado:      'Confirmado',
  coleta_agendada: 'Coleta agendada',
  coletado:        'Coletado',
  enviado:         'Enviado',
  concluido:       'Concluído',
  cancelado:       'Cancelado',
}

const STATUS_COR: Record<string, string> = {
  rascunho:        'bg-gray-100 text-gray-500',
  confirmado:      'bg-blue-50 text-blue-700',
  coleta_agendada: 'bg-amber-50 text-amber-700',
  coletado:        'bg-purple-50 text-purple-700',
  enviado:         'bg-indigo-50 text-indigo-700',
  concluido:       'bg-green-50 text-green-700',
  cancelado:       'bg-red-50 text-red-600',
}

const PAGAMENTO_LABEL: Record<string, string> = {
  pendente:     'Pendente',
  a_receber:    'A receber',
  pago:         'Pago',
  pago_clinica: 'Pago (clínica)',
}

function fmtBRL(n: number | null) {
  if (n === null) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtData(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function PedidosLabPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-gray-400">Carregando...</div>}>
      <PedidosLabConteudo />
    </Suspense>
  )
}

function PedidosLabConteudo() {
  const searchParams = useSearchParams()
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)
  const [erro,    setErro]    = useState('')
  const [statusFiltro, setStatusFiltro] = useState('')
  const [freteConectado, setFreteConectado] = useState<boolean | null>(null)

  useEffect(() => {
    setLoading(true)
    const url = statusFiltro ? `/api/labs/pedidos?status=${statusFiltro}` : '/api/labs/pedidos'
    fetch(url)
      .then(r => r.json())
      .then(d => { if (d.error) setErro(d.error); else setPedidos(d) })
      .catch(() => setErro('Erro ao carregar pedidos.'))
      .finally(() => setLoading(false))
  }, [statusFiltro])

  useEffect(() => {
    fetch('/api/labs/frete/status')
      .then(r => r.ok ? r.json() : { conectado: false })
      .then(d => setFreteConectado(!!d.conectado))
      .catch(() => setFreteConectado(false))
  }, [])

  const acabouDeConectar = searchParams.get('frete') === 'conectado'

  const labsDoPedido = useMemo(() => (p: Pedido) => {
    const set = new Set(p.pedido_lab_item.map(i => i.lab_laboratorios?.nome ?? '?'))
    return Array.from(set).join(', ')
  }, [])

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#19202d]">Pedidos — Labs Parceiros</h1>
          <p className="text-sm text-gray-400">Encaminhamentos para Tecsa/Hormonalle</p>
        </div>
        <div className="flex items-center gap-3">
          {freteConectado === false && (
            <a href="/api/labs/frete/conectar"
              className="text-xs font-semibold text-[#8a6e36] border border-[#8a6e36]/30 rounded-lg px-3 py-2 hover:bg-amber-50 transition">
              🚚 Conectar Melhor Envio
            </a>
          )}
          {freteConectado === true && (
            <span className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              🚚 Frete conectado
            </span>
          )}
          <Link href="/admin/labs/pedidos/novo"
            className="bg-[#19202d] hover:bg-[#232d3f] text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition">
            + Novo pedido
          </Link>
        </div>
      </div>

      {acabouDeConectar && (
        <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-4">
          ✓ Melhor Envio conectado com sucesso.
        </p>
      )}
      {erro && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{erro}</p>}

      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => setStatusFiltro('')}
          className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition ${!statusFiltro ? 'bg-[#19202d] text-white border-[#19202d]' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
          Todos
        </button>
        {Object.entries(STATUS_LABEL).map(([v, label]) => (
          <button key={v} onClick={() => setStatusFiltro(v)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition ${statusFiltro === v ? 'bg-[#19202d] text-white border-[#19202d]' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="p-8 text-sm text-gray-400">Carregando...</div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="px-4 py-3">Nº</th>
                <th className="px-2 py-3">Data</th>
                <th className="px-2 py-3">Tutor / Pet</th>
                <th className="px-2 py-3">Origem</th>
                <th className="px-2 py-3">Itens</th>
                <th className="px-2 py-3 text-right">Valor</th>
                <th className="px-2 py-3">Status</th>
                <th className="px-4 py-3">Pagamento</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map(p => (
                <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/60 cursor-pointer"
                  onClick={() => { window.location.href = `/admin/labs/pedidos/${p.id}` }}>
                  <td className="px-4 py-2.5 text-xs font-mono text-gray-400">#{p.id}</td>
                  <td className="px-2 py-2.5 text-xs text-gray-500 whitespace-nowrap">{fmtData(p.criado_em)}</td>
                  <td className="px-2 py-2.5">
                    <p className="font-medium text-[#19202d] leading-tight">{p.tutores?.nome ?? '—'}</p>
                    <p className="text-[11px] text-gray-400 leading-tight">🐾 {p.pets?.nome ?? '—'}</p>
                  </td>
                  <td className="px-2 py-2.5 text-xs text-gray-500 capitalize">
                    {p.origem}{p.clinicas?.nome ? ` · ${p.clinicas.nome}` : ''}
                  </td>
                  <td className="px-2 py-2.5 text-xs text-gray-500">
                    {p.pedido_lab_item.length} exame(s)
                    <div className="text-[11px] text-gray-400">{labsDoPedido(p)}</div>
                  </td>
                  <td className="px-2 py-2.5 text-right text-sm font-semibold text-[#19202d] whitespace-nowrap">{fmtBRL(p.valor_total)}</td>
                  <td className="px-2 py-2.5">
                    <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full ${STATUS_COR[p.status] ?? 'bg-gray-100 text-gray-500'}`}>
                      {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{PAGAMENTO_LABEL[p.status_pagamento] ?? p.status_pagamento}</td>
                </tr>
              ))}
              {pedidos.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-400">Nenhum pedido encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
