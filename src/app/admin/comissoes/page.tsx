'use client'

import { useState, useEffect, useCallback } from 'react'


// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Comissao {
  id:                       number
  tipo_exame:               string
  custo_exame:              number
  comissao_laudo:           number
  comissao_clinica:         number
  comissao_extracao:        number
  varia_por_horario:        boolean
  permite_multiplo:         boolean
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
  comissao:    number
  ativo:       boolean
  ordem:       number
}

interface TesteRapidoExame {
  id:                number
  nome:              string
  descricao:         string | null
  material_padrao:   string | null
  metodo_padrao:     string | null
  observacao_padrao: string | null
  analitos:          string[] | null
  preco_pix:         number
  preco_cartao:      number
  comissao:          number
  ativo:             boolean
  ordem:             number
}

type EditRow = {
  custo_exame:               string
  comissao_laudo:            string
  comissao_clinica:          string
  comissao_extracao:         string
  varia_por_horario:         boolean
  permite_multiplo:          boolean
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
      body: JSON.stringify({ tipo_exame: nome.trim(), custo_exame: 0 }),
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
  const [editCell,  setEditCell]  = useState<{ id: number; field: 'preco_pix' | 'preco_cartao' | 'comissao' } | null>(null)
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

  function startEdit(id: number, field: 'preco_pix' | 'preco_cartao' | 'comissao', currentVal: number) {
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
          Preço e comissão da clínica de cada sub-exame — clique no valor para editar. A <strong>comissão da clínica</strong> é o quanto a clínica parceira recebe por sub-exame.
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
                <th className="text-right px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Comissão clínica (R$)</th>
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

                    {/* Comissão da clínica */}
                    <td className="px-4 py-3 text-right">
                      {editCell?.id === ex.id && editCell.field === 'comissao' ? (
                        <input
                          type="number" step="0.01" min="0" autoFocus
                          value={editVal} onChange={e => setEditVal(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={e => e.key === 'Enter' && commitEdit()}
                          className="w-24 border border-[#8a6e36] rounded px-2 py-1 text-right text-sm focus:outline-none"
                        />
                      ) : (
                        <button
                          onClick={() => startEdit(ex.id, 'comissao', ex.comissao)}
                          className="text-right font-semibold text-[#19202d] hover:text-[#8a6e36] transition w-full"
                          title="Clique para editar"
                        >
                          {fmtBRL(ex.comissao)}
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
              Clique no valor (Pix, Cartão ou Comissão) para editar. Pressione Enter ou clique fora para salvar.
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

// ── Modal de edição de um teste rápido (nome, subtítulo, material, método, observação) ──

function TesteRapidoEditModal({ teste, onClose, onSaved }: {
  teste:   TesteRapidoExame
  onClose: () => void
  onSaved: (t: TesteRapidoExame) => void
}) {
  const [nome,      setNome]      = useState(teste.nome)
  const [descricao, setDescricao] = useState(teste.descricao ?? '')
  const [material,  setMaterial]  = useState(teste.material_padrao ?? '')
  const [metodo,    setMetodo]    = useState(teste.metodo_padrao ?? '')
  const [obs,       setObs]       = useState(teste.observacao_padrao ?? '')
  const [agentes,   setAgentes]   = useState((teste.analitos ?? []).join('\n'))
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')

  async function handleSave() {
    if (!nome.trim()) { setError('O nome é obrigatório.'); return }
    setSaving(true); setError('')
    const analitos = agentes.split('\n').map(a => a.trim()).filter(Boolean)
    const res = await fetch(`/api/comissoes/testes-rapidos/${teste.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome:              nome.trim(),
        descricao:         descricao.trim() || null,
        material_padrao:   material.trim() || null,
        metodo_padrao:     metodo.trim() || null,
        observacao_padrao: obs.trim() || null,
        analitos:          analitos.length > 0 ? analitos : null,
      }),
    })
    if (res.ok) {
      onSaved(await res.json())
    } else {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Erro ao salvar.')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4 py-6 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden my-auto" onClick={e => e.stopPropagation()}>
        <div className="bg-[#19202d] px-6 py-4 flex items-center justify-between">
          <h3 className="text-white font-bold text-sm">Editar teste rápido</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
        </div>
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Nome *</label>
            <input type="text" value={nome} onChange={e => setNome(e.target.value)} className={T} placeholder="Ex: Snap 4Dx Plus" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Subtítulo (aparece abaixo do nome no laudo)</label>
            <input type="text" value={descricao} onChange={e => setDescricao(e.target.value)} className={T} placeholder="Ex: Anticorpos IgG" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Material padrão</label>
              <input type="text" value={material} onChange={e => setMaterial(e.target.value)} className={T} placeholder="Ex: Soro, Sangue total" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Método padrão</label>
              <input type="text" value={metodo} onChange={e => setMetodo(e.target.value)} className={T} placeholder="Ex: Imunocromatografia" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Agentes (teste combo)</label>
            <textarea value={agentes} onChange={e => setAgentes(e.target.value)} rows={4}
              className={T + ' resize-none text-xs leading-relaxed'}
              placeholder={'Um agente por linha. Ex.:\nEhrlichia spp.\nAnaplasma spp.'} />
            <p className="text-[11px] text-gray-400 mt-1">
              Para testes que detectam <strong>vários agentes</strong> (ex.: 4Dx, FIV/FeLV): um por linha. Na emissão o resultado é marcado Positivo/Negativo por agente. <strong>Deixe em branco</strong> para teste de resultado único.
            </p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Observação padrão (bloco de observações do laudo)</label>
            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={9}
              className={T + ' resize-none font-mono text-xs leading-relaxed'}
              placeholder="Texto que já vem preenchido quando este teste é incluído no laudo." />
            <p className="text-[11px] text-gray-400 mt-1">
              Deixe uma <strong>linha em branco</strong> entre os parágrafos para que apareçam separados no laudo. É editável na hora de emitir cada laudo.
            </p>
          </div>
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-500 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition">Cancelar</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 bg-[#19202d] hover:bg-[#232d3f] text-white font-semibold py-2.5 rounded-lg text-sm transition disabled:opacity-60">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Seção Teste Rápido ────────────────────────────────────────────────────────

function TesteRapidoSection() {
  const [testes,   setTestes]   = useState<TesteRapidoExame[]>([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState<Set<number>>(new Set())
  const [editCell, setEditCell] = useState<{ id: number; field: 'preco_pix' | 'preco_cartao' | 'comissao' } | null>(null)
  const [editVal,  setEditVal]  = useState('')
  const [editModal, setEditModal] = useState<TesteRapidoExame | null>(null)

  const fetchTestes = useCallback(async () => {
    const res = await fetch('/api/comissoes/testes-rapidos')
    if (res.ok) setTestes(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { fetchTestes() }, [fetchTestes])

  async function patch(id: number, updates: Partial<TesteRapidoExame>) {
    setSaving(prev => new Set(prev).add(id))
    const res = await fetch(`/api/comissoes/testes-rapidos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (res.ok) {
      const updated: TesteRapidoExame = await res.json()
      setTestes(prev => prev.map(t => t.id === id ? updated : t))
    }
    setSaving(prev => { const s = new Set(prev); s.delete(id); return s })
  }

  async function toggleAtivo(t: TesteRapidoExame) { await patch(t.id, { ativo: !t.ativo }) }

  async function moveUp(i: number) {
    if (i === 0) return
    const arr = [...testes]
    await Promise.all([patch(arr[i].id, { ordem: arr[i - 1].ordem }), patch(arr[i - 1].id, { ordem: arr[i].ordem })])
  }
  async function moveDown(i: number) {
    if (i === testes.length - 1) return
    const arr = [...testes]
    await Promise.all([patch(arr[i].id, { ordem: arr[i + 1].ordem }), patch(arr[i + 1].id, { ordem: arr[i].ordem })])
  }

  function startEdit(id: number, field: 'preco_pix' | 'preco_cartao' | 'comissao', currentVal: number) {
    setEditCell({ id, field }); setEditVal(String(currentVal))
  }
  async function commitEdit() {
    if (!editCell) return
    const val = parseFloat(editVal)
    if (!isNaN(val)) await patch(editCell.id, { [editCell.field]: val })
    setEditCell(null)
  }
  async function softDelete(t: TesteRapidoExame) {
    if (!confirm(`Desativar "${t.nome}"?`)) return
    await patch(t.id, { ativo: false })
  }

  if (loading) return <div className="text-center py-16 text-gray-400">Carregando...</div>

  const priceCell = (t: TesteRapidoExame, field: 'preco_pix' | 'preco_cartao' | 'comissao', val: number) => (
    <td className="px-4 py-3 text-right">
      {editCell?.id === t.id && editCell.field === field ? (
        <input
          type="number" step="0.01" min="0" autoFocus
          value={editVal} onChange={e => setEditVal(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={e => e.key === 'Enter' && commitEdit()}
          className="w-24 border border-[#8a6e36] rounded px-2 py-1 text-right text-sm focus:outline-none"
        />
      ) : (
        <button onClick={() => startEdit(t.id, field, val)}
          className="text-right font-semibold text-[#19202d] hover:text-[#8a6e36] transition w-full" title="Clique para editar">
          {fmtBRL(val)}
        </button>
      )}
    </td>
  )

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">
        Preço e comissão da clínica de cada teste — clique no valor para editar. A <strong>comissão da clínica</strong> é o quanto a clínica parceira recebe por teste.
      </p>

      {testes.length === 0 ? (
        <div className="bg-white rounded-xl border shadow-sm p-10 text-center text-gray-400 text-sm">
          Nenhum teste rápido cadastrado.
        </div>
      ) : (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="h-1 bg-gold-stripe" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Teste</th>
                  <th className="text-right px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Pix (R$)</th>
                  <th className="text-right px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Cartão 3x (R$)</th>
                  <th className="text-right px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Comissão clínica (R$)</th>
                  <th className="text-center px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Ativo</th>
                  <th className="text-center px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Ordem</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {testes.map((t, i) => {
                  const isSaving = saving.has(t.id)
                  return (
                    <tr key={t.id} className={`transition ${!t.ativo ? 'opacity-50' : ''} ${isSaving ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-[#19202d]">{t.nome}</div>
                        {t.descricao && <div className="text-[11px] text-gray-400">{t.descricao}</div>}
                      </td>
                      {priceCell(t, 'preco_pix', t.preco_pix)}
                      {priceCell(t, 'preco_cartao', t.preco_cartao)}
                      {priceCell(t, 'comissao', t.comissao)}
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => toggleAtivo(t)} disabled={isSaving}
                          className={`w-9 h-5 rounded-full transition relative ${t.ativo ? 'bg-[#c4a35a]' : 'bg-gray-200'}`}>
                          <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${t.ativo ? 'left-4' : 'left-0.5'}`} />
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => moveUp(i)} disabled={i === 0 || isSaving}
                            className="text-gray-400 hover:text-[#8a6e36] disabled:opacity-20 transition text-base leading-none px-1" title="Mover para cima">↑</button>
                          <button onClick={() => moveDown(i)} disabled={i === testes.length - 1 || isSaving}
                            className="text-gray-400 hover:text-[#8a6e36] disabled:opacity-20 transition text-base leading-none px-1" title="Mover para baixo">↓</button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <button onClick={() => setEditModal(t)} disabled={isSaving}
                          className="text-xs text-[#8a6e36] hover:text-[#5a4a28] transition px-1.5 py-1 font-semibold" title="Editar nome, material, método e observações">✏️ Editar</button>
                        <button onClick={() => softDelete(t)} disabled={isSaving}
                          className="text-xs text-red-400 hover:text-red-600 transition p-1 ml-1" title="Desativar">✕</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-gray-50 bg-gray-50">
            <p className="text-xs text-gray-400">
              Clique em Pix, Cartão ou Comissão para editar inline. Use <strong>✏️ Editar</strong> para o nome, material, método e as observações do laudo.
            </p>
          </div>
        </div>
      )}

      {editModal && (
        <TesteRapidoEditModal
          teste={editModal}
          onClose={() => setEditModal(null)}
          onSaved={t => { setTestes(prev => prev.map(x => x.id === t.id ? t : x)); setEditModal(null) }}
        />
      )}
    </div>
  )
}


// ── Quem recebe comissão ──────────────────────────────────────────────────────
// Os três beneficiários possíveis (migration v48). Um exame pode pagar mais de um.

const BENEFICIARIOS = [
  {
    campo:  'comissao_laudo',
    titulo: 'Laudo',
    quem:   'Quem gerou o laudo',
    ajuda:  'Usuário do sistema que emitiu o laudo (só conta se ele estiver marcado para receber comissão).',
    cor:    'bg-blue-50 text-blue-700 border-blue-200',
  },
  {
    campo:  'comissao_clinica',
    titulo: 'Clínica',
    quem:   'Clínica parceira',
    ajuda:  'Clínica que coletou ou encaminhou. Se a clínica paga, sai descontado do repasse; se o tutor paga a BioPet, fica devido à clínica.',
    cor:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  {
    campo:  'comissao_extracao',
    titulo: 'Extração',
    quem:   'Vet que extraiu o sangue',
    ajuda:  'Veterinário atribuído na tela de Extrações.',
    cor:    'bg-rose-50 text-rose-700 border-rose-200',
  },
] as const

type CampoComissao = typeof BENEFICIARIOS[number]['campo']

const AGRUPADORES = ['Bioquímica', 'Teste Rápido']

function ComissaoChips({ c }: { c: Comissao }) {
  if (AGRUPADORES.includes(c.tipo_exame)) {
    return (
      <span className={`inline-block text-[11px] font-semibold border rounded-full px-2 py-0.5 ${BENEFICIARIOS[1].cor}`}>
        Clínica · por sub-exame
      </span>
    )
  }
  const chips = BENEFICIARIOS.filter(b => Number(c[b.campo] ?? 0) > 0)
  if (chips.length === 0) return <span className="text-xs text-gray-300">Sem comissão</span>
  return (
    <div className="flex flex-wrap gap-1">
      {chips.map(b => (
        <span key={b.campo} className={`text-[11px] font-semibold border rounded-full px-2 py-0.5 whitespace-nowrap ${b.cor}`}>
          {b.titulo} R$ {fmtBRL(Number(c[b.campo]))}
        </span>
      ))}
    </div>
  )
}

function totalComissoes(r: Pick<EditRow, CampoComissao>) {
  return p(r.comissao_laudo) + p(r.comissao_clinica) + p(r.comissao_extracao)
}

function toEditRow(c: Comissao): EditRow {
  return {
    custo_exame:               String(c.custo_exame               ?? 0),
    comissao_laudo:            String(c.comissao_laudo            ?? 0),
    comissao_clinica:          String(c.comissao_clinica          ?? 0),
    comissao_extracao:         String(c.comissao_extracao         ?? 0),
    varia_por_horario:         c.varia_por_horario                ?? false,
    permite_multiplo:          c.permite_multiplo                 ?? false,
    preco_pix_comercial:       String(c.preco_pix_comercial       ?? 0),
    preco_cartao_comercial:    String(c.preco_cartao_comercial    ?? ''),
    preco_pix_fora_horario:    String(c.preco_pix_fora_horario    ?? ''),
    preco_cartao_fora_horario: String(c.preco_cartao_fora_horario ?? ''),
    duracao_minutos:           String(c.duracao_minutos           ?? ''),
    observacao:                c.observacao                       ?? '',
  }
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-2 text-left">
      <span className={`w-9 h-5 rounded-full transition relative shrink-0 ${on ? 'bg-[#c4a35a]' : 'bg-gray-200'}`}>
        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${on ? 'left-4' : 'left-0.5'}`} />
      </span>
      <span className="text-sm text-gray-600">{label}</span>
    </button>
  )
}

// ── Modal de edição de um exame ───────────────────────────────────────────────

function ExameEditModal({ exame, onClose, onSaved, onDeleted }: {
  exame:     Comissao
  onClose:   () => void
  onSaved:   (c: Comissao[]) => void
  onDeleted: (id: number) => void
}) {
  const [r,      setR]      = useState<EditRow>(toEditRow(exame))
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const agrupador = AGRUPADORES.includes(exame.tipo_exame)

  const set = <K extends keyof EditRow>(k: K, v: EditRow[K]) => setR(prev => ({ ...prev, [k]: v }))

  const preco    = p(r.preco_pix_comercial)
  const comissao = totalComissoes(r)
  const lucro    = preco - p(r.custo_exame) - comissao

  async function salvar() {
    setSaving(true); setError('')
    const varia  = r.varia_por_horario
    const pixCom = r.preco_pix_comercial    ? p(r.preco_pix_comercial)    : null
    const carCom = r.preco_cartao_comercial ? p(r.preco_cartao_comercial) : null
    const res = await fetch('/api/comissoes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{
        id:                        exame.id,
        custo_exame:               p(r.custo_exame),
        comissao_laudo:            agrupador ? 0 : p(r.comissao_laudo),
        comissao_clinica:          agrupador ? 0 : p(r.comissao_clinica),
        comissao_extracao:         agrupador ? 0 : p(r.comissao_extracao),
        varia_por_horario:         varia,
        permite_multiplo:          r.permite_multiplo,
        preco_pix_comercial:       pixCom,
        preco_cartao_comercial:    carCom,
        preco_pix_fora_horario:    varia ? (r.preco_pix_fora_horario    ? p(r.preco_pix_fora_horario)    : null) : pixCom,
        preco_cartao_fora_horario: varia ? (r.preco_cartao_fora_horario ? p(r.preco_cartao_fora_horario) : null) : carCom,
        duracao_minutos:           r.duracao_minutos ? parseInt(r.duracao_minutos) : null,
        observacao:                r.observacao || null,
      }]),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) onSaved(data)
    else setError(data.error ?? 'Erro ao salvar.')
    setSaving(false)
  }

  async function remover() {
    if (!confirm(`Remover "${exame.tipo_exame}"? Laudos já emitidos não serão afetados.`)) return
    const res = await fetch(`/api/comissoes?id=${exame.id}`, { method: 'DELETE' })
    if (res.ok) onDeleted(exame.id)
    else setError('Erro ao remover.')
  }

  const secao = 'text-[11px] font-bold text-gray-400 uppercase tracking-wide'

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4 py-6 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden my-auto" onClick={e => e.stopPropagation()}>
        <div className="bg-[#19202d] px-6 py-4 flex items-center justify-between">
          <h3 className="text-white font-bold">{exame.tipo_exame}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">

          {/* Preço */}
          {agrupador ? (
            <p className="text-sm text-gray-500 bg-gray-50 rounded-lg px-4 py-3">
              O preço e a comissão da clínica de <strong>{exame.tipo_exame}</strong> são definidos por sub-exame,
              na aba <strong>{exame.tipo_exame}</strong>.
            </p>
          ) : (
            <section className="space-y-3">
              <p className={secao}>Preço cobrado</p>
              <Toggle on={r.varia_por_horario} onClick={() => set('varia_por_horario', !r.varia_por_horario)}
                label="Preço diferente fora do horário comercial" />
              {r.varia_por_horario ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-blue-50 rounded-xl p-3 space-y-2">
                    <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wide">Horário comercial</p>
                    <NumInput label="Pix (R$)"    value={r.preco_pix_comercial}    onChange={v => set('preco_pix_comercial', v)} />
                    <NumInput label="Cartão (R$)" value={r.preco_cartao_comercial} onChange={v => set('preco_cartao_comercial', v)} />
                  </div>
                  <div className="bg-amber-50 rounded-xl p-3 space-y-2">
                    <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wide">Fora do horário</p>
                    <NumInput label="Pix (R$)"    value={r.preco_pix_fora_horario}    onChange={v => set('preco_pix_fora_horario', v)} />
                    <NumInput label="Cartão (R$)" value={r.preco_cartao_fora_horario} onChange={v => set('preco_cartao_fora_horario', v)} />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <NumInput label="Pix (R$)"    value={r.preco_pix_comercial}    onChange={v => set('preco_pix_comercial', v)} />
                  <NumInput label="Cartão (R$)" value={r.preco_cartao_comercial} onChange={v => set('preco_cartao_comercial', v)} />
                </div>
              )}
            </section>
          )}

          {/* Comissões */}
          {!agrupador && (
            <section className="space-y-3">
              <div>
                <p className={secao}>Comissões — quem recebe e quanto</p>
                <p className="text-xs text-gray-400 mt-1">Deixe 0 em quem não recebe. Um exame pode pagar mais de um.</p>
              </div>
              <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl">
                {BENEFICIARIOS.map(b => (
                  <div key={b.campo} className="flex items-center gap-4 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[11px] font-semibold border rounded-full px-2 py-0.5 ${b.cor}`}>{b.titulo}</span>
                        <span className="text-sm font-medium text-[#19202d]">{b.quem}</span>
                      </div>
                      <p className="text-[11px] text-gray-400 mt-1 leading-snug">{b.ajuda}</p>
                    </div>
                    <div className="w-28 shrink-0">
                      <input type="number" step="0.01" min="0" value={r[b.campo]}
                        onChange={e => set(b.campo, e.target.value)} className={N} aria-label={`Comissão ${b.titulo} (R$)`} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Custo e lucro */}
          <section className="space-y-3">
            <p className={secao}>Custo e lucro</p>
            <div className="grid grid-cols-2 gap-3 items-end">
              <NumInput label="Custo do exame (R$)" value={r.custo_exame} onChange={v => set('custo_exame', v)} />
              {!agrupador && (
                <div className={`rounded-lg px-3 py-2 text-right ${lucro >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Lucro BioPet (Pix)</p>
                  <p className={`text-base font-bold ${lucro >= 0 ? 'text-green-700' : 'text-red-600'}`}>R$ {fmtBRL(lucro)}</p>
                </div>
              )}
            </div>
            {!agrupador && (
              <p className="text-[11px] text-gray-400">
                R$ {fmtBRL(preco)} (Pix, horário comercial) − R$ {fmtBRL(p(r.custo_exame))} de custo − R$ {fmtBRL(comissao)} de comissões.
              </p>
            )}
          </section>

          {/* Agendamento */}
          <section className="space-y-3">
            <p className={secao}>Agendamento</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Duração (min)</label>
                <input type="number" min="5" value={r.duracao_minutos}
                  onChange={e => set('duracao_minutos', e.target.value)} className={N} placeholder="30" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Observação</label>
                <input type="text" value={r.observacao}
                  onChange={e => set('observacao', e.target.value)} className={T} placeholder="Ex: Jejum 12h" />
              </div>
            </div>
            <Toggle on={r.permite_multiplo} onClick={() => set('permite_multiplo', !r.permite_multiplo)}
              label="Permite marcar mais de um no mesmo agendamento" />
          </section>

          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-3">
          {!agrupador && (
            <button onClick={remover} className="text-xs text-red-400 hover:text-red-600 transition mr-auto">Remover exame</button>
          )}
          <button onClick={onClose} className={`${agrupador ? 'ml-auto' : ''} border border-gray-200 text-gray-500 px-4 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition`}>
            Cancelar
          </button>
          <button onClick={salvar} disabled={saving}
            className="bg-[#19202d] hover:bg-[#232d3f] text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition disabled:opacity-60">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

function precoResumo(c: Comissao) {
  if (AGRUPADORES.includes(c.tipo_exame)) return <span className="text-xs text-gray-400">por sub-exame</span>
  const pix = Number(c.preco_pix_comercial ?? 0)
  const car = c.preco_cartao_comercial != null ? Number(c.preco_cartao_comercial) : null
  return (
    <div className="leading-tight">
      <div className="font-semibold text-[#19202d]">R$ {fmtBRL(pix)}</div>
      {car != null && car !== pix && <div className="text-[11px] text-gray-400">cartão R$ {fmtBRL(car)}</div>}
      {c.varia_por_horario && (
        <div className="text-[11px] text-amber-600">fora do horário R$ {fmtBRL(Number(c.preco_pix_fora_horario ?? 0))}</div>
      )}
    </div>
  )
}

function lucroDe(c: Comissao) {
  return Number(c.preco_pix_comercial ?? 0) - Number(c.custo_exame ?? 0)
    - Number(c.comissao_laudo ?? 0) - Number(c.comissao_clinica ?? 0) - Number(c.comissao_extracao ?? 0)
}

export default function ComissoesPage() {
  const [activeTab, setActiveTab] = useState<'exames' | 'bioquimica' | 'testes'>('exames')
  const [comissoes, setComissoes] = useState<Comissao[]>([])
  const [loading,   setLoading]   = useState(true)
  const [busca,     setBusca]     = useState('')
  const [editando,  setEditando]  = useState<Comissao | null>(null)
  const [novoModal, setNovoModal] = useState(false)
  const [aviso,     setAviso]     = useState('')

  const fetchComissoes = useCallback(async () => {
    const res = await fetch('/api/comissoes')
    if (res.ok) setComissoes(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { fetchComissoes() }, [fetchComissoes])

  function avisar(msg: string) { setAviso(msg); setTimeout(() => setAviso(''), 3000) }

  const termo    = busca.trim().toLowerCase()
  const visiveis = comissoes.filter(c => !termo || c.tipo_exame.toLowerCase().includes(termo))

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-[#19202d]">Preços e Comissões</h2>
          <p className="text-sm text-gray-400 mt-0.5">Quanto cada exame custa e quem recebe comissão por ele.</p>
        </div>

        {/* Abas */}
        <div className="flex gap-2 mb-6 bg-white rounded-xl border shadow-sm p-1.5">
          {([
            { key: 'exames',     label: 'Exames' },
            { key: 'bioquimica', label: '🧪 Bioquímica' },
            { key: 'testes',     label: '💉 Teste Rápido' },
          ] as const).map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${
                activeTab === tab.key ? 'bg-[#19202d] text-white' : 'text-gray-500 hover:bg-gray-50'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── ABA EXAMES ─────────────────────────────────────────────────── */}
        {activeTab === 'exames' && (
          <div className="space-y-4">

            {/* Legenda: quem pode receber */}
            <div className="bg-white rounded-xl border shadow-sm p-4">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-3">Quem pode receber comissão</p>
              <div className="grid sm:grid-cols-3 gap-3">
                {BENEFICIARIOS.map(b => (
                  <div key={b.campo} className="flex gap-2 items-start">
                    <span className={`text-[11px] font-semibold border rounded-full px-2 py-0.5 shrink-0 ${b.cor}`}>{b.titulo}</span>
                    <p className="text-xs text-gray-500 leading-snug"><strong className="text-gray-700">{b.quem}.</strong> {b.ajuda}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
              <input type="search" value={busca} onChange={e => setBusca(e.target.value)}
                placeholder="Buscar exame..." className={T + ' sm:max-w-xs bg-white'} />
              <div className="flex items-center gap-3">
                {aviso && <span className="text-sm text-green-600 font-medium">{aviso}</span>}
                <button onClick={() => setNovoModal(true)}
                  className="bg-[#19202d] hover:bg-[#232d3f] text-white font-semibold px-4 py-2.5 rounded-lg transition text-sm">
                  + Novo exame
                </button>
              </div>
            </div>

            {loading ? (
              <div className="text-center py-16 text-gray-400">Carregando...</div>
            ) : visiveis.length === 0 ? (
              <div className="bg-white rounded-xl border shadow-sm p-10 text-center text-gray-400 text-sm">
                {comissoes.length === 0 ? 'Nenhum exame cadastrado.' : 'Nenhum exame encontrado.'}
              </div>
            ) : (
              <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="h-1 bg-gold-stripe" />

                {/* Desktop */}
                <table className="w-full text-sm hidden md:table">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 text-[10px] font-bold text-gray-400 uppercase tracking-wide">
                      <th className="text-left px-4 py-3">Exame</th>
                      <th className="text-right px-4 py-3">Preço (Pix)</th>
                      <th className="text-left px-4 py-3">Comissões</th>
                      <th className="text-right px-4 py-3">Custo</th>
                      <th className="text-right px-4 py-3">Lucro BioPet</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {visiveis.map(c => {
                      const agrupador = AGRUPADORES.includes(c.tipo_exame)
                      const l = lucroDe(c)
                      return (
                        <tr key={c.id} className="hover:bg-gray-50/60 cursor-pointer" onClick={() => setEditando(c)}>
                          <td className="px-4 py-3">
                            <div className="font-medium text-[#19202d]">{c.tipo_exame}</div>
                            {c.observacao && <div className="text-[11px] text-gray-400">{c.observacao}</div>}
                          </td>
                          <td className="px-4 py-3 text-right">{precoResumo(c)}</td>
                          <td className="px-4 py-3"><ComissaoChips c={c} /></td>
                          <td className="px-4 py-3 text-right text-gray-500">
                            {Number(c.custo_exame ?? 0) > 0 ? `R$ ${fmtBRL(Number(c.custo_exame))}` : '—'}
                          </td>
                          <td className={`px-4 py-3 text-right font-semibold ${agrupador ? 'text-gray-300' : l >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {agrupador ? '—' : `R$ ${fmtBRL(l)}`}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-xs font-semibold text-[#8a6e36]">Editar</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>

                {/* Mobile */}
                <ul className="md:hidden divide-y divide-gray-100">
                  {visiveis.map(c => {
                    const agrupador = AGRUPADORES.includes(c.tipo_exame)
                    const l = lucroDe(c)
                    return (
                      <li key={c.id}>
                        <button onClick={() => setEditando(c)} className="w-full text-left px-4 py-3 space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <span className="font-medium text-[#19202d]">{c.tipo_exame}</span>
                            <span className="text-right text-sm">{precoResumo(c)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <ComissaoChips c={c} />
                            {!agrupador && (
                              <span className={`text-xs font-semibold shrink-0 ${l >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                lucro R$ {fmtBRL(l)}
                              </span>
                            )}
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            <p className="text-xs text-gray-400">
              Clique num exame para editar. <strong>Lucro BioPet</strong> = preço Pix no horário comercial − custo − todas as comissões.
              Os valores são gravados no laudo/agendamento na hora — mudar aqui não altera o que já foi feito.
            </p>
          </div>
        )}

        {/* ── ABA BIOQUÍMICA ─────────────────────────────────────────────── */}
        {activeTab === 'bioquimica' && <BioquimicaSection />}

        {/* ── ABA TESTE RÁPIDO ───────────────────────────────────────────── */}
        {activeTab === 'testes' && <TesteRapidoSection />}
      </main>

      {editando && (
        <ExameEditModal
          exame={editando}
          onClose={() => setEditando(null)}
          onSaved={lista => { setComissoes(lista); setEditando(null); avisar('✓ Salvo') }}
          onDeleted={id => { setComissoes(prev => prev.filter(c => c.id !== id)); setEditando(null); avisar('Exame removido') }}
        />
      )}

      {novoModal && (
        <NovoTipoModal
          onClose={() => setNovoModal(false)}
          onCreated={c => {
            setComissoes(prev => [...prev, c].sort((a, b) => a.tipo_exame.localeCompare(b.tipo_exame)))
            setNovoModal(false)
            setEditando(c)
          }}
        />
      )}
    </div>
  )
}
