'use client'

import { useEffect, useMemo, useState } from 'react'

interface Item { nome: string; pix: number }
interface Catalogo { exames: Item[]; bioquimica: Item[]; testes_rapidos: Item[]; pcr: Item[] }
type Grupo = keyof Catalogo

const GRUPOS: { chave: Grupo; titulo: string | null }[] = [
  { chave: 'exames', titulo: null },
  { chave: 'bioquimica', titulo: 'Bioquímica' },
  { chave: 'testes_rapidos', titulo: 'Testes rápidos' },
  { chave: 'pcr', titulo: 'PCR' },
]
const VAZIO: Catalogo = { exames: [], bioquimica: [], testes_rapidos: [], pcr: [] }

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36]'
const LABEL = 'block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1'

export default function OrcamentoPage() {
  const [catalogo, setCatalogo] = useState<Catalogo>(VAZIO)
  const [carregando, setCarregando] = useState(true)
  const [paciente, setPaciente] = useState('')
  const [dias, setDias] = useState('15')
  const [sel, setSel] = useState<Record<Grupo, string[]>>({ exames: [], bioquimica: [], testes_rapidos: [], pcr: [] })
  const [busca, setBusca] = useState('')
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    fetch('/api/orcamento')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setCatalogo({ ...VAZIO, ...d }))
      .catch(() => setErro('Não consegui carregar a tabela de preços.'))
      .finally(() => setCarregando(false))
  }, [])

  const toggle = (g: Grupo, nome: string) =>
    setSel(s => ({ ...s, [g]: s[g].includes(nome) ? s[g].filter(n => n !== nome) : [...s[g], nome] }))

  const q = busca.trim().toLowerCase()
  const visiveis = useMemo(() => {
    const f = (l: Item[]) => l.filter(i => i.nome.toLowerCase().includes(q))
    return { exames: f(catalogo.exames), bioquimica: f(catalogo.bioquimica), testes_rapidos: f(catalogo.testes_rapidos), pcr: f(catalogo.pcr) }
  }, [catalogo, q])
  const total = sel.exames.length + sel.bioquimica.length + sel.testes_rapidos.length + sel.pcr.length

  async function gerar() {
    setErro('')
    if (!paciente.trim()) return setErro('Informe o nome do paciente.')
    if (total === 0) return setErro('Selecione ao menos um exame.')
    setGerando(true)
    try {
      const res = await fetch('/api/orcamento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paciente, ...sel, validade_dias: Number(dias) }),
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
          {GRUPOS.map(({ chave, titulo }) => visiveis[chave].length > 0 && (
            <div key={chave}>
              {titulo && <div className={LABEL}>{titulo}</div>}
              <div className="grid sm:grid-cols-2 gap-2">
                {visiveis[chave].map(i => (
                  <Check key={i.nome} nome={i.nome} preco={i.pix}
                    marcado={sel[chave].includes(i.nome)} onClick={() => toggle(chave, i.nome)} />
                ))}
              </div>
            </div>
          ))}
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
