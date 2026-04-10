'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface Vet {
  id: number
  nome: string
  email: string | null
  whatsapp: string | null
  convite_aceito: boolean
  criado_em: string
  clinicas: { nome: string } | null
}

interface Clinica { id: number; nome: string }

const INPUT = 'w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36]'
const emptyForm = { nome: '', whatsapp: '', clinica_id: '' }

export default function VeterinariosPage() {
  const [vets,      setVets]      = useState<Vet[]>([])
  const [clinicas,  setClinicas]  = useState<Clinica[]>([])
  const [loading,   setLoading]   = useState(true)
  const [sending,   setSending]   = useState<number | null>(null)
  const [modal,     setModal]     = useState(false)
  const [form,      setForm]      = useState(emptyForm)
  const [saving,    setSaving]    = useState(false)
  const [formError, setFormError] = useState('')

  // Edit modal
  const [editVet,     setEditVet]     = useState<Vet | null>(null)
  const [editForm,    setEditForm]    = useState({ nome: '', whatsapp: '' })
  const [editSaving,  setEditSaving]  = useState(false)
  const [editError,   setEditError]   = useState('')
  const [resetando,   setResetando]   = useState(false)
  const [resetMsg,    setResetMsg]    = useState('')

  const router = useRouter()

  const load = useCallback(async () => {
    const [vetRes, clinRes] = await Promise.all([
      fetch('/api/veterinarios'),
      fetch('/api/admin/clinicas'),
    ])
    if (vetRes.status === 401) { router.push('/login'); return }
    if (vetRes.ok)  setVets(await vetRes.json())
    if (clinRes.ok) setClinicas(await clinRes.json())
    setLoading(false)
  }, [router])

  useEffect(() => { load() }, [load])

  function openEdit(vet: Vet) {
    setEditVet(vet)
    setEditForm({ nome: vet.nome, whatsapp: vet.whatsapp ?? '' })
    setEditError('')
    setResetMsg('')
  }

  async function handleReenviar(vet: Vet) {
    setSending(vet.id)
    const res = await fetch(`/api/veterinarios/${vet.id}/reenviar`, { method: 'POST' })
    if (!res.ok) { const err = await res.json(); alert(err.error) }
    else alert(`Convite reenviado para ${vet.nome}!`)
    setSending(null)
  }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setFormError('')
    const digits = form.whatsapp.replace(/\D/g, '')
    const wa = digits ? (digits.startsWith('55') ? digits : `55${digits}`) : undefined
    const res = await fetch('/api/veterinarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: form.nome, whatsapp: wa, clinica_id: form.clinica_id || undefined }),
    })
    if (res.ok) { await load(); setModal(false); setForm(emptyForm) }
    else { const err = await res.json(); setFormError(err.error ?? 'Erro ao cadastrar veterinário.') }
    setSaving(false)
  }

  async function handleEditSalvar(e: React.FormEvent) {
    e.preventDefault()
    if (!editVet) return
    setEditSaving(true); setEditError('')
    const res = await fetch(`/api/veterinarios/${editVet.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: editForm.nome, whatsapp: editForm.whatsapp || null }),
    })
    if (res.ok) {
      const updated: Vet = await res.json()
      setVets(prev => prev.map(v => v.id === updated.id ? { ...v, ...updated } : v))
      setEditVet(null)
    } else {
      const err = await res.json(); setEditError(err.error ?? 'Erro ao salvar.')
    }
    setEditSaving(false)
  }

  async function handleResetSenha() {
    if (!editVet) return
    setResetando(true); setResetMsg('')
    const res = await fetch(`/api/veterinarios/${editVet.id}/resetar-senha`, { method: 'POST' })
    const d = await res.json()
    if (res.ok) {
      setVets(prev => prev.map(v => v.id === editVet.id ? { ...v, convite_aceito: false } : v))
      setEditVet(prev => prev ? { ...prev, convite_aceito: false } : prev)
      setResetMsg(d.whatsappEnviado ? '✓ Senha resetada e novo link enviado pelo WhatsApp.' : '✓ Senha resetada. Envie o novo link de cadastro manualmente.')
    } else {
      setResetMsg(`Erro: ${d.error}`)
    }
    setResetando(false)
  }

  function fmt(d: string) {
    return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-[#19202d]">
            Veterinários cadastrados
            {!loading && <span className="ml-2 text-sm font-normal text-gray-400">({vets.length})</span>}
          </h2>
          <button
            onClick={() => { setForm(emptyForm); setFormError(''); setModal(true) }}
            className="bg-[#c4a35a] hover:bg-[#a88a47] text-white font-bold px-4 py-2.5 rounded-lg text-sm transition"
          >
            + Novo veterinário
          </button>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400">Carregando...</div>
        ) : vets.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl shadow-sm border">
            <div className="text-5xl mb-4">👨‍⚕️</div>
            <p className="text-gray-500">Nenhum veterinário cadastrado.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="h-1 bg-gold-stripe" />
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Nome', 'Clínica', 'E-mail', 'WhatsApp', 'Status', 'Cadastro', 'Ações'].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-bold text-[#19202d] uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {vets.map(vet => (
                  <tr key={vet.id} className="hover:bg-amber-50/30 transition">
                    <td className="px-5 py-4 font-semibold text-[#19202d]">{vet.nome}</td>
                    <td className="px-5 py-4 text-gray-500 text-sm">
                      {vet.clinicas ? (
                        <span className="text-xs bg-amber-50 text-[#8a6e36] border border-[#8a6e36]/20 px-2 py-0.5 rounded-full">
                          {vet.clinicas.nome}
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-5 py-4 text-gray-500 text-sm">{vet.email ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-5 py-4 text-gray-500 text-sm">{vet.whatsapp ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-5 py-4">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                        vet.convite_aceito
                          ? 'bg-green-50 text-green-700 border border-green-200'
                          : 'bg-amber-50 text-[#8a6e36] border border-[#8a6e36]/20'
                      }`}>
                        {vet.convite_aceito ? '✓ Ativo' : '⏳ Pendente'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-gray-400 text-sm whitespace-nowrap">{fmt(vet.criado_em)}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEdit(vet)}
                          className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition"
                        >
                          ✏️ Editar
                        </button>
                        {!vet.convite_aceito && (
                          <button
                            onClick={() => handleReenviar(vet)}
                            disabled={sending === vet.id}
                            className="text-xs px-3 py-1.5 rounded-lg bg-amber-50 text-[#8a6e36] border border-[#8a6e36]/20 hover:bg-amber-100 transition disabled:opacity-50"
                          >
                            {sending === vet.id ? 'Enviando...' : '↩ Reenviar convite'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Modal novo veterinário */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-[#19202d] px-6 py-4 flex items-center justify-between">
              <h3 className="text-white font-bold">Novo veterinário</h3>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
            </div>
            <form onSubmit={handleSalvar} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Nome <span className="text-red-400">*</span></label>
                <input type="text" value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))}
                  required autoFocus className={INPUT} placeholder="Nome completo" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">WhatsApp</label>
                <input type="tel" value={form.whatsapp} onChange={e => setForm(p => ({ ...p, whatsapp: e.target.value }))}
                  className={INPUT} placeholder="(24) 99999-9999" />
                <p className="text-[10px] text-gray-400 mt-1">O e-mail é definido pelo vet no primeiro acesso.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Clínica parceira</label>
                <select value={form.clinica_id} onChange={e => setForm(p => ({ ...p, clinica_id: e.target.value }))}
                  className={INPUT + ' text-gray-600'}>
                  <option value="">Nenhuma</option>
                  {clinicas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              {formError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setModal(false)}
                  className="flex-1 border border-gray-200 text-gray-500 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition">Cancelar</button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-[#19202d] hover:bg-[#232d3f] text-white font-semibold py-2.5 rounded-lg text-sm transition disabled:opacity-60">
                  {saving ? 'Salvando...' : 'Cadastrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal editar veterinário */}
      {editVet && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-[#19202d] px-6 py-4 flex items-center justify-between">
              <div>
                <p className="text-white font-bold text-sm">Editar veterinário</p>
                <p className="text-gray-400 text-xs mt-0.5">{editVet.nome}</p>
              </div>
              <button onClick={() => setEditVet(null)} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
            </div>
            <form onSubmit={handleEditSalvar} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Nome <span className="text-red-400">*</span></label>
                <input type="text" value={editForm.nome} onChange={e => setEditForm(p => ({ ...p, nome: e.target.value }))}
                  required className={INPUT} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">WhatsApp</label>
                <input type="tel" value={editForm.whatsapp} onChange={e => setEditForm(p => ({ ...p, whatsapp: e.target.value }))}
                  className={INPUT} placeholder="(24) 99999-9999" />
              </div>

              {/* Resetar senha */}
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Acesso</p>
                <div className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-[#19202d]">Resetar senha</p>
                    <p className="text-xs text-gray-400 mt-0.5">Gera novo link de cadastro e envia pelo WhatsApp</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleResetSenha}
                    disabled={resetando}
                    className="shrink-0 text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition disabled:opacity-50"
                  >
                    {resetando ? 'Resetando...' : '🔑 Resetar'}
                  </button>
                </div>
                {resetMsg && (
                  <p className={`text-xs mt-2 px-3 py-1.5 rounded-lg ${resetMsg.startsWith('✓') ? 'text-green-700 bg-green-50' : 'text-red-600 bg-red-50'}`}>
                    {resetMsg}
                  </p>
                )}
              </div>

              {editError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{editError}</p>}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setEditVet(null)}
                  className="flex-1 border border-gray-200 text-gray-500 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition">Cancelar</button>
                <button type="submit" disabled={editSaving}
                  className="flex-1 bg-[#19202d] hover:bg-[#232d3f] text-white font-semibold py-2.5 rounded-lg text-sm transition disabled:opacity-60">
                  {editSaving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
