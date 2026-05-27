'use client'

import { useState, useEffect } from 'react'

interface Feriado {
  id: number
  data: string
  nome: string
  tipo: 'nacional' | 'estadual' | 'municipal'
}

const TIPO_BADGE: Record<string, string> = {
  nacional:   'bg-blue-100 text-blue-700',
  estadual:   'bg-purple-100 text-purple-700',
  municipal:  'bg-amber-100 text-amber-700',
}

function fmtData(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export default function FeriadosPage() {
  const [feriados,   setFeriados]   = useState<Feriado[]>([])
  const [horarioFim, setHorarioFim] = useState('17:00')
  const [horarioEdit, setHorarioEdit] = useState('17:00')
  const [loading,    setLoading]    = useState(true)
  const [savingHor,  setSavingHor]  = useState(false)

  // Geração
  const [anoIni, setAnoIni] = useState(new Date().getFullYear())
  const [anoFim, setAnoFim] = useState(new Date().getFullYear() + 5)
  const [gerando, setGerando] = useState(false)
  const [msgGerar, setMsgGerar] = useState('')

  // Adição manual
  const [novaData, setNovaData]  = useState('')
  const [novoNome, setNovoNome]  = useState('')
  const [novoTipo, setNovoTipo]  = useState<'nacional' | 'estadual' | 'municipal'>('municipal')
  const [adicionando, setAdicionando] = useState(false)

  const [deletando, setDeletando] = useState<number | null>(null)
  const [erro, setErro] = useState('')

  async function carregar() {
    setLoading(true)
    const [resF, resH] = await Promise.all([
      fetch('/api/feriados').then(r => r.ok ? r.json() : []),
      fetch('/api/feriados/horario').then(r => r.ok ? r.json() : { horario_fim: '17:00' }),
    ])
    setFeriados(resF)
    setHorarioFim(resH.horario_fim)
    setHorarioEdit(resH.horario_fim)
    setLoading(false)
  }

  useEffect(() => { carregar() }, [])

  async function salvarHorario() {
    setSavingHor(true)
    const res = await fetch('/api/feriados/horario', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ horario_fim: horarioEdit }),
    })
    if (res.ok) setHorarioFim(horarioEdit)
    else setErro('Erro ao salvar horário.')
    setSavingHor(false)
  }

  async function gerar() {
    if (anoIni > anoFim) return
    setGerando(true); setMsgGerar('')
    const res = await fetch('/api/feriados/gerar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ano_inicio: anoIni, ano_fim: anoFim }),
    })
    if (res.ok) {
      const d = await res.json()
      setMsgGerar(`${d.gerados} feriados gerados para ${anoIni}–${anoFim}.`)
      await carregar()
    } else {
      const d = await res.json()
      setErro(d.error ?? 'Erro ao gerar.')
    }
    setGerando(false)
  }

  async function adicionar() {
    if (!novaData || !novoNome.trim()) return
    setAdicionando(true)
    const res = await fetch('/api/feriados', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: novaData, nome: novoNome.trim(), tipo: novoTipo }),
    })
    if (res.ok) {
      setNovaData(''); setNovoNome('')
      await carregar()
    } else {
      const d = await res.json()
      setErro(d.error ?? 'Erro ao adicionar.')
    }
    setAdicionando(false)
  }

  async function deletar(id: number) {
    setDeletando(id)
    const res = await fetch(`/api/feriados/${id}`, { method: 'DELETE' })
    if (res.ok) setFeriados(prev => prev.filter(f => f.id !== id))
    else setErro('Erro ao remover.')
    setDeletando(null)
  }

  const INPUT = 'border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36] bg-white'

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[#19202d]">Feriados e Horário Especial</h1>
        <p className="text-sm text-gray-500 mt-1">Gerencie feriados e o horário de encerramento do atendimento comercial.</p>
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex justify-between">
          {erro}
          <button onClick={() => setErro('')} className="ml-4 font-bold">✕</button>
        </div>
      )}

      {/* Horário comercial */}
      <section className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
        <h2 className="font-semibold text-[#19202d]">Horário de encerramento comercial</h2>
        <p className="text-xs text-gray-500">Atendimentos que terminam após este horário são cobrados como fora do horário comercial.</p>
        <div className="flex items-center gap-3">
          <input
            type="time"
            value={horarioEdit}
            onChange={e => setHorarioEdit(e.target.value)}
            className={INPUT}
          />
          <button
            onClick={salvarHorario}
            disabled={savingHor || horarioEdit === horarioFim}
            className="bg-[#19202d] text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-40 transition"
          >
            {savingHor ? 'Salvando…' : 'Salvar'}
          </button>
          {horarioFim && <span className="text-xs text-gray-400">Atual: {horarioFim}</span>}
        </div>
      </section>

      {/* Gerar feriados */}
      <section className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
        <h2 className="font-semibold text-[#19202d]">Gerar feriados automáticos</h2>
        <p className="text-xs text-gray-500">
          Gera todos os feriados nacionais, estaduais (RJ) e municipais de Volta Redonda para o intervalo de anos selecionado.
          Feriados já existentes são ignorados.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">De</label>
            <input type="number" value={anoIni} onChange={e => setAnoIni(Number(e.target.value))}
              min={2024} max={2060} className={`${INPUT} w-24`} />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">até</label>
            <input type="number" value={anoFim} onChange={e => setAnoFim(Number(e.target.value))}
              min={2024} max={2060} className={`${INPUT} w-24`} />
          </div>
          <button
            onClick={gerar}
            disabled={gerando || anoIni > anoFim}
            className="bg-[#8a6e36] text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-40 transition"
          >
            {gerando ? 'Gerando…' : 'Gerar'}
          </button>
        </div>
        {msgGerar && <p className="text-sm text-green-700 font-medium">✓ {msgGerar}</p>}
      </section>

      {/* Adicionar manualmente */}
      <section className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
        <h2 className="font-semibold text-[#19202d]">Adicionar feriado manualmente</h2>
        <div className="flex gap-2 flex-wrap items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Data</label>
            <input type="date" value={novaData} onChange={e => setNovaData(e.target.value)} className={INPUT} />
          </div>
          <div className="flex-1 min-w-40">
            <label className="block text-xs text-gray-500 mb-1">Nome</label>
            <input type="text" value={novoNome} onChange={e => setNovoNome(e.target.value)}
              placeholder="Ex: Feriado municipal" className={`${INPUT} w-full`} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tipo</label>
            <select value={novoTipo} onChange={e => setNovoTipo(e.target.value as typeof novoTipo)} className={INPUT}>
              <option value="nacional">Nacional</option>
              <option value="estadual">Estadual</option>
              <option value="municipal">Municipal</option>
            </select>
          </div>
          <button
            onClick={adicionar}
            disabled={adicionando || !novaData || !novoNome.trim()}
            className="bg-[#19202d] text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-40 transition"
          >
            {adicionando ? 'Adicionando…' : 'Adicionar'}
          </button>
        </div>
      </section>

      {/* Lista de feriados */}
      <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
          <h2 className="font-semibold text-[#19202d]">Próximos feriados</h2>
          <span className="text-xs text-gray-400">{feriados.length} feriados</span>
        </div>

        {loading ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">Carregando…</div>
        ) : feriados.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">
            Nenhum feriado cadastrado. Use &quot;Gerar feriados automáticos&quot; para começar.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {feriados.map(f => (
              <li key={f.id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono text-gray-500 w-20 shrink-0">{fmtData(f.data)}</span>
                  <span className="text-sm text-[#19202d]">{f.nome}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TIPO_BADGE[f.tipo] ?? 'bg-gray-100 text-gray-600'}`}>
                    {f.tipo}
                  </span>
                </div>
                <button
                  onClick={() => deletar(f.id)}
                  disabled={deletando === f.id}
                  className="text-xs text-red-400 hover:text-red-600 transition disabled:opacity-40 ml-2 shrink-0"
                >
                  {deletando === f.id ? '…' : 'Remover'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
