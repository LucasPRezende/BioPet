'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

interface PedidoItem {
  id:                 number
  laboratorio_id:     number
  codigo:             string | null
  nome:               string
  cor_tubo:           string | null
  material_tipo:      string | null
  material_volume_ml: number | null
  custo_snapshot:     number | null
  preco_snapshot:     number | null
  lab_laboratorios:   { nome: string } | null
}

interface Agendamento { id: number; data_hora: string; status: string }

interface TuboFisico {
  volume_total_ml: number
  itens:           { nome: string }[]
}
interface GrupoTubo { cor_tubo: string | null; tubos: TuboFisico[] }

interface EnvioLab {
  id:               number
  laboratorio_id:   number
  transportadora:   string | null
  valor_frete:      number | null
  etiqueta_url:     string | null
  codigo_rastreio:  string | null
  status_envio:     string
  lab_laboratorios: { nome: string } | null
}
interface OpcaoFrete {
  id:            number
  name:          string
  price:         string | null
  custom_price:  string | null
  delivery_time: number | null
  company:       { name: string }
}
interface CotacaoPorLab { laboratorio_id: number; nome: string; opcoes: OpcaoFrete[]; erro?: string }

interface Pedido {
  id:               number
  tutor_id:         number
  pet_id:           number
  origem:           string
  tipo_cobranca:    string
  status:           string
  status_pagamento: string
  valor_total:      number | null
  observacoes:      string | null
  criado_em:        string
  agendamento_id:   number | null
  tutores:          { nome: string | null; telefone: string } | null
  pets:             { nome: string; especie: string | null } | null
  clinicas:         { nome: string } | null
  veterinarios:     { nome: string } | null
  agendamentos:     Agendamento | Agendamento[] | null
  pedido_lab_item:  PedidoItem[]
}

const STATUS_LABEL: Record<string, string> = {
  rascunho: 'Rascunho', confirmado: 'Confirmado', coleta_agendada: 'Coleta agendada',
  coletado: 'Coletado', enviado: 'Enviado', concluido: 'Concluído', cancelado: 'Cancelado',
}
const STATUS_COR: Record<string, string> = {
  rascunho: 'bg-gray-100 text-gray-500', confirmado: 'bg-blue-50 text-blue-700',
  coleta_agendada: 'bg-amber-50 text-amber-700', coletado: 'bg-purple-50 text-purple-700',
  enviado: 'bg-indigo-50 text-indigo-700', concluido: 'bg-green-50 text-green-700', cancelado: 'bg-red-50 text-red-600',
}
const PAGAMENTO_OPTS = ['pendente', 'a_receber', 'pago', 'pago_clinica']
const PAGAMENTO_LABEL: Record<string, string> = {
  pendente: 'Pendente', a_receber: 'A receber', pago: 'Pago', pago_clinica: 'Pago (clínica)',
}

