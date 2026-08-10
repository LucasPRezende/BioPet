'use client'

import { useState, useEffect, useMemo, useRef } from 'react'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Laboratorio {
  id:   number
  nome: string
}

interface LabExame {
  id:                 number
  laboratorio_id:     number
  codigo:             string | null
  nome:               string
  categoria:          string | null
  cor_tubo:           string | null
  material_tipo:      string | null
  especies:           string | null
  prazo_dias_uteis:   number | null
  custo:              number | null
  preco_cliente:      number | null
  preco_parceiro:     number | null
  is_combo:           boolean
  sob_consulta:       boolean
  ativo:              boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBRL(n: number | null) {
  if (n === null) return '—'
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function normalizar(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

// ── Modal de importação de Excel ──────────────────────────────────────────────

interface PreviewImport {
  novos: number
  atualizados: number
  iguais: number
  ausentes_no_excel: number
  erros: string[]
  amostra_novos: string[]
  amostra_atualizados: string[]
  amostra_ausentes: string[]
}

function ImportarModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [arquivo,  setArquivo]  = useState<File | null>(null)
  const [preview,  setPreview]  = useState<PreviewImport | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [erro,     setErro]     = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function enviar(confirmar: boolean) {
    if (!arquivo) return
    setLoading(true); setErro('')
    const fd = new FormData()
    fd.append('arquivo', arquivo)
    if (confirmar) fd.append('confirmar', '1')
    const res = await fetch('/api/labs/exames/importar', { method: 'POST', body: fd })
    const data = await res.json()
    if (!res.ok) {
      setErro(data.error ?? 'Erro ao importar.')
    } else if (data.aplicado) {
      onImported()
      return
    } else {
      setPreview(data)
    }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[85vh] flex flex-col">
        <div className="bg-[#19202d] px-6 py-4 flex items-center justify-between shrink-0">
          <h3 className="text-white font-bold text-sm">Importar catálogo do Excel</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto">
          {!preview && (
            <>
              <p className="text-xs text-gray-500">
                Uma aba por laboratório (TECSA, HORMONALLE...). As colunas são reconhecidas pelo
                cabeçalho — use o arquivo do botão <b>Exportar Excel</b> como modelo. Antes de aplicar,
                você vê um resumo do que muda.
              </p>
              <input
                ref={inputRef} type="file" accept=".xlsx"
                onChange={e => setArquivo(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[#19202d] file:text-white file:text-xs file:font-semibold hover:file:bg-[#232d3f]"
              />
            </>
          )}

          {preview && (
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="bg-green-50 border border-green-200 rounded-lg py-2">
                  <div className="text-lg font-bold text-green-700">{preview.novos}</div>
                  <div className="text-[10px] text-green-700 uppercase font-bold">Novos</div>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg py-2">
                  <div className="text-lg font-bold text-amber-700">{preview.atualizados}</div>
                  <div className="text-[10px] text-amber-700 uppercase font-bold">Alterados</div>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg py-2">
                  <div className="text-lg font-bold text-gray-500">{preview.iguais}</div>
                  <div className="text-[10px] text-gray-500 uppercase font-bold">Iguais</div>
                </div>
                <div className="bg-orange-50 border border-orange-200 rounded-lg py-2">
                  <div className="text-lg font-bold text-orange-600">{preview.ausentes_no_excel}</div>
                  <div className="text-[10px] text-orange-600 uppercase font-bold">Fora do Excel</div>
                </div>
              </div>
              {preview.amostra_atualizados.length > 0 && (
                <Amostra titulo="Alterados" itens={preview.amostra_atualizados} total={preview.atualizados} />
              )}
              {preview.amostra_novos.length > 0 && (
                <Amostra titulo="Novos" itens={preview.amostra_novos} total={preview.novos} />
              )}
              {preview.amostra_ausentes.length > 0 && (
                <Amostra titulo="No banco mas fora do Excel (nada será apagado)" itens={preview.amostra_ausentes} total={preview.ausentes_no_excel} />
              )}
              {preview.erros.length > 0 && (
                <Amostra titulo="Avisos" itens={preview.erros} total={preview.erros.length} tom="red" />
              )}
            </div>
          )}

          {erro && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-500 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition">
              Cancelar
            </button>
            {!preview ? (
              <button type="button" onClick={() => enviar(false)} disabled={!arquivo || loading}
                className="flex-1 bg-[#19202d] hover:bg-[#232d3f] text-white font-semibold py-2.5 rounded-lg text-sm transition disabled:opacity-40">
                {loading ? 'Analisando...' : 'Analisar planilha'}
              </button>
            ) : (
              <button type="button" onClick={() => enviar(true)}
                disabled={loading || (preview.novos === 0 && preview.atualizados === 0)}
                className="flex-1 bg-[#19202d] hover:bg-[#232d3f] text-white font-semibold py-2.5 rounded-lg text-sm transition disabled:opacity-40">
                {loading ? 'Aplicando...' : `Aplicar (${preview.novos + preview.atualizados})`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Amostra({ titulo, itens, total, tom }: { titulo: string; itens: string[]; total: number; tom?: 'red' }) {
  return (
    <div>
      <p className={`text-[10px] font-bold uppercase tracking-wide mb-1 ${tom === 'red' ? 'text-red-500' : 'text-gray-400'}`}>
        {titulo}
      </p>
      <ul className={`text-[11px] rounded-lg border px-3 py-2 space-y-0.5 max-h-32 overflow-y-auto ${tom === 'red' ? 'text-red-700 bg-red-50 border-red-200' : 'text-gray-600 bg-gray-50 border-gray-100'}`}>
        {itens.map((s, i) => <li key={i}>{s}</li>)}
        {total > itens.length && <li className="italic">... e mais {total - itens.length}</li>}
      </ul>
    </div>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function LabsPage() {
  const [labs,    setLabs]    = useState<Laboratorio[]>([])
  const [exames,  setExames]  = useState<LabExame[]>([])
  const [loading, setLoading] = useState(true)
  const [erro,    setErro]    = useState('')

  // Filtros
  const [labFiltro,  setLabFiltro]  = useState<number | 0>(0)
  const [catFiltro,  setCatFiltro]  = useState('')
  const [busca,      setBusca]      = useState('')
  const [soAtivos,   setSoAtivos]   = useState(false)

  // Edições pendentes: id → { preco_parceiro?, ativo? }
  const [edits,    setEdits]    = useState<Record<number, { preco_parceiro?: string; ativo?: boolean }>>({})
  const [salvando, setSalvando] = useState(false)
  const [okMsg,    setOkMsg]    = useState('')
  const [importarAberto, setImportarAberto] = useState(false)

  function recarregar() {
    return fetch('/api/labs/exames')
      .then(r => r.json())
      .then(d => {
        if (d.error) { setErro(d.error); return }
        setLabs(d.laboratorios)
        setExames(d.exames)
      })
      .catch(() => setErro('Erro ao carregar o catálogo.'))
  }

  useEffect(() => {
    recarregar().finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const categorias = useMemo(() => {
    const set = new Set<string>()
    for (const e of exames) {
      if (labFiltro && e.laboratorio_id !== labFiltro) continue
      if (e.categoria) set.add(e.categoria)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [exames, labFiltro])

  const visiveis = useMemo(() => {
    const q = normalizar(busca.trim())
    return exames.filter(e => {
      if (labFiltro && e.laboratorio_id !== labFiltro) return false
      if (catFiltro && e.categoria !== catFiltro) return false
      if (soAtivos && !e.ativo) return false
      if (q && !normalizar(`${e.codigo ?? ''} ${e.nome}`).includes(q)) return false
      return true
    })
  }, [exames, labFiltro, catFiltro, busca, soAtivos])

  const labNome = (id: number) => labs.find(l => l.id === id)?.nome ?? '?'

  function setEdit(id: number, patch: { preco_parceiro?: string; ativo?: boolean }) {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))
    setOkMsg('')
  }

  const pendentes = Object.keys(edits).length

  async function salvar() {
    setSalvando(true); setErro(''); setOkMsg('')
    const body = Object.entries(edits).map(([id, e]) => {
      const item: { id: number; preco_parceiro?: number | null; ativo?: boolean } = { id: Number(id) }
      if (e.preco_parceiro !== undefined) {
        item.preco_parceiro = e.preco_parceiro === '' ? null : parseFloat(e.preco_parceiro)
      }
      if (e.ativo !== undefined) item.ativo = e.ativo
      return item
    })
    const res = await fetch('/api/labs/exames', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) {
      setErro(data.error ?? 'Erro ao salvar.')
    } else {
      setExames(prev => prev.map(e => {
        const ed = edits[e.id]
        if (!ed) return e
        return {
          ...e,
          preco_parceiro: ed.preco_parceiro !== undefined
            ? (ed.preco_parceiro === '' ? null : parseFloat(ed.preco_parceiro))
            : e.preco_parceiro,
          ativo: ed.ativo !== undefined ? ed.ativo : e.ativo,
        }
      }))
      setEdits({})
      setOkMsg('Alterações salvas.')
    }
    setSalvando(false)
  }

  if (loading) {
    return <div className="p-8 text-sm text-gray-400">Carregando catálogo...</div>
  }

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#19202d]">Labs Parceiros — Catálogo</h1>
          <p className="text-sm text-gray-400">
            {exames.length} exames importados · preço parceiro em branco = coluna a definir
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="/api/labs/exames/exportar"
            className="border border-gray-200 text-gray-600 font-semibold px-4 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition"
          >
            ⬇ Exportar Excel
          </a>
          <button
            onClick={() => setImportarAberto(true)}
            className="border border-gray-200 text-gray-600 font-semibold px-4 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition"
          >
            ⬆ Importar Excel
          </button>
          <button
            onClick={salvar}
            disabled={pendentes === 0 || salvando}
            className="bg-[#19202d] hover:bg-[#232d3f] text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition disabled:opacity-40"
          >
            {salvando ? 'Salvando...' : pendentes > 0 ? `Salvar (${pendentes})` : 'Salvar'}
          </button>
        </div>
      </div>

      {importarAberto && (
        <ImportarModal
          onClose={() => setImportarAberto(false)}
          onImported={() => { setImportarAberto(false); setOkMsg('Catálogo atualizado a partir do Excel.'); recarregar() }}
        />
      )}

      {erro  && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{erro}</p>}
      {okMsg && <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-4">{okMsg}</p>}

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={labFiltro}
          onChange={e => { setLabFiltro(Number(e.target.value)); setCatFiltro('') }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#8a6e36]"
        >
          <option value={0}>Todos os laboratórios</option>
          {labs.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
        </select>
        <select
          value={catFiltro}
          onChange={e => setCatFiltro(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#8a6e36]"
        >
          <option value="">Todas as categorias</option>
          {categorias.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input
          type="text"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por nome ou código..."
          className="flex-1 min-w-[200px] border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36]"
        />
        <label className="flex items-center gap-2 text-sm text-gray-500 select-none">
          <input type="checkbox" checked={soAtivos} onChange={e => setSoAtivos(e.target.checked)}
            className="rounded border-gray-300" />
          Só ativos
        </label>
      </div>

      <p className="text-xs text-gray-400 mb-2">{visiveis.length} exame(s)</p>

      {/* Tabela */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wide border-b border-gray-100">
              <th className="px-4 py-3">Lab</th>
              <th className="px-2 py-3">Cód.</th>
              <th className="px-2 py-3">Exame</th>
              <th className="px-2 py-3">Tubo</th>
              <th className="px-2 py-3">Prazo</th>
              <th className="px-2 py-3 text-right">Custo</th>
              <th className="px-2 py-3 text-right">Cliente (+40%)</th>
              <th className="px-2 py-3 text-right">Parceiro</th>
              <th className="px-4 py-3 text-center">Ativo</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map(e => {
              const ed = edits[e.id]
              const precoParceiro = ed?.preco_parceiro !== undefined
                ? ed.preco_parceiro
                : (e.preco_parceiro !== null ? String(e.preco_parceiro) : '')
              const ativo = ed?.ativo !== undefined ? ed.ativo : e.ativo
              return (
                <tr key={e.id} className={`border-b border-gray-50 hover:bg-gray-50/60 ${!ativo ? 'opacity-45' : ''}`}>
                  <td className="px-4 py-2 text-xs text-gray-400 whitespace-nowrap">{labNome(e.laboratorio_id)}</td>
                  <td className="px-2 py-2 text-xs text-gray-400">{e.codigo ?? '—'}</td>
                  <td className="px-2 py-2">
                    <div className="font-medium text-[#19202d] leading-tight">
                      {e.nome}
                      {e.is_combo && (
                        <span className="ml-1.5 text-[9px] font-bold text-[#8a6e36] bg-[#8a6e36]/10 rounded px-1 py-0.5 align-middle">COMBO</span>
                      )}
                      {e.sob_consulta && (
                        <span className="ml-1.5 text-[9px] font-bold text-orange-600 bg-orange-50 rounded px-1 py-0.5 align-middle">SOB CONSULTA</span>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-400 leading-tight">
                      {e.categoria}{e.especies ? ` · ${e.especies}` : ''}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-xs text-gray-500 max-w-[130px]">{e.cor_tubo ?? '—'}</td>
                  <td className="px-2 py-2 text-xs text-gray-500 whitespace-nowrap">
                    {e.prazo_dias_uteis !== null ? `${e.prazo_dias_uteis}d` : '—'}
                  </td>
                  <td className="px-2 py-2 text-right text-xs text-gray-500 whitespace-nowrap">{fmtBRL(e.custo)}</td>
                  <td className="px-2 py-2 text-right text-xs text-gray-700 whitespace-nowrap">{fmtBRL(e.preco_cliente)}</td>
                  <td className="px-2 py-2 text-right">
                    <input
                      type="number" step="0.01" min="0"
                      value={precoParceiro}
                      onChange={ev => setEdit(e.id, { preco_parceiro: ev.target.value })}
                      placeholder="—"
                      className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-right focus:outline-none focus:ring-2 focus:ring-[#8a6e36]"
                    />
                  </td>
                  <td className="px-4 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={ativo}
                      onChange={ev => setEdit(e.id, { ativo: ev.target.checked })}
                      className="rounded border-gray-300"
                    />
                  </td>
                </tr>
              )
            })}
            {visiveis.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-400">
                {exames.length === 0
                  ? 'Catálogo vazio — rode a migration v39 e o importador (scripts/import-lab-exames.ts).'
                  : 'Nenhum exame com esses filtros.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
