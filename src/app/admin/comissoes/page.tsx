'use client'

import { useState, useEffect, useCallback } from 'react'


// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Comissao {
  id:                       number
  tipo_exame:               string
  preco_exame:              number
  custo_exame:              number
  valor_comissao:           number
  varia_por_horario:        boolean
  preco_pix_comercial:      number | null
  preco_cartao_comercial:   number | null
  preco_pix_fora_horario:   number | null
  preco_cartao_fora_horario: number | null
  duracao_minutos:          number | null
  observacao:               string | null
}

interface BioquimicaExame {
  id:          number
  nome:        string
  codigo:      string | null
  preco_pix:   number
  preco_cartao: number
  ativo:       boolean
  ordem:       number
}

type EditRow = {
  preco_exame:               string
  custo_exame:               string
  valor_comissao:            string
  varia_por_horario:         boolean
  preco_pix_comercial:       string
  preco_cartao_comercial:    string
  preco_pix_fora_horario:    string
  preco_cartao_fora_horario: string
  duracao_minutos:           string
  observacao:                string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const N = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#8a6e36]'
const T = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36]'

function fmtBRL(n: number) {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function p(s: string) { return parseFloat(s) || 0 }

function NumInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">{label}</label>
      <input type="number" step="0.01" min="0" value={value} onChange={e => onChange(e.target.value)} className={N} />
    </div>
  )
}

// ── Modal novo tipo de exame (exames gerais) ──────────────────────────────────

