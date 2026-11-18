'use client'

import { useEffect, useMemo, useState } from 'react'

interface ExamePreco {
  tipo: string
  varia_por_horario: boolean
  pix?: number | null
  horario_comercial?: { pix: number | null }
}
interface Bio { nome: string; pix: number | null }

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36]'
const LABEL = 'block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1'

export default function OrcamentoPage() {
  const [exames, setExames] = useState<ExamePreco[]>([])
  const [bio, setBio] = useState<Bio[]>([])
  const [carregando, setCarregando] = useState(true)
  const [paciente, setPaciente] = useState('')
  const [dias, setDias] = useState('15')
  const [selExames, setSelExames] = useState<string[]>([])
  const [selBio, setSelBio] = useState<string[]>([])
  const [busca, setBusca] = useState('')
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    fetch('/api/agente/precos')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => {
        setExames((d.exames ?? []) as ExamePreco[])
        setBio((d.bioquimica?.exames ?? []) as Bio[])
      })
      .catch(() => setErro('Não consegui carregar a tabela de preços.'))
      .finally(() => setCarregando(false))
  }, [])

  const toggle = (lista: string[], set: (v: string[]) => void, nome: string) =>
    set(lista.includes(nome) ? lista.filter(n => n !== nome) : [...lista, nome])

  const q = busca.trim().toLowerCase()
  const examesVisiveis = useMemo(
    () => exames.filter(e => (e.varia_por_horario ? e.horario_comercial?.pix : e.pix) && e.tipo.toLowerCase().includes(q)),
    [exames, q],
  )
  const bioVisiveis = useMemo(() => bio.filter(b => b.nome.toLowerCase().includes(q)), [bio, q])
  const total = selExames.length + selBio.length

  async function gerar() {
    setErro('')
    if (!paciente.trim()) return setErro('Informe o nome do paciente.')
    if (total === 0) return setErro('Selecione ao menos um exame.')
    setGerando(true)
    try {
      const res = await fetch('/api/orcamento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paciente, exames: selExames, bioquimica: selBio, validade_dias: Number(dias) }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? 'Erro ao gerar o orçamento.')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Orçamento - ${paciente.trim()}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao gerar o orçamento.')
    } finally {
      setGerando(false)
    }
  }

  const Check = ({ nome, preco, marcado, onClick }: { nome: string; preco: number | null | undefined; marcado: boolean; onClick: () => void }) => (
    <label className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg border cursor-pointer text-sm ${marcado ? 'border-[#8a6e36] bg-[#faf6ec]' : 'border-gray-100 hover:bg-gray-50'}`}>
      <span className="flex items-center gap-2">
        <input type="checkbox" checked={marcado} onChange={onClick} />
        {nome}
      </span>
      {preco != null && <span className="text-gray-400 text-xs whitespace-nowrap">{brl(Number(preco))}</span>}
    </label>
  )

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6">
      <h1 className="text-xl font-bold text-[#19202d]">Orçamento</h1>
      <p className="text-sm text-gray-500 mb-5">Gera o PDF com valor no PIX e no cartão (particular). Não cria agendamento.</p>

      <div className="grid sm:grid-cols-[1fr_140px] gap-3 mb-4">
        <div>
          <label className={LABEL}>Paciente</label>
          <input className={INPUT} value={paciente} onChange={e => setPaciente(e.target.value)} placeholder="Nome do pet" />
        </div>
        <div>
          <label className={LABEL}>Validade (dias)</label>
          <input className={INPUT} type="number" min={1} max={90} value={dias} onChange={e => setDias(e.target.value)} />
        </div>
      </div>

      <label className={LABEL}>Exames</label>
      <input className={`${INPUT} mb-3`} value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar exame…" />

      {carregando ? (
        <p className="text-sm text-gray-400">Carregando…</p>
      ) : (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-2">
            {examesVisiveis.map(e => (
              <Check key={e.tipo} nome={e.tipo} preco={e.varia_por_horario ? e.horario_comercial?.pix : e.pix}
                marcado={selExames.includes(e.tipo)} onClick={() => toggle(selExames, setSelExames, e.tipo)} />
            ))}
          </div>
          {bioVisiveis.length > 0 && (
            <>
              <div className={LABEL}>Bioquímica</div>
              <div className="grid sm:grid-cols-2 gap-2">
                {bioVisiveis.map(b => (
                  <Check key={b.nome} nome={b.nome} preco={b.pix}
                    marcado={selBio.includes(b.nome)} onClick={() => toggle(selBio, setSelBio, b.nome)} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {erro && <p className="mt-4 text-sm text-red-600">{erro}</p>}

      <div className="sticky bottom-0 bg-white/90 backdrop-blur mt-6 py-3 flex items-center justify-between border-t border-gray-100">
        <span className="text-sm text-gray-500">{total} exame{total === 1 ? '' : 's'} selecionado{total === 1 ? '' : 's'}</span>
        <button onClick={gerar} disabled={gerando}
          className="bg-[#19202d] text-white text-sm font-semibold px-5 py-2.5 rounded-lg disabled:opacity-50">
          {gerando ? 'Gerando…' : 'Gerar PDF'}
        </button>
      </div>
    </div>
  )
}
