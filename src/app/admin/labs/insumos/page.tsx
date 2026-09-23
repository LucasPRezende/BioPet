'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface Consumivel { id: number; nome: string; categoria: string; unidade: string; cor_tubo: string | null }
interface ItemKit    { consumivel_id: number; quantidade: number }
interface Caixa {
  id:             number
  nome:           string
  altura_cm:      number
  largura_cm:     number
  comprimento_cm: number
  peso_kg:        number
  kit_json:       ItemKit[] | null
  ativo:          boolean
}

const INPUT = 'border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36] bg-white'

export default function LabsInsumosPage() {
  const [consumiveis, setConsumiveis] = useState<Consumivel[]>([])
  const [caixas,      setCaixas]      = useState<Caixa[]>([])
  const [cores,       setCores]       = useState<string[]>([])
  const [corEdit,     setCorEdit]     = useState<Record<number, string>>({})
  const [loading,     setLoading]     = useState(true)
  const [erro,        setErro]        = useState('')
  const [msg,         setMsg]         = useState('')
  const [salvando,    setSalvando]    = useState(false)
  const [editCaixa,   setEditCaixa]   = useState<Caixa | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/labs/insumos')
    const d = await res.json().catch(() => ({}))
    if (res.ok) {
      setConsumiveis(d.consumiveis)
      setCaixas(d.caixas)
      setCores(d.cores)
      setCorEdit(Object.fromEntries((d.consumiveis as Consumivel[]).filter(c => c.categoria === 'tubo').map(c => [c.id, c.cor_tubo ?? ''])))
    } else setErro(d.error ?? 'Erro ao carregar.')
    setLoading(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const tubos = consumiveis.filter(c => c.categoria === 'tubo')
  const nomeDe = (id: number) => consumiveis.find(c => c.id === id)?.nome ?? `#${id} (inativo ou removido)`
  const coresSemTubo = cores.filter(cor => !tubos.some(t => (corEdit[t.id] ?? '').trim().toLowerCase() === cor.toLowerCase()))

  async function salvarCores() {
    setSalvando(true); setErro(''); setMsg('')
    const res = await fetch('/api/labs/insumos', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tubos.map(t => ({ id: t.id, cor_tubo: corEdit[t.id] ?? null }))),
    })
    if (res.ok) { setMsg('Cores dos tubos salvas.'); await carregar() }
    else setErro((await res.json().catch(() => ({}))).error ?? 'Erro ao salvar.')
    setSalvando(false)
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#19202d]">Labs Parceiros — tubos e caixas</h1>
        <p className="text-sm text-gray-500 mt-1">
          Como os pedidos gastam o estoque: o tubo de cada cor sai na coleta e o kit da caixa sai na compra do frete.
          Compras, saldo e custo ficam em <Link href="/admin/estoque" className="text-[#8a6e36] underline">Estoque</Link>.
        </p>
      </div>

      {erro && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{erro}</div>}
      {msg  && <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">✓ {msg}</div>}

      {loading ? <p className="text-sm text-gray-400">Carregando…</p> : (
        <>
          <section className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
            <div>
              <h2 className="font-semibold text-[#19202d]">Tubos de coleta</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Consumíveis da categoria &quot;Tubos de coleta&quot;. Informe a cor como aparece no catálogo — é por ela que a coleta dá baixa.
              </p>
            </div>
            {tubos.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhum consumível na categoria Tubos. Cadastre em Estoque › Novo consumível.</p>
            ) : (
              <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl">
                {tubos.map(t => (
                  <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 flex-wrap">
                    <span className="flex-1 min-w-40 text-sm font-medium text-[#19202d]">{t.nome}</span>
                    <input list="cores-catalogo" value={corEdit[t.id] ?? ''} placeholder="Cor do tubo"
                      onChange={e => setCorEdit(v => ({ ...v, [t.id]: e.target.value }))}
                      className={`${INPUT} w-56`} />
                  </div>
                ))}
              </div>
            )}
            <datalist id="cores-catalogo">{cores.map(c => <option key={c} value={c} />)}</datalist>
            {coresSemTubo.length > 0 && (
              <p className="text-[11px] text-amber-700">
                Cores do catálogo sem tubo vinculado (não dão baixa): {coresSemTubo.join(', ')}
              </p>
            )}
            {tubos.length > 0 && (
              <button onClick={salvarCores} disabled={salvando}
                className="bg-[#19202d] text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-40">
                {salvando ? 'Salvando…' : 'Salvar cores'}
              </button>
            )}
          </section>

          <section className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
            <div>
              <h2 className="font-semibold text-[#19202d]">Caixas de envio</h2>
              <p className="text-xs text-gray-500 mt-0.5">Dimensões usadas na cotação do frete e o kit que sai do estoque a cada envio. O frete usa a primeira caixa ativa.</p>
            </div>
            {caixas.length === 0 ? <p className="text-sm text-gray-400">Nenhuma caixa cadastrada.</p> : (
              <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl">
                {caixas.map(c => (
                  <div key={c.id} className={`flex items-start gap-3 px-4 py-3 ${c.ativo ? '' : 'opacity-50'}`}>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-[#19202d]">Caixa {c.nome}{!c.ativo && ' (inativa)'}</p>
                      <p className="text-xs text-gray-500">{c.altura_cm} × {c.largura_cm} × {c.comprimento_cm} cm · {c.peso_kg} kg</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {(c.kit_json ?? []).length > 0
                          ? `Kit: ${(c.kit_json ?? []).map(k => `${k.quantidade}× ${nomeDe(k.consumivel_id)}`).join(', ')}`
                          : 'Kit vazio — nada sai do estoque ao usar esta caixa'}
                      </p>
                    </div>
                    <button onClick={() => setEditCaixa(c)} className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600">✏️ Editar</button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {editCaixa && (
        <ModalCaixa caixa={editCaixa} consumiveis={consumiveis}
          onClose={() => setEditCaixa(null)}
          onSaved={async () => { setEditCaixa(null); setMsg('Caixa salva.'); await carregar() }} />
      )}
    </div>
  )
}

function ModalCaixa({ caixa, consumiveis, onClose, onSaved }: {
  caixa: Caixa; consumiveis: Consumivel[]; onClose: () => void; onSaved: () => void
}) {
  const [dim,  setDim]  = useState({
    altura_cm: String(caixa.altura_cm), largura_cm: String(caixa.largura_cm),
    comprimento_cm: String(caixa.comprimento_cm), peso_kg: String(caixa.peso_kg),
  })
  const [kit,   setKit]   = useState<ItemKit[]>(caixa.kit_json ?? [])
  const [ativo, setAtivo] = useState(caixa.ativo)
  const [erro,  setErro]  = useState('')
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true); setErro('')
    const res = await fetch('/api/estoque/caixas', {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{
        id: caixa.id, ativo,
        altura_cm: Number(dim.altura_cm), largura_cm: Number(dim.largura_cm),
        comprimento_cm: Number(dim.comprimento_cm), peso_kg: Number(dim.peso_kg),
        kit_json: kit.filter(k => k.consumivel_id && k.quantidade > 0),
      }]),
    })
    if (res.ok) onSaved()
    else { setErro((await res.json().catch(() => ({}))).error ?? 'Erro ao salvar.'); setSalvando(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center">
          <h3 className="font-semibold text-[#19202d]">Caixa {caixa.nome}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 font-bold">✕</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {([['altura_cm', 'Altura (cm)'], ['largura_cm', 'Largura (cm)'], ['comprimento_cm', 'Comprimento (cm)'], ['peso_kg', 'Peso (kg)']] as const).map(([k, l]) => (
            <div key={k}>
              <label className="block text-xs text-gray-500 mb-1">{l}</label>
              <input type="number" step="0.1" min={0} value={dim[k]} onChange={e => setDim(v => ({ ...v, [k]: e.target.value }))} className={`${INPUT} w-full`} />
            </div>
          ))}
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1.5">Kit gasto a cada envio</p>
          <div className="space-y-2">
            {kit.map((item, i) => (
              <div key={i} className="flex gap-2">
                <select value={item.consumivel_id || ''} onChange={e => setKit(k => k.map((x, j) => j === i ? { ...x, consumivel_id: Number(e.target.value) } : x))}
                  className={`${INPUT} flex-1`}>
                  <option value="">Selecione…</option>
                  {consumiveis.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
                <input type="number" min={1} step={1} value={item.quantidade}
                  onChange={e => setKit(k => k.map((x, j) => j === i ? { ...x, quantidade: Number(e.target.value) } : x))}
                  className={`${INPUT} w-20`} />
                <button onClick={() => setKit(k => k.filter((_, j) => j !== i))} className="text-red-500 text-sm px-2">✕</button>
              </div>
            ))}
            <button onClick={() => setKit(k => [...k, { consumivel_id: 0, quantidade: 1 }])} className="text-xs text-[#8a6e36] font-semibold">+ Adicionar item</button>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} /> Ativa
        </label>
        {erro && <p className="text-sm text-red-600">{erro}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg border border-gray-200 text-gray-600">Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="bg-[#19202d] text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-40">
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