function NovoTipoModal({ onClose, onCreated }: { onClose: () => void; onCreated: (c: Comissao) => void }) {
  const [nome,    setNome]    = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError('')
    const res = await fetch('/api/comissoes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo_exame: nome.trim(), preco_exame: 0, custo_exame: 0, valor_comissao: 0 }),
    })
    const data = await res.json()
    if (res.ok) { onCreated(data) }
    else { setError(data.error ?? 'Erro ao criar.') }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="bg-[#19202d] px-6 py-4 flex items-center justify-between">
          <h3 className="text-white font-bold text-sm">Novo Tipo de Exame</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Nome *</label>
            <input type="text" value={nome} onChange={e => setNome(e.target.value)}
              placeholder="Ex: Tomografia" required autoFocus
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36]" />
          </div>
          <p className="text-xs text-gray-400">Os preços podem ser configurados após a criação.</p>
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-500 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 bg-[#19202d] hover:bg-[#232d3f] text-white font-semibold py-2.5 rounded-lg text-sm transition disabled:opacity-60">
              {loading ? 'Criando...' : 'Criar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Modal novo sub-exame de bioquímica ────────────────────────────────────────

function NovoBioModal({ onClose, onCreated, nextOrdem }: {
  onClose:    () => void
  onCreated:  (e: BioquimicaExame) => void
  nextOrdem:  number
}) {
  const [nome,        setNome]        = useState('')
  const [codigo,      setCodigo]      = useState('')
  const [precoPix,    setPrecoPix]    = useState('0')
  const [precoCartao, setPrecoCartao] = useState('0')
  const [ordem,       setOrdem]       = useState(String(nextOrdem))
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError('')
    const res = await fetch('/api/comissoes/bioquimica', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome:        nome.trim(),
        codigo:      codigo.trim() || null,
        preco_pix:   parseFloat(precoPix)    || 0,
        preco_cartao: parseFloat(precoCartao) || 0,
        ordem:       parseInt(ordem)         || nextOrdem,
      }),
    })
    const data = await res.json()
    if (res.ok) { onCreated(data) }
    else { setError(data.error ?? 'Erro ao criar.') }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="bg-[#19202d] px-6 py-4 flex items-center justify-between">
          <h3 className="text-white font-bold text-sm">Novo Sub-Exame de Bioquímica</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Nome *</label>
            <input type="text" value={nome} onChange={e => setNome(e.target.value)}
              placeholder="Ex: TGP (ALT)" required autoFocus
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36]" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Código (opcional)</label>
            <input type="text" value={codigo} onChange={e => setCodigo(e.target.value)}
              placeholder="Ex: TGP, GLIC"
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumInput label="Preço Pix (R$)"    value={precoPix}    onChange={setPrecoPix} />
            <NumInput label="Preço Cartão (R$)" value={precoCartao} onChange={setPrecoCartao} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Ordem de exibição</label>
            <input type="number" min="0" value={ordem} onChange={e => setOrdem(e.target.value)}
              className={N} />
          </div>
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-500 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 bg-[#19202d] hover:bg-[#232d3f] text-white font-semibold py-2.5 rounded-lg text-sm transition disabled:opacity-60">
              {loading ? 'Criando...' : 'Criar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Seção Bioquímica ──────────────────────────────────────────────────────────

function BioquimicaSection() {
  const [exames,    setExames]    = useState<BioquimicaExame[]>([])
  const [loading,   setLoading]   = useState(true)
  const [novoModal, setNovoModal] = useState(false)
  const [saving,    setSaving]    = useState<Set<number>>(new Set())
  const [editCell,  setEditCell]  = useState<{ id: number; field: 'preco_pix' | 'preco_cartao' } | null>(null)
  const [editVal,   setEditVal]   = useState('')

  const fetchExames = useCallback(async () => {
    const res = await fetch('/api/comissoes/bioquimica')
    if (res.ok) setExames(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { fetchExames() }, [fetchExames])

  async function patch(id: number, updates: Partial<BioquimicaExame>) {
    setSaving(prev => new Set(prev).add(id))
    const res = await fetch(`/api/comissoes/bioquimica/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (res.ok) {
      const updated: BioquimicaExame = await res.json()
      setExames(prev => prev.map(e => e.id === id ? updated : e))
    }
    setSaving(prev => { const s = new Set(prev); s.delete(id); return s })
  }

  async function toggleAtivo(exame: BioquimicaExame) {
    await patch(exame.id, { ativo: !exame.ativo })
  }

  async function moveUp(i: number) {
    if (i === 0) return
    const arr  = [...exames]
    const prev = arr[i - 1]
    const curr = arr[i]
    await Promise.all([
      patch(curr.id, { ordem: prev.ordem }),
      patch(prev.id, { ordem: curr.ordem }),
    ])
  }

  async function moveDown(i: number) {
    if (i === exames.length - 1) return
    const arr  = [...exames]
    const next = arr[i + 1]
    const curr = arr[i]
    await Promise.all([
      patch(curr.id, { ordem: next.ordem }),
      patch(next.id, { ordem: curr.ordem }),
    ])
  }

  function startEdit(id: number, field: 'preco_pix' | 'preco_cartao', currentVal: number) {
    setEditCell({ id, field })
    setEditVal(String(currentVal))
  }

  async function commitEdit() {
    if (!editCell) return
    const val = parseFloat(editVal)
    if (!isNaN(val)) {
      await patch(editCell.id, { [editCell.field]: val })
    }
    setEditCell(null)
  }

  async function softDelete(exame: BioquimicaExame) {
    if (!confirm(`Desativar "${exame.nome}"?`)) return
    await patch(exame.id, { ativo: false })
  }

  if (loading) return <div className="text-center py-16 text-gray-400">Carregando...</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">
          Preços por sub-exame individual — clique no valor para editar.
        </p>
        <button disabled title="Novos exames temporariamente desabilitados"
          className="bg-gray-100 text-gray-400 border border-gray-200 font-semibold px-4 py-2.5 rounded-lg text-sm cursor-not-allowed">
          + Novo exame
        </button>
      </div>

      {exames.length === 0 ? (
        <div className="bg-white rounded-xl border shadow-sm p-10 text-center text-gray-400 text-sm">
          Nenhum sub-exame cadastrado. Clique em &quot;+ Novo exame&quot; para adicionar.
        </div>
      ) : (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="h-1 bg-gold-stripe" />
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Código</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Nome</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Pix (R$)</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Cartão 3x (R$)</th>
                <th className="text-center px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Ativo</th>
                <th className="text-center px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Ordem</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {exames.map((ex, i) => {
                const isSaving = saving.has(ex.id)
                return (
                  <tr key={ex.id} className={`transition ${!ex.ativo ? 'opacity-50' : ''} ${isSaving ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs">{ex.codigo ?? '—'}</td>
                    <td className="px-4 py-3 font-medium text-[#19202d]">{ex.nome}</td>

                    {/* Pix */}
                    <td className="px-4 py-3 text-right">
                      {editCell?.id === ex.id && editCell.field === 'preco_pix' ? (
                        <input
                          type="number" step="0.01" min="0" autoFocus
                          value={editVal} onChange={e => setEditVal(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={e => e.key === 'Enter' && commitEdit()}
                          className="w-24 border border-[#8a6e36] rounded px-2 py-1 text-right text-sm focus:outline-none"
                        />
                      ) : (
                        <button
                          onClick={() => startEdit(ex.id, 'preco_pix', ex.preco_pix)}
                          className="text-right font-semibold text-[#19202d] hover:text-[#8a6e36] transition w-full"
                          title="Clique para editar"
                        >
                          {fmtBRL(ex.preco_pix)}
                        </button>
                      )}
                    </td>

                    {/* Cartão */}
                    <td className="px-4 py-3 text-right">
                      {editCell?.id === ex.id && editCell.field === 'preco_cartao' ? (
                        <input
                          type="number" step="0.01" min="0" autoFocus
                          value={editVal} onChange={e => setEditVal(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={e => e.key === 'Enter' && commitEdit()}
                          className="w-24 border border-[#8a6e36] rounded px-2 py-1 text-right text-sm focus:outline-none"
                        />
                      ) : (
                        <button
                          onClick={() => startEdit(ex.id, 'preco_cartao', ex.preco_cartao)}
                          className="text-right font-semibold text-[#19202d] hover:text-[#8a6e36] transition w-full"
                          title="Clique para editar"
                        >
                          {fmtBRL(ex.preco_cartao)}
                        </button>
                      )}
                    </td>

                    {/* Toggle ativo */}
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggleAtivo(ex)}
                        disabled={isSaving}
                        className={`w-9 h-5 rounded-full transition relative ${ex.ativo ? 'bg-[#c4a35a]' : 'bg-gray-200'}`}
                      >
                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${ex.ativo ? 'left-4' : 'left-0.5'}`} />
                      </button>
                    </td>

                    {/* Setas ↑↓ */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => moveUp(i)} disabled={i === 0 || isSaving}
                          className="text-gray-400 hover:text-[#8a6e36] disabled:opacity-20 transition text-base leading-none px-1"
                          title="Mover para cima">↑</button>
                        <button onClick={() => moveDown(i)} disabled={i === exames.length - 1 || isSaving}
                          className="text-gray-400 hover:text-[#8a6e36] disabled:opacity-20 transition text-base leading-none px-1"
                          title="Mover para baixo">↓</button>
                      </div>
                    </td>

                    {/* Remover */}
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => softDelete(ex)} disabled={isSaving}
                        className="text-xs text-red-400 hover:text-red-600 transition p-1" title="Desativar">✕</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="px-4 py-3 border-t border-gray-50 bg-gray-50">
            <p className="text-xs text-gray-400">
              Clique no valor (Pix ou Cartão) para editar inline. Pressione Enter ou clique fora para salvar.
            </p>
          </div>
        </div>
      )}

      {novoModal && (
        <NovoBioModal
          nextOrdem={exames.length + 1}
          onClose={() => setNovoModal(false)}
          onCreated={ex => {
            setExames(prev => [...prev, ex].sort((a, b) => a.ordem - b.ordem))
            setNovoModal(false)
          }}
        />
      )}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function ComissoesPage() {
  const [activeTab,  setActiveTab]  = useState<'exames' | 'bioquimica'>('exames')
  const [comissoes,  setComissoes]  = useState<Comissao[]>([])
  const [editValues, setEditValues] = useState<Record<number, EditRow>>({})
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [success,    setSuccess]    = useState(false)
  const [error,      setError]      = useState('')
  const [novoModal,  setNovoModal]  = useState(false)

  function toEditRow(c: Comissao): EditRow {
    return {
      preco_exame:               String(c.preco_exame               ?? 0),
      custo_exame:               String(c.custo_exame               ?? 0),
      valor_comissao:            String(c.valor_comissao            ?? 0),
      varia_por_horario:         c.varia_por_horario                ?? false,
      preco_pix_comercial:       String(c.preco_pix_comercial       ?? ''),
      preco_cartao_comercial:    String(c.preco_cartao_comercial    ?? ''),
      preco_pix_fora_horario:    String(c.preco_pix_fora_horario    ?? ''),
      preco_cartao_fora_horario: String(c.preco_cartao_fora_horario ?? ''),
      duracao_minutos:           String(c.duracao_minutos           ?? ''),
      observacao:                c.observacao                       ?? '',
    }
  }

  const fetchComissoes = useCallback(async () => {
    const res = await fetch('/api/comissoes')
    if (res.ok) {
      const data: Comissao[] = await res.json()
      setComissoes(data)
      const vals: Record<number, EditRow> = {}
      for (const c of data) vals[c.id] = toEditRow(c)
      setEditValues(vals)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchComissoes() }, [fetchComissoes])

  function setField<K extends keyof EditRow>(id: number, field: K, val: EditRow[K]) {
    setEditValues(prev => ({ ...prev, [id]: { ...prev[id], [field]: val } }))
  }

  function lucro(id: number) {
    const r = editValues[id]; if (!r) return 0
    const preco = r.varia_por_horario ? p(r.preco_pix_comercial) : p(r.preco_exame)
    return preco - p(r.custo_exame) - p(r.valor_comissao)
  }

  async function handleSave() {
    setSaving(true); setError(''); setSuccess(false)
    const payload = comissoes.map(c => {
      const r = editValues[c.id]
      return {
        id:                        c.id,
        preco_exame:               p(r.preco_exame),
        custo_exame:               p(r.custo_exame),
        valor_comissao:            p(r.valor_comissao),
        varia_por_horario:         r.varia_por_horario,
        preco_pix_comercial:       r.preco_pix_comercial       ? p(r.preco_pix_comercial)       : null,
        preco_cartao_comercial:    r.preco_cartao_comercial    ? p(r.preco_cartao_comercial)    : null,
        preco_pix_fora_horario:    r.preco_pix_fora_horario    ? p(r.preco_pix_fora_horario)    : null,
        preco_cartao_fora_horario: r.preco_cartao_fora_horario ? p(r.preco_cartao_fora_horario) : null,
        duracao_minutos:           r.duracao_minutos           ? parseInt(r.duracao_minutos)    : null,
        observacao:                r.observacao || null,
      }
    })
    const res = await fetch('/api/comissoes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (res.ok) {
      const updated: Comissao[] = await res.json()
      setComissoes(updated)
      const vals: Record<number, EditRow> = {}
      for (const c of updated) vals[c.id] = toEditRow(c)
      setEditValues(vals)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } else {
      const data = await res.json()
      setError(data.error ?? 'Erro ao salvar.')
    }
    setSaving(false)
  }

  async function handleDelete(id: number, nome: string) {
    if (!confirm(`Remover "${nome}"? Laudos já emitidos não serão afetados.`)) return
    const res = await fetch(`/api/comissoes?id=${id}`, { method: 'DELETE' })
    if (res.ok) {
      setComissoes(prev => prev.filter(c => c.id !== id))
      setEditValues(prev => { const n = { ...prev }; delete n[id]; return n })
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-[#19202d]">Preços e Comissões</h2>
          <p className="text-sm text-gray-400 mt-0.5">Gerencie preços de exames e sub-exames de bioquímica.</p>
        </div>

        {/* Abas */}
        <div className="flex gap-2 mb-6 bg-white rounded-xl border shadow-sm p-1.5">
          {([
            { key: 'exames',     label: 'Exames Gerais' },
            { key: 'bioquimica', label: '🧪 Bioquímica' },
          ] as const).map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${
                activeTab === tab.key
                  ? 'bg-[#19202d] text-white'
                  : 'text-gray-500 hover:bg-gray-50'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── ABA EXAMES GERAIS ──────────────────────────────────────────── */}
        {activeTab === 'exames' && (
          <>
            <div className="flex items-center justify-between mb-6">
              <p className="text-sm text-gray-400">Valores são salvos no laudo no momento da emissão — histórico preservado.</p>
              <div className="flex gap-2">
                <button onClick={() => setNovoModal(true)}
                  className="bg-amber-50 hover:bg-amber-100 text-[#8a6e36] border border-[#8a6e36]/30 font-semibold px-4 py-2.5 rounded-lg transition text-sm">
                  + Novo Tipo
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="bg-[#19202d] hover:bg-[#232d3f] disabled:opacity-60 text-white font-semibold px-5 py-2.5 rounded-lg transition text-sm">
                  {saving ? 'Salvando...' : success ? '✓ Salvo!' : 'Salvar tudo'}
                </button>
              </div>
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">{error}</p>}

            {loading ? (
              <div className="text-center py-16 text-gray-400">Carregando...</div>
            ) : comissoes.length === 0 ? (
              <div className="bg-white rounded-xl border shadow-sm p-10 text-center text-gray-400 text-sm">
                Nenhum tipo de exame. Clique em &quot;+ Novo Tipo&quot; para adicionar.
              </div>
            ) : (
              <div className="space-y-4">
                {comissoes.map(c => {
                  const r = editValues[c.id]
                  if (!r) return null
                  const l = lucro(c.id)

                  return (
                    <div key={c.id} className="bg-white rounded-xl border shadow-sm overflow-hidden">
                      <div className="h-1 bg-gold-stripe" />
                      <div className="p-5 space-y-4">

                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="font-bold text-[#19202d] text-base">{c.tipo_exame}</h3>
                            <span className={`text-xs font-semibold mt-0.5 inline-block ${l >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                              Lucro BioPet: R$ {fmtBRL(l)}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <div
                                onClick={() => setField(c.id, 'varia_por_horario', !r.varia_por_horario)}
                                className={`w-9 h-5 rounded-full transition relative ${r.varia_por_horario ? 'bg-[#c4a35a]' : 'bg-gray-200'}`}
                              >
                                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${r.varia_por_horario ? 'left-4' : 'left-0.5'}`} />
                              </div>
                              <span className="text-xs font-medium text-gray-500 whitespace-nowrap">Varia por horário</span>
                            </label>
                            <button onClick={() => handleDelete(c.id, c.tipo_exame)}
                              className="text-xs text-red-400 hover:text-red-600 transition p-1" title="Remover">✕</button>
                          </div>
                        </div>

                        {r.varia_por_horario ? (
                          <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                              <div className="bg-blue-50 rounded-xl p-3 space-y-2">
                                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wide">Horário comercial</p>
                                <NumInput label="Pix (R$)"    value={r.preco_pix_comercial}    onChange={v => setField(c.id, 'preco_pix_comercial', v)} />
                                <NumInput label="Cartão (R$)" value={r.preco_cartao_comercial}  onChange={v => setField(c.id, 'preco_cartao_comercial', v)} />
                              </div>
                              <div className="bg-amber-50 rounded-xl p-3 space-y-2">
                                <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wide">Fora do horário</p>
                                <NumInput label="Pix (R$)"    value={r.preco_pix_fora_horario}    onChange={v => setField(c.id, 'preco_pix_fora_horario', v)} />
                                <NumInput label="Cartão (R$)" value={r.preco_cartao_fora_horario}  onChange={v => setField(c.id, 'preco_cartao_fora_horario', v)} />
                              </div>
                            </div>
                            <p className="text-[10px] text-gray-400">O lucro é calculado com o preço Pix no horário comercial como referência.</p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-3">
                            <NumInput label="Preço Pix (R$)"    value={r.preco_exame}           onChange={v => setField(c.id, 'preco_exame', v)} />
                            <NumInput label="Preço Cartão (R$)" value={r.preco_cartao_comercial} onChange={v => setField(c.id, 'preco_cartao_comercial', v)} />
                          </div>
                        )}

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 border-t border-gray-50">
                          <NumInput label="Custo (R$)"     value={r.custo_exame}    onChange={v => setField(c.id, 'custo_exame', v)} />
                          <NumInput label="Comissão (R$)"  value={r.valor_comissao} onChange={v => setField(c.id, 'valor_comissao', v)} />
                          <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Duração (min)</label>
                            <input type="number" min="5" value={r.duracao_minutos}
                              onChange={e => setField(c.id, 'duracao_minutos', e.target.value)}
                              className={N} placeholder="30" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Observação</label>
                            <input type="text" value={r.observacao}
                              onChange={e => setField(c.id, 'observacao', e.target.value)}
                              className={T} placeholder="Ex: Jejum 12h" />
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <p className="text-xs text-gray-400 mt-4">
              <strong>Lucro BioPet</strong> = Preço − Custo − Comissão do veterinário
            </p>
          </>
        )}

        {/* ── ABA BIOQUÍMICA ─────────────────────────────────────────────── */}
        {activeTab === 'bioquimica' && <BioquimicaSection />}
      </main>

      {novoModal && (
        <NovoTipoModal
          onClose={() => setNovoModal(false)}
          onCreated={c => {
            setComissoes(prev => [...prev, c].sort((a, b) => a.tipo_exame.localeCompare(b.tipo_exame)))
            setEditValues(prev => ({ ...prev, [c.id]: toEditRow(c) }))
            setNovoModal(false)
          }}
        />
      )}
    </div>
  )
}
