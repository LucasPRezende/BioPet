'use client'

import { useState, useEffect, useCallback } from 'react'
import { ESPECIES_REF } from '@/lib/especies'
import { PARAMETROS_URINA, textoReferencia } from '@/lib/urinalise'

interface Ref { parametro: string; valor_min: number | null; valor_max: number | null }
type Edicao = Record<string, { min: string; max: string }>

const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#8a6e36] bg-white'

function paraEdicao(refs: Ref[]): Edicao {
  const out: Edicao = {}
  for (const p of PARAMETROS_URINA) {
    const r = refs.find(x => x.parametro === p.codigo)
    out[p.codigo] = {
      min: r?.valor_min !== null && r?.valor_min !== undefined ? String(Number(r.valor_min)) : '',
      max: r?.valor_max !== null && r?.valor_max !== undefined ? String(Number(r.valor_max)) : '',
    }
  }
  return out
}

const num = (s: string) => s.trim() === '' || isNaN(Number(s)) ? null : Number(s)

export default function UrinaliseReferenciasPage() {
  const [especie, setEspecie] = useState('cao')
  const [edicao,  setEdicao]  = useState<Edicao>({})
  const [loading, setLoading] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [msg,     setMsg]     = useState<{ ok: boolean; texto: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setMsg(null)
    const refs = await fetch(`/api/urinalise/referencia?especie=${especie}`)
      .then(r => r.ok ? r.json() : { referencias: [] })
      .then(d => (d.referencias ?? []) as Ref[])
    setEdicao(paraEdicao(refs))
    setLoading(false)
  }, [especie])

  useEffect(() => { load() }, [load])

  function set(codigo: string, campo: 'min' | 'max', valor: string) {
    setEdicao(prev => ({ ...prev, [codigo]: { ...prev[codigo], [campo]: valor.replace(',', '.') } }))
  }

  async function salvar() {
    setSaving(true)
    setMsg(null)
    const referencias = PARAMETROS_URINA.map(p => ({
      parametro: p.codigo,
      valor_min: num(edicao[p.codigo]?.min ?? ''),
      valor_max: num(edicao[p.codigo]?.max ?? ''),
    }))
    const res = await fetch('/api/urinalise/referencia', {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ especie, referencias }),
    })
    if (res.ok) {
      await load()
      setMsg({ ok: true, texto: 'Referências salvas.' })
    } else {
      const d = await res.json().catch(() => ({}))
      setMsg({ ok: false, texto: d.error ?? 'Erro ao salvar.' })
    }
    setSaving(false)
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#19202d]">Valores de Referência — Urinálise</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Parte química (fita). Resultado acima do máximo ou abaixo do mínimo sai como &quot;Alterado&quot; no laudo.
          Negativo/Normal conta como 0 e Positivo como 1 — máximo 0 imprime &quot;Negativo&quot; na referência.
          Mínimo e máximo vazios: o laudo mostra só o valor.
        </p>
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden mb-5">
        <div className="h-1 bg-gold-stripe" />
        <div className="p-4 flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Espécie</label>
            <select value={especie} onChange={e => setEspecie(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
              {ESPECIES_REF.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
            </select>
          </div>
          <button onClick={salvar} disabled={saving || loading}
            className="ml-auto bg-[#c4a35a] hover:bg-[#a88a47] disabled:opacity-50 text-white font-bold px-5 py-2.5 rounded-lg text-sm transition">
            {saving ? 'Salvando...' : 'Salvar referências'}
          </button>
        </div>
        {msg && (
          <p className={`mx-4 mb-4 text-sm rounded-lg px-3 py-2 ${msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
            {msg.texto}
          </p>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Carregando...</p>
      ) : (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden mb-4">
          <div className="divide-y">
            <div className="grid grid-cols-[1fr_100px_100px_120px] gap-3 px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              <span>Parâmetro</span><span className="text-right">Mínimo</span><span className="text-right">Máximo</span><span className="text-right">No laudo</span>
            </div>
            {PARAMETROS_URINA.map(p => {
              const e = edicao[p.codigo] ?? { min: '', max: '' }
              return (
                <div key={p.codigo} className="grid grid-cols-[1fr_100px_100px_120px] gap-3 px-4 py-1.5 items-center">
                  <span className="text-sm text-[#19202d]">
                    {p.nome}
                    {p.unidade && <span className="text-xs text-gray-400"> ({p.unidade})</span>}
                    {p.so14 && <span className="ml-1.5 text-[10px] font-bold text-indigo-600 bg-indigo-50 rounded px-1.5 py-0.5">só 14G</span>}
                  </span>
                  <input inputMode="decimal" value={e.min} onChange={ev => set(p.codigo, 'min', ev.target.value)} className={INPUT} />
                  <input inputMode="decimal" value={e.max} onChange={ev => set(p.codigo, 'max', ev.target.value)} className={INPUT} />
                  <span className="text-xs text-gray-500 text-right font-mono">
                    {textoReferencia({ parametro: p.codigo, valor_min: num(e.min), valor_max: num(e.max) }, p.codigo)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
