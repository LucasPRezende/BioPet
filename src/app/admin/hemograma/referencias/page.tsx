'use client'

import { useState, useEffect, useCallback } from 'react'
import { ESPECIES_REF } from '@/lib/especies'
import { PARAMETROS_HEMOGRAMA, GRUPOS_HEMOGRAMA } from '@/lib/hemograma'

interface Ref { parametro: string; valor_min: number | null; valor_max: number | null }
type Edicao = Record<string, { min: string; max: string }>

const FAIXAS = [
  { label: 'Todos',   value: 'todos' },
  { label: 'Filhote', value: 'filhote' },
  { label: 'Adulto',  value: 'adulto' },
  { label: 'Idoso',   value: 'idoso' },
]

const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#8a6e36] bg-white'

function paraEdicao(refs: Ref[]): Edicao {
  const out: Edicao = {}
  for (const p of PARAMETROS_HEMOGRAMA) {
    const r = refs.find(x => x.parametro === p.codigo)
    out[p.codigo] = {
      min: r?.valor_min !== null && r?.valor_min !== undefined ? String(Number(r.valor_min)) : '',
      max: r?.valor_max !== null && r?.valor_max !== undefined ? String(Number(r.valor_max)) : '',
    }
  }
  return out
}

export default function HemogramaReferenciasPage() {
  const [especie,  setEspecie]  = useState('cao')
  const [faixa,    setFaixa]    = useState('todos')
  const [edicao,   setEdicao]   = useState<Edicao>({})
  const [todos,    setTodos]    = useState<Ref[]>([])
  const [loading,  setLoading]  = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [msg,      setMsg]      = useState<{ ok: boolean; texto: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setMsg(null)
    const get = (f: string) => fetch(`/api/hemograma/referencia?especie=${especie}&faixa_etaria=${f}`)
      .then(r => r.ok ? r.json() : { referencias: [] })
      .then(d => (d.referencias ?? []) as Ref[])
    const [atual, base] = await Promise.all([get(faixa), faixa === 'todos' ? Promise.resolve([]) : get('todos')])
    setEdicao(paraEdicao(atual))
    setTodos(base)
    setLoading(false)
  }, [especie, faixa])

  useEffect(() => { load() }, [load])

  function set(codigo: string, campo: 'min' | 'max', valor: string) {
    setEdicao(prev => ({ ...prev, [codigo]: { ...prev[codigo], [campo]: valor.replace(',', '.') } }))
  }

  async function salvar() {
    setSaving(true)
    setMsg(null)
    const referencias = PARAMETROS_HEMOGRAMA.map(p => ({
      parametro: p.codigo,
      valor_min: edicao[p.codigo]?.min ? Number(edicao[p.codigo].min) : null,
      valor_max: edicao[p.codigo]?.max ? Number(edicao[p.codigo].max) : null,
    }))
    const res = await fetch('/api/hemograma/referencia', {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ especie, faixa_etaria: faixa, referencias }),
    })
    if (res.ok) {
      setMsg({ ok: true, texto: 'Referências salvas.' })
      await load()
      setMsg({ ok: true, texto: 'Referências salvas.' })
    } else {
      const d = await res.json().catch(() => ({}))
      setMsg({ ok: false, texto: d.error ?? 'Erro ao salvar.' })
    }
    setSaving(false)
  }

  const placeholder = (codigo: string, campo: 'valor_min' | 'valor_max') => {
    const r = todos.find(x => x.parametro === codigo)
    return r && r[campo] !== null ? String(Number(r[campo])) : ''
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#19202d]">Valores de Referência — Hemograma</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Revise e ajuste os valores com Andreza/Luciana conforme protocolo clínico.
          {faixa !== 'todos' && ' Campos vazios usam o valor de "Todos" (em cinza).'}
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
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Faixa etária</label>
            <select value={faixa} onChange={e => setFaixa(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
              {FAIXAS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
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
      ) : GRUPOS_HEMOGRAMA.map(({ grupo, titulo }) => (
        <div key={grupo} className="bg-white rounded-xl border shadow-sm overflow-hidden mb-4">
          <div className="px-4 py-2.5 bg-gray-50 border-b text-xs font-bold text-[#19202d] uppercase tracking-widest">{titulo}</div>
          <div className="divide-y">
            <div className="grid grid-cols-[1fr_110px_110px] gap-3 px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              <span>Parâmetro</span><span className="text-right">Mínimo</span><span className="text-right">Máximo</span>
            </div>
            {PARAMETROS_HEMOGRAMA.filter(p => p.grupo === grupo).map(p => (
              <div key={p.codigo} className="grid grid-cols-[1fr_110px_110px] gap-3 px-4 py-1.5 items-center">
                <span className="text-sm text-[#19202d]">
                  {p.nome} <span className="text-xs text-gray-400">({p.unidade})</span>
                </span>
                <input inputMode="decimal" value={edicao[p.codigo]?.min ?? ''} placeholder={placeholder(p.codigo, 'valor_min')}
                  onChange={e => set(p.codigo, 'min', e.target.value)} className={INPUT} />
                <input inputMode="decimal" value={edicao[p.codigo]?.max ?? ''} placeholder={placeholder(p.codigo, 'valor_max')}
                  onChange={e => set(p.codigo, 'max', e.target.value)} className={INPUT} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
