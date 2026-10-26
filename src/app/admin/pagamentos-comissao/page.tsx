'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Pessoa {
  chave:           string
  pessoa:          { tipo: 'usuario' | 'veterinario'; id: number }
  nome:            string
  inicial:         number
  devido:          number
  devido_laudo:    number
  devido_extracao: number
  pago:            number
  saldo:           number
  adiantamento:    boolean
}

interface Pagamento {
  id:               number
  pessoa_tipo:      string
  pessoa_id:        number
  pessoa_nome:      string
  valor:            number
  pago_em:          string
  forma:            string | null
  observacao:       string | null
  criado_por_nome:  string | null
  estornado_em:     string | null
  estornado_motivo: string | null
}

interface ItemExtrato {
  data:      string
  tipo:      'laudo' | 'extracao' | 'pagamento' | 'estorno'
  descricao: string
  valor:     number
  ref_id:    number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function fmtData(s: string) {
  const [y, m, d] = s.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

const hojeISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

const parseValor = (s: string) => {
  const n = Number(s.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN
}

const FORMAS = ['Pix', 'Transferência', 'Dinheiro', 'Outro']

const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36]'
const LABEL = 'block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1'

function SaldoTag({ p }: { p: Pessoa }) {
  if (p.adiantamento) {
    return <span className="font-bold text-blue-600">{brl(-p.saldo)} <span className="text-[10px] font-semibold uppercase">adiantamento</span></span>
  }
  return <span className={`font-bold ${p.saldo > 0 ? 'text-[#19202d]' : 'text-gray-400'}`}>{brl(p.saldo)}</span>
}

function Modal({ titulo, onClose, children, largo }: { titulo: string; onClose: () => void; children: React.ReactNode; largo?: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4 py-6 overflow-y-auto" onClick={onClose}>
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${largo ? 'max-w-2xl' : 'max-w-md'} overflow-hidden my-auto`} onClick={e => e.stopPropagation()}>
        <div className="bg-[#19202d] px-6 py-4 flex items-center justify-between">
          <h3 className="text-white font-bold text-sm">{titulo}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ── Modal: registrar pagamento ────────────────────────────────────────────────

function PagarModal({ pessoa, onClose, onSaved }: { pessoa: Pessoa; onClose: () => void; onSaved: () => void }) {
  const sugerido = pessoa.saldo > 0 ? pessoa.saldo.toFixed(2).replace('.', ',') : ''
  const [valor,  setValor]  = useState(sugerido)
  const [data,   setData]   = useState(hojeISO())
  const [forma,  setForma]  = useState('Pix')
  const [obs,    setObs]    = useState('')
  const [ciente, setCiente] = useState(false)
  const [saving, setSaving] = useState(false)
  const [erro,   setErro]   = useState('')

  const v        = parseValor(valor)
  const valido   = Number.isFinite(v) && v > 0
  const passa    = valido ? Math.round(Math.max(0, v - Math.max(0, pessoa.saldo)) * 100) / 100 : 0
  const saldoApos = valido ? Math.round((pessoa.saldo - v) * 100) / 100 : pessoa.saldo

  async function salvar() {
    if (!valido) { setErro('Informe um valor maior que zero.'); return }
    if (passa > 0 && !ciente) { setErro('Confirme que o excedente será um adiantamento.'); return }
    setSaving(true); setErro('')
    const res = await fetch('/api/admin/pagamentos-comissao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pessoa_tipo: pessoa.pessoa.tipo,
        pessoa_id:   pessoa.pessoa.id,
        valor:       v,
        pago_em:     data,
        forma,
        observacao:  obs,
        confirmar_adiantamento: passa > 0 && ciente,
      }),
    })
    const j = await res.json().catch(() => ({}))
    setSaving(false)
    if (res.ok) { onSaved(); return }
    setErro(j.error ?? 'Erro ao registrar pagamento.')
  }

  return (
    <Modal titulo={`Registrar pagamento — ${pessoa.nome}`} onClose={onClose}>
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-gray-50 rounded-lg py-2"><p className={LABEL}>Devido</p><p className="text-sm font-bold">{brl(pessoa.inicial + pessoa.devido)}</p></div>
          <div className="bg-gray-50 rounded-lg py-2"><p className={LABEL}>Já pago</p><p className="text-sm font-bold text-green-600">{brl(pessoa.pago)}</p></div>
          <div className="bg-gray-50 rounded-lg py-2"><p className={LABEL}>Saldo</p><p className="text-sm font-bold"><SaldoTag p={pessoa} /></p></div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Valor pago (R$) *</label>
            <input inputMode="decimal" autoFocus value={valor} onChange={e => { setValor(e.target.value); setCiente(false) }}
              placeholder="0,00" className={INPUT + ' text-right font-semibold'} />
          </div>
          <div>
            <label className={LABEL}>Data</label>
            <input type="date" max={hojeISO()} value={data} onChange={e => setData(e.target.value)} className={INPUT} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Forma</label>
            <select value={forma} onChange={e => setForma(e.target.value)} className={INPUT}>
              {FORMAS.map(f => <option key={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL}>Observação</label>
            <input value={obs} onChange={e => setObs(e.target.value)} maxLength={500} className={INPUT} placeholder="Opcional" />
          </div>
        </div>

        {valido && (
          <p className="text-xs text-gray-500">
            Saldo depois deste pagamento:{' '}
            <strong className={saldoApos < 0 ? 'text-blue-600' : 'text-[#19202d]'}>
              {saldoApos < 0 ? `${brl(-saldoApos)} de adiantamento` : brl(saldoApos)}
            </strong>
          </p>
        )}

        {passa > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 space-y-2">
            <p className="text-sm font-semibold text-amber-800">
              ⚠ Este valor passa {brl(passa)} do que é devido.
            </p>
            <p className="text-xs text-amber-700">O excedente fica registrado como <strong>adiantamento</strong> e abate das próximas comissões.</p>
            <label className="flex items-center gap-2 text-xs text-amber-800 cursor-pointer">
              <input type="checkbox" checked={ciente} onChange={e => setCiente(e.target.checked)} />
              Entendo e quero registrar como adiantamento
            </label>
          </div>
        )}

        {erro && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-500 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition">Cancelar</button>
          <button onClick={salvar} disabled={saving || !valido || (passa > 0 && !ciente)}
            className="flex-1 bg-[#19202d] hover:bg-[#232d3f] text-white font-semibold py-2.5 rounded-lg text-sm transition disabled:opacity-50">
            {saving ? 'Registrando...' : 'Registrar pagamento'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Modal: extrato ────────────────────────────────────────────────────────────

const TIPO_ITEM: Record<ItemExtrato['tipo'], { label: string; cor: string; sinal: string }> = {
  laudo:     { label: 'Laudo',     cor: 'text-[#19202d]', sinal: '+' },
  extracao:  { label: 'Extração',  cor: 'text-[#19202d]', sinal: '+' },
  pagamento: { label: 'Pagamento', cor: 'text-green-600', sinal: '−' },
  estorno:   { label: 'Estorno',   cor: 'text-orange-600', sinal: '' },
}

function ExtratoModal({ pessoa, dataCorte, onClose }: { pessoa: Pessoa; dataCorte: string; onClose: () => void }) {
  const [itens, setItens] = useState<ItemExtrato[] | null>(null)
  const [erro,  setErro]  = useState('')

  useEffect(() => {
    fetch(`/api/admin/pagamentos-comissao/extrato?tipo=${pessoa.pessoa.tipo}&id=${pessoa.pessoa.id}`)
      .then(async r => {
        const j = await r.json().catch(() => ({}))
        if (r.ok) setItens(j.itens ?? [])
        else setErro(j.error ?? 'Erro ao carregar extrato.')
      })
      .catch(() => setErro('Erro ao carregar extrato.'))
  }, [pessoa])

  return (
    <Modal titulo={`Extrato — ${pessoa.nome}`} onClose={onClose} largo>
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
          {[
            { l: 'Saldo inicial', v: brl(pessoa.inicial) },
            { l: 'Laudos',        v: brl(pessoa.devido_laudo) },
            { l: 'Extrações',     v: brl(pessoa.devido_extracao) },
            { l: 'Pago',          v: brl(pessoa.pago) },
          ].map(c => (
            <div key={c.l} className="bg-gray-50 rounded-lg py-2"><p className={LABEL}>{c.l}</p><p className="text-sm font-bold">{c.v}</p></div>
          ))}
          <div className="bg-gray-50 rounded-lg py-2"><p className={LABEL}>Saldo</p><p className="text-sm"><SaldoTag p={pessoa} /></p></div>
        </div>
        <p className="text-[11px] text-gray-400">
          Comissões geradas a partir de {fmtData(dataCorte)}. O que estava a pagar antes dessa data entra no saldo inicial.
        </p>

        {erro && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>}
        {!itens && !erro && <p className="text-sm text-gray-400 text-center py-6">Carregando...</p>}
        {itens && itens.length === 0 && <p className="text-sm text-gray-400 text-center py-6">Nada lançado desde a data de corte.</p>}
        {itens && itens.length > 0 && (
          <div className="max-h-[50vh] overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50">
            {itens.map((i, k) => {
              const t = TIPO_ITEM[i.tipo]
              return (
                <div key={`${i.tipo}-${i.ref_id}-${k}`} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="text-xs text-gray-400 w-20 shrink-0">{fmtData(i.data)}</span>
                  <span className={`text-[10px] font-bold uppercase w-16 shrink-0 ${t.cor}`}>{t.label}</span>
                  <span className="flex-1 text-gray-600 truncate" title={i.descricao}>{i.descricao}</span>
                  <span className={`font-semibold whitespace-nowrap ${t.cor}`}>{t.sinal} {brl(i.valor)}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Modal>
  )
}

// ── Modal: estornar ───────────────────────────────────────────────────────────

function EstornarModal({ pag, onClose, onDone }: { pag: Pagamento; onClose: () => void; onDone: () => void }) {
  const [motivo, setMotivo] = useState('')
  const [saving, setSaving] = useState(false)
  const [erro,   setErro]   = useState('')

  async function estornar() {
    if (!motivo.trim()) { setErro('Informe o motivo.'); return }
    setSaving(true); setErro('')
    const res = await fetch(`/api/admin/pagamentos-comissao/${pag.id}/estornar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo }),
    })
    const j = await res.json().catch(() => ({}))
    setSaving(false)
    if (res.ok) onDone()
    else setErro(j.error ?? 'Erro ao estornar.')
  }

  return (
    <Modal titulo="Estornar pagamento" onClose={onClose}>
      <div className="p-6 space-y-4">
        <p className="text-sm text-gray-600">
          Estornar <strong>{brl(pag.valor)}</strong> pago a <strong>{pag.pessoa_nome}</strong> em {fmtData(pag.pago_em)}?
          O valor volta para o saldo e o registro continua no histórico.
        </p>
        <div>
          <label className={LABEL}>Motivo *</label>
          <input autoFocus value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={500} className={INPUT} placeholder="Ex.: valor digitado errado" />
        </div>
        {erro && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-500 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition">Cancelar</button>
          <button onClick={estornar} disabled={saving}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-lg text-sm transition disabled:opacity-50">
            {saving ? 'Estornando...' : 'Estornar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function PagamentosComissaoPage() {
  const [pessoas,    setPessoas]    = useState<Pessoa[]>([])
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([])
  const [dataCorte,  setDataCorte]  = useState('')
  const [loading,    setLoading]    = useState(true)
  const [erro,       setErro]       = useState('')
  const [filtroPessoa, setFiltroPessoa] = useState('')
  const [pagar,      setPagar]      = useState<Pessoa | null>(null)
  const [extrato,    setExtrato]    = useState<Pessoa | null>(null)
  const [estornar,   setEstornar]   = useState<Pagamento | null>(null)
  const [sucesso,    setSucesso]    = useState('')

  const carregar = useCallback(async () => {
    const res = await fetch('/api/admin/pagamentos-comissao')
    const j = await res.json().catch(() => ({}))
    if (res.ok) {
      setPessoas(j.pessoas ?? []); setPagamentos(j.pagamentos ?? []); setDataCorte(j.data_corte ?? ''); setErro('')
    } else {
      setErro(j.error ?? `Erro ${res.status} ao carregar.`)
    }
    setLoading(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const totais = useMemo(() => ({
    aPagar:       pessoas.reduce((s, p) => s + Math.max(0, p.saldo), 0),
    adiantamento: pessoas.reduce((s, p) => s + Math.max(0, -p.saldo), 0),
    pago:         pessoas.reduce((s, p) => s + p.pago, 0),
  }), [pessoas])

  const historico = filtroPessoa
    ? pagamentos.filter(p => `${p.pessoa_tipo}:${p.pessoa_id}` === filtroPessoa)
    : pagamentos

  function aviso(msg: string) { setSucesso(msg); setTimeout(() => setSucesso(''), 4000) }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-[#19202d]">Pagamentos de comissão</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Saldo por pessoa: o que foi gerado em laudos e extrações, menos o que já foi pago. O pagamento pode ser de qualquer valor.
          </p>
        </div>

        {sucesso && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">{sucesso}</p>}
        {erro && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{erro}</p>}

        {/* Resumo */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">A pagar</p>
            <p className="text-3xl font-bold text-[#19202d]">{loading ? '—' : brl(totais.aPagar)}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">Pago</p>
            <p className="text-3xl font-bold text-green-600">{loading ? '—' : brl(totais.pago)}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">Adiantamentos</p>
            <p className="text-3xl font-bold text-blue-600">{loading ? '—' : brl(totais.adiantamento)}</p>
          </div>
        </div>

        {/* Saldos */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="h-1 bg-gold-stripe" />
          {loading ? (
            <p className="text-center py-12 text-gray-400 text-sm">Carregando...</p>
          ) : pessoas.length === 0 ? (
            <p className="text-center py-12 text-gray-400 text-sm">Nenhuma comissão a pagar desde {dataCorte && fmtData(dataCorte)}.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Pessoa</th>
                    <th className="text-right px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Saldo inicial</th>
                    <th className="text-right px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Laudos</th>
                    <th className="text-right px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Extrações</th>
                    <th className="text-right px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Pago</th>
                    <th className="text-right px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Saldo</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pessoas.map(p => (
                    <tr key={p.chave}>
                      <td className="px-4 py-3 font-medium text-[#19202d]">{p.nome}</td>
                      <td className="px-4 py-3 text-right text-gray-500">{brl(p.inicial)}</td>
                      <td className="px-4 py-3 text-right text-gray-500">{brl(p.devido_laudo)}</td>
                      <td className="px-4 py-3 text-right text-gray-500">{brl(p.devido_extracao)}</td>
                      <td className="px-4 py-3 text-right text-green-600 font-semibold">{brl(p.pago)}</td>
                      <td className="px-4 py-3 text-right"><SaldoTag p={p} /></td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button onClick={() => setExtrato(p)} className="text-xs text-[#8a6e36] hover:underline font-semibold mr-3">Extrato</button>
                        <button onClick={() => setPagar(p)}
                          className="text-xs bg-[#19202d] hover:bg-[#232d3f] text-white font-semibold px-3 py-1.5 rounded-lg transition">
                          Registrar pagamento
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {dataCorte && (
            <div className="px-4 py-3 border-t border-gray-50 bg-gray-50">
              <p className="text-xs text-gray-400">
                Comissões contadas a partir de {fmtData(dataCorte)}. O que estava a pagar antes dessa data está no saldo inicial.
              </p>
            </div>
          )}
        </div>

        {/* Histórico */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-sm font-bold text-[#19202d]">Histórico de pagamentos</h2>
            <select value={filtroPessoa} onChange={e => setFiltroPessoa(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs">
              <option value="">Todas as pessoas</option>
              {pessoas.map(p => <option key={p.chave} value={p.chave}>{p.nome}</option>)}
            </select>
          </div>
          {historico.length === 0 ? (
            <p className="text-center py-10 text-gray-400 text-sm">Nenhum pagamento registrado.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {historico.map(h => (
                <div key={h.id} className={`flex items-center gap-3 px-5 py-3 text-sm flex-wrap ${h.estornado_em ? 'bg-gray-50/60' : ''}`}>
                  <span className="text-xs text-gray-400 w-20 shrink-0">{fmtData(h.pago_em)}</span>
                  <span className={`font-medium w-44 truncate ${h.estornado_em ? 'text-gray-400 line-through' : 'text-[#19202d]'}`}>{h.pessoa_nome}</span>
                  <span className={`font-semibold w-28 ${h.estornado_em ? 'text-gray-400 line-through' : 'text-green-600'}`}>{brl(h.valor)}</span>
                  <span className="flex-1 min-w-[10rem] text-xs text-gray-500">
                    {[h.forma, h.observacao].filter(Boolean).join(' — ')}
                    {h.criado_por_nome && <span className="text-gray-300"> · por {h.criado_por_nome}</span>}
                    {h.estornado_em && <span className="block text-orange-600">Estornado em {fmtData(h.estornado_em)}: {h.estornado_motivo}</span>}
                  </span>
                  {!h.estornado_em && (
                    <button onClick={() => setEstornar(h)} className="text-xs text-red-500 hover:text-red-700 font-semibold">Estornar</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {pagar && (
        <PagarModal pessoa={pagar} onClose={() => setPagar(null)}
          onSaved={() => { setPagar(null); aviso('Pagamento registrado.'); carregar() }} />
      )}
      {extrato && <ExtratoModal pessoa={extrato} dataCorte={dataCorte} onClose={() => setExtrato(null)} />}
      {estornar && (
        <EstornarModal pag={estornar} onClose={() => setEstornar(null)}
          onDone={() => { setEstornar(null); aviso('Pagamento estornado.'); carregar() }} />
      )}
    </div>
  )
}