function fmtBRL(n: number | null) {
  if (n === null) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtDataHora(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function AgendarColetaModal({ pedidoId, onClose, onAgendado }: { pedidoId: number; onClose: () => void; onAgendado: () => void }) {
  const [data, setData] = useState('')
  const [horarios, setHorarios] = useState<string[]>([])
  const [hora, setHora] = useState('')
  const [loadingHorarios, setLoadingHorarios] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (!data) { setHorarios([]); return }
    setLoadingHorarios(true); setHora('')
    fetch(`/api/agendamentos/horarios-livres?data=${data}&duracao=30`)
      .then(r => r.json())
      .then(d => setHorarios(d.horarios_livres ?? []))
      .finally(() => setLoadingHorarios(false))
  }, [data])

  async function confirmar() {
    if (!data || !hora) return
    setEnviando(true); setErro('')
    const res = await fetch(`/api/labs/pedidos/${pedidoId}/agendar-coleta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data_hora: `${data}T${hora}:00` }),
    })
    if (res.ok) { onAgendado(); return }
    const d = await res.json()
    setErro(d.error ?? 'Erro ao agendar coleta.')
    setEnviando(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="bg-[#19202d] px-6 py-4 flex items-center justify-between">
          <h3 className="text-white font-bold text-sm">Agendar coleta</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Data</label>
            <input type="date" value={data} onChange={e => setData(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36]" />
          </div>
          {data && (
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Horário</label>
              {loadingHorarios ? (
                <p className="text-xs text-gray-400">Carregando horários...</p>
              ) : horarios.length === 0 ? (
                <p className="text-xs text-gray-400">Nenhum horário livre nesse dia.</p>
              ) : (
                <div className="grid grid-cols-4 gap-1.5 max-h-40 overflow-y-auto">
                  {horarios.map(h => (
                    <button key={h} type="button" onClick={() => setHora(h)}
                      className={`text-xs font-semibold py-1.5 rounded-lg border transition ${hora === h ? 'bg-[#19202d] text-white border-[#19202d]' : 'border-gray-200 text-gray-600 hover:border-[#8a6e36]'}`}>
                      {h}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {erro && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 border border-gray-200 text-gray-500 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition">
              Cancelar
            </button>
            <button type="button" onClick={confirmar} disabled={!data || !hora || enviando}
              className="flex-1 bg-[#19202d] hover:bg-[#232d3f] text-white font-semibold py-2.5 rounded-lg text-sm transition disabled:opacity-40">
              {enviando ? 'Agendando...' : 'Confirmar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PedidoLabDetalhePage() {
  const params = useParams()
  const router = useRouter()
  const id = Number(params.id)

  const [pedido,  setPedido]  = useState<Pedido | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro,    setErro]    = useState('')
  const [acaoEmAndamento, setAcaoEmAndamento] = useState(false)
  const [modalColeta, setModalColeta] = useState(false)
  const [observacoes, setObservacoes] = useState('')
  const [salvandoObs, setSalvandoObs] = useState(false)
  const [grupos,      setGrupos]      = useState<GrupoTubo[]>([])
  const [resumoTubos, setResumoTubos] = useState('')
  const [envios,      setEnvios]      = useState<EnvioLab[]>([])
  const [cotacoes,    setCotacoes]    = useState<CotacaoPorLab[] | null>(null)
  const [cotando,     setCotando]     = useState(false)
  const [comprando,   setComprando]   = useState<string | null>(null)

  const carregar = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch(`/api/labs/pedidos/${id}`).then(r => r.json()),
      fetch(`/api/labs/pedidos/${id}/tubos`).then(r => r.ok ? r.json() : { grupos: [], resumo: '' }),
      fetch(`/api/labs/pedidos/${id}/frete`).then(r => r.ok ? r.json() : []),
    ])
      .then(([d, t, f]) => {
        if (d.error) { setErro(d.error); return }
        setPedido(d)
        setObservacoes(d.observacoes ?? '')
        setGrupos(t.grupos ?? [])
        setResumoTubos(t.resumo ?? '')
        setEnvios(f ?? [])
      })
      .catch(() => setErro('Erro ao carregar pedido.'))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => { carregar() }, [carregar])

  async function transicionar(novoStatus: string) {
    if (!pedido) return
    setAcaoEmAndamento(true); setErro('')
    const res = await fetch(`/api/labs/pedidos/${pedido.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: novoStatus }),
    })
    if (res.ok) carregar()
    else { const d = await res.json(); setErro(d.error ?? 'Erro ao atualizar status.') }
    setAcaoEmAndamento(false)
  }

  async function salvarPagamento(novo: string) {
    if (!pedido) return
    const res = await fetch(`/api/labs/pedidos/${pedido.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status_pagamento: novo }),
    })
    if (res.ok) carregar()
  }

  async function cotar() {
    if (!pedido) return
    setCotando(true); setErro('')
    const res = await fetch(`/api/labs/pedidos/${pedido.id}/frete/cotar`, { method: 'POST' })
    const data = await res.json()
    if (res.ok) setCotacoes(data)
    else setErro(data.error ?? 'Erro ao cotar frete.')
    setCotando(false)
  }

  async function comprar(laboratorioId: number, serviceId: number) {
    if (!pedido) return
    setComprando(`${laboratorioId}-${serviceId}`); setErro('')
    const res = await fetch(`/api/labs/pedidos/${pedido.id}/frete/comprar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ laboratorio_id: laboratorioId, service_id: serviceId }),
    })
    const data = await res.json()
    if (res.ok) { setCotacoes(null); carregar() }
    else setErro(data.error ?? 'Erro ao comprar frete.')
    setComprando(null)
  }

  async function salvarObservacoes() {
    if (!pedido) return
    setSalvandoObs(true)
    await fetch(`/api/labs/pedidos/${pedido.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ observacoes }),
    })
    setSalvandoObs(false)
  }

  if (loading) return <div className="p-8 text-sm text-gray-400">Carregando...</div>
  if (erro && !pedido) return <div className="p-8 text-sm text-red-600">{erro}</div>
  if (!pedido) return null

  const agendamento = Array.isArray(pedido.agendamentos) ? pedido.agendamentos[0] : pedido.agendamentos

  const porLab = new Map<string, PedidoItem[]>()
  for (const item of pedido.pedido_lab_item) {
    const nome = item.lab_laboratorios?.nome ?? '?'
    porLab.set(nome, [...(porLab.get(nome) ?? []), item])
  }

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto">
      {modalColeta && (
        <AgendarColetaModal
          pedidoId={pedido.id}
          onClose={() => setModalColeta(false)}
          onAgendado={() => { setModalColeta(false); carregar() }}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-[#19202d]">Pedido #{pedido.id}</h1>
            <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full ${STATUS_COR[pedido.status] ?? 'bg-gray-100 text-gray-500'}`}>
              {STATUS_LABEL[pedido.status] ?? pedido.status}
            </span>
          </div>
          <p className="text-sm text-gray-400">Criado em {fmtDataHora(pedido.criado_em)}</p>
        </div>
        <Link href="/admin/labs/pedidos" className="text-sm text-gray-400 hover:text-[#19202d] transition">← Voltar</Link>
      </div>

      {erro && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{erro}</p>}

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          {/* Itens por lab */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Itens</p>
            <div className="space-y-4">
              {Array.from(porLab.entries()).map(([labNome, itens]) => (
                <div key={labNome}>
                  <p className="text-xs font-bold text-[#8a6e36] mb-1.5">{labNome}</p>
                  <div className="space-y-1">
                    {itens.map(item => (
                      <div key={item.id} className="flex items-center justify-between text-sm py-1 border-b border-gray-50 last:border-0">
                        <div>
                          <p className="text-[#19202d] font-medium">{item.nome}</p>
                          <p className="text-[11px] text-gray-400">
                            {item.codigo ? `${item.codigo} · ` : ''}{item.cor_tubo ?? '—'}
                          </p>
                        </div>
                        <span className="font-semibold text-[#19202d]">{fmtBRL(item.preco_snapshot)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-gray-100 pt-2 font-bold text-[#19202d]">
                <span>Total ({pedido.tipo_cobranca === 'parceiro' ? 'preço parceiro' : 'preço cliente'})</span>
                <span>{fmtBRL(pedido.valor_total)}</span>
              </div>
            </div>
          </div>

          {/* Instrução de coleta */}
          {grupos.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Instrução de coleta</p>
                <a href={`/api/labs/pedidos/${pedido.id}/etiquetas`} target="_blank" rel="noopener noreferrer"
                  className="text-xs font-semibold text-[#8a6e36] hover:text-[#6f5729] transition">
                  🖨 Imprimir etiquetas
                </a>
              </div>
              <p className="text-sm text-[#19202d] font-medium mb-3">{resumoTubos}</p>
              <div className="space-y-3">
                {grupos.map((g, gi) => (
                  <div key={gi}>
                    <p className="text-xs font-bold text-[#8a6e36] mb-1">{g.cor_tubo ?? 'Sem recipiente definido'}</p>
                    {g.tubos.map((t, ti) => (
                      <div key={ti} className="text-xs text-gray-500 pl-2 border-l-2 border-gray-100 mb-1">
                        <span className="font-semibold text-gray-600">Tubo {ti + 1}/{g.tubos.length}</span>
                        {t.volume_total_ml > 0 && <span> · {t.volume_total_ml.toFixed(2)} mL</span>}
                        <span> — {t.itens.map(it => it.nome).join(', ')}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Frete */}
          {['coletado', 'enviado', 'concluido'].includes(pedido.status) && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Frete (Melhor Envio)</p>
                {pedido.status === 'coletado' && (
                  <button onClick={cotar} disabled={cotando}
                    className="text-xs font-semibold text-[#8a6e36] hover:text-[#6f5729] transition disabled:opacity-40">
                    {cotando ? 'Cotando...' : '🚚 Cotar frete'}
                  </button>
                )}
              </div>

              {envios.length > 0 && (
                <div className="space-y-1.5 mb-3">
                  {envios.map(e => (
                    <div key={e.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                      <div>
                        <p className="text-[#19202d] font-medium">{e.lab_laboratorios?.nome ?? '?'} · {e.transportadora ?? '—'}</p>
                        <p className="text-[11px] text-gray-400 uppercase">
                          {e.status_envio}{e.codigo_rastreio ? ` · ${e.codigo_rastreio}` : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-[#19202d]">{fmtBRL(e.valor_frete)}</p>
                        {e.etiqueta_url && (
                          <a href={e.etiqueta_url} target="_blank" rel="noopener noreferrer"
                            className="text-[11px] text-[#8a6e36] font-semibold hover:underline">
                            etiqueta ↗
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {cotacoes?.map(c => {
                const jaComprado = envios.some(e => e.laboratorio_id === c.laboratorio_id)
                if (jaComprado) return null
                return (
                  <div key={c.laboratorio_id} className="mb-3">
                    <p className="text-xs font-bold text-[#8a6e36] mb-1.5">{c.nome}</p>
                    {c.erro && <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-2">{c.erro}</p>}
                    <div className="space-y-1.5">
                      {c.opcoes.map(o => (
                        <div key={o.id} className="flex items-center justify-between text-sm px-3 py-2 rounded-lg border border-gray-200">
                          <div>
                            <p className="text-[#19202d] font-medium">{o.company.name} — {o.name}</p>
                            {o.delivery_time != null && <p className="text-[11px] text-gray-400">{o.delivery_time}d úteis</p>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-[#19202d]">{fmtBRL(Number(o.custom_price ?? o.price ?? 0))}</span>
                            <button onClick={() => comprar(c.laboratorio_id, o.id)} disabled={!!comprando}
                              className="text-xs font-semibold bg-[#19202d] hover:bg-[#232d3f] text-white px-3 py-1.5 rounded-lg transition disabled:opacity-40">
                              {comprando === `${c.laboratorio_id}-${o.id}` ? 'Comprando...' : 'Comprar'}
                            </button>
                          </div>
                        </div>
                      ))}
                      {c.opcoes.length === 0 && !c.erro && <p className="text-xs text-gray-400">Nenhuma opção disponível.</p>}
                    </div>
                  </div>
                )
              })}

              {envios.length === 0 && !cotacoes && (
                <p className="text-xs text-gray-400">Nenhum frete cotado ainda.</p>
              )}
            </div>
          )}

          {/* Observações */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Observações</p>
            <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} onBlur={salvarObservacoes} rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36] bg-white" />
            {salvandoObs && <p className="text-xs text-gray-400 mt-1">Salvando...</p>}
          </div>
        </div>

        <div className="space-y-6">
          {/* Dados */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-2 text-sm">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Dados</p>
            <p><span className="text-gray-400">Tutor:</span> {pedido.tutores?.nome ?? '—'}</p>
            <p><span className="text-gray-400">Pet:</span> 🐾 {pedido.pets?.nome ?? '—'}</p>
            <p className="capitalize"><span className="text-gray-400">Origem:</span> {pedido.origem}</p>
            {pedido.clinicas?.nome && <p><span className="text-gray-400">Clínica:</span> {pedido.clinicas.nome}</p>}
            {pedido.veterinarios?.nome && <p><span className="text-gray-400">Vet:</span> {pedido.veterinarios.nome}</p>}
            <div>
              <label className="text-gray-400 text-xs block mb-1">Pagamento</label>
              <select value={pedido.status_pagamento} onChange={e => salvarPagamento(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#8a6e36]">
                {PAGAMENTO_OPTS.map(o => <option key={o} value={o}>{PAGAMENTO_LABEL[o]}</option>)}
              </select>
            </div>
            {agendamento && (
              <p className="pt-2 border-t border-gray-50">
                <span className="text-gray-400">Coleta:</span> {fmtDataHora(agendamento.data_hora)}
                <span className="text-[10px] ml-1 uppercase text-gray-400">({agendamento.status})</span>
              </p>
            )}
          </div>

          {/* Ações */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Ações</p>
            {pedido.status === 'rascunho' && (
              <button onClick={() => transicionar('confirmado')} disabled={acaoEmAndamento}
                className="w-full bg-[#19202d] hover:bg-[#232d3f] text-white font-semibold py-2.5 rounded-lg text-sm transition disabled:opacity-40">
                Confirmar pedido
              </button>
            )}
            {pedido.status === 'confirmado' && (
              <button onClick={() => setModalColeta(true)} disabled={acaoEmAndamento}
                className="w-full bg-[#19202d] hover:bg-[#232d3f] text-white font-semibold py-2.5 rounded-lg text-sm transition disabled:opacity-40">
                Agendar coleta
              </button>
            )}
            {pedido.status === 'coleta_agendada' && (
              <button onClick={() => transicionar('coletado')} disabled={acaoEmAndamento}
                className="w-full bg-[#19202d] hover:bg-[#232d3f] text-white font-semibold py-2.5 rounded-lg text-sm transition disabled:opacity-40">
                Marcar como coletado
              </button>
            )}
            {!['cancelado', 'concluido'].includes(pedido.status) && (
              <button onClick={() => { if (confirm('Cancelar este pedido?')) transicionar('cancelado') }} disabled={acaoEmAndamento}
                className="w-full border border-red-200 text-red-500 py-2.5 rounded-lg text-sm hover:bg-red-50 transition disabled:opacity-40">
                Cancelar pedido
              </button>
            )}
            {['cancelado', 'concluido'].includes(pedido.status) && (
              <p className="text-xs text-gray-400 text-center py-1">Nenhuma ação disponível.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
