'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface Clinica {
  id: number
  nome: string
  email: string
  telefone: string | null
  endereco: string | null
  convite_aceito: boolean
  ativo: boolean
  total_vets: number
  criado_em: string
}

interface Vet {
  id: number
  nome: string
  email: string
  clinica_id: number | null
  convite_aceito: boolean
}

interface ExamePermitido { tipo_exame: string; permitido: boolean }

const emptyForm = { nome: '', email: '', telefone: '', endereco: '' }

export default function ClinicasPage() {
  const [clinicas,  setCLinicas]  = useState<Clinica[]>([])
  const [vets,      setVets]      = useState<Vet[]>([])
  const [loading,   setLoading]   = useState(true)
  const [sending,   setSending]   = useState<number | null>(null)
  const [modal,     setModal]     = useState<'nova' | 'editar' | null>(null)
  const [editando,  setEditando]  = useState<Clinica | null>(null)
  const [form,      setForm]      = useState(emptyForm)
  const [vetIds,    setVetIds]    = useState<number[]>([])
  const [examesInfo,  setExamesInfo]  = useState<ExamePermitido[]>([])
  const [examesSel,   setExamesSel]   = useState<Set<string>>(new Set())
  const [saving,    setSaving]    = useState(false)
  const [formError, setFormError] = useState('')
  const router = useRouter()

  const load = useCallback(async () => {
    const [clinRes, vetRes] = await Promise.all([
      fetch('/api/admin/clinicas'),
      fetch('/api/veterinarios'),
    ])
    if (clinRes.status === 401) { router.push('/login'); return }
    if (clinRes.ok) setCLinicas(await clinRes.json())
    if (vetRes.ok)  setVets(await vetRes.json())
    setLoading(false)
  }, [router])

  useEffect(() => { load() }, [load])

  function openNova() {
    setForm(emptyForm)
    setVetIds([])
    setFormError('')
    setEditando(null)
    setModal('nova')
  }

  async function openEditar(c: Clinica) {
    setForm({ nome: c.nome, email: c.email, telefone: c.telefone ?? '', endereco: c.endereco ?? '' })
    setFormError('')
    setEditando(c)
    const vetsClinica = vets.filter(v => v.clinica_id === c.id).map(v => v.id)
    setVetIds(vetsClinica)
    // Busca exames permitidos
    const res = await fetch(`/api/admin/clinicas/${c.id}/exames`)
    if (res.ok) {
      const d = await res.json()
      setExamesInfo(d.exames ?? [])
      setExamesSel(new Set((d.exames as ExamePermitido[]).filter(e => e.permitido).map(e => e.tipo_exame)))
    } else {
      setExamesInfo([])
      setExamesSel(new Set())
    }
    setModal('editar')
  }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFormError('')

    if (modal === 'nova') {
      const res = await fetch('/api/admin/clinicas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, vet_ids: vetIds }),
      })
      if (res.ok) {
        await load()
        setModal(null)
      } else {
        const err = await res.json()
        setFormError(err.error ?? 'Erro ao criar clínica.')
      }
    } else if (modal === 'editar' && editando) {
      const [res, resEx] = await Promise.all([
        fetch(`/api/admin/clinicas/${editando.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, vet_ids: vetIds }),
        }),
        fetch(`/api/admin/clinicas/${editando.id}/exames`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ exames: Array.from(examesSel) }),
        }),
      ])
      if (res.ok && resEx.ok) {
        await load()
        setModal(null)
      } else {
        const err = await (res.ok ? resEx : res).json()
        setFormError(err.error ?? 'Erro ao atualizar clínica.')
      }
    }
    setSaving(false)
  }

  async function handleToggleAtivo(c: Clinica) {
    await fetch(`/api/admin/clinicas/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo: !c.ativo }),
    })
    await load()
  }

  async function handleReenviar(c: Clinica) {
    setSending(c.id)
    const res = await fetch(`/api/admin/clinicas/${c.id}`, { method: 'POST' })
    if (!res.ok) {
      const err = await res.json()
      alert(err.error ?? 'Erro ao reenviar convite.')
    } else {
      alert(`Convite reenviado para ${c.nome}!`)
    }
    setSending(null)
  }

  async function handleResetSenha() {
    if (!editando) return
    if (!confirm(`Resetar senha de ${editando.nome}? Um novo convite será enviado via WhatsApp.`)) return
    setSaving(true)
    setFormError('')
    const res = await fetch(`/api/admin/clinicas/${editando.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resetar_senha: true }),
    })
    if (res.ok) {
      await load()
      setModal(null)
    } else {
      const err = await res.json()
      setFormError(err.error ?? 'Erro ao resetar senha.')
    }
    setSaving(false)
  }

  function toggleVet(id: number) {
    setVetIds(prev => prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id])
  }

  function fmt(d: string) {
    return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-[#19202d]">
          Clínicas Parceiras
          {!loading && <span className="ml-2 text-sm font-normal text-gray-400">({clinicas.length})</span>}
        </h1>
        <button
          onClick={openNova}
          className="bg-[#c4a35a] hover:bg-[#a88a47] text-white font-bold px-4 py-2.5 rounded-lg text-sm transition"
        >
          + Nova clínica
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Carregando...</div>
      ) : clinicas.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl shadow-sm border">
          <div className="text-5xl mb-4">🏥</div>
          <p className="text-gray-500">Nenhuma clínica cadastrada.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="h-1 bg-gold-stripe" />
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Nome', 'E-mail', 'Telefone', 'Vets', 'Status', 'Convite', 'Cadastro', 'Ações'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-bold text-[#19202d] uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {clinicas.map(c => (
                  <tr key={c.id} className="hover:bg-amber-50/30 transition">
                    <td className="px-4 py-4 font-semibold text-[#19202d]">{c.nome}</td>
                    <td className="px-4 py-4 text-gray-500 text-sm">{c.email}</td>
                    <td className="px-4 py-4 text-gray-500 text-sm">{c.telefone ?? '—'}</td>
                    <td className="px-4 py-4 text-gray-600 font-semibold text-center">{c.total_vets}</td>
                    <td className="px-4 py-4">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                        c.ativo
                          ? 'bg-green-50 text-green-700 border border-green-200'
                          : 'bg-red-50 text-red-600 border border-red-200'
                      }`}>
                        {c.ativo ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                        c.convite_aceito
                          ? 'bg-green-50 text-green-700 border border-green-200'
                          : 'bg-amber-50 text-[#8a6e36] border border-[#8a6e36]/20'
                      }`}>
                        {c.convite_aceito ? '✓ Aceito' : '⏳ Pendente'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-gray-400 text-sm whitespace-nowrap">{fmt(c.criado_em)}</td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEditar(c)}
                          className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition whitespace-nowrap"
                        >
                          Editar
                        </button>
                        {!c.convite_aceito && (
                          <button
                            onClick={() => handleReenviar(c)}
                            disabled={sending === c.id}
                            className="text-xs px-3 py-1.5 rounded-lg bg-amber-50 text-[#8a6e36] border border-[#8a6e36]/20 hover:bg-amber-100 transition disabled:opacity-50 whitespace-nowrap"
                          >
                            {sending === c.id ? 'Enviando...' : '↩ Reenviar convite'}
                          </button>
                        )}
                        <button
                          onClick={() => handleToggleAtivo(c)}
                          className={`text-xs px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
                            c.ativo
                              ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
                              : 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100'
                          }`}
                        >
                          {c.ativo ? 'Desativar' : 'Ativar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-[#19202d] px-6 py-4 flex items-center justify-between shrink-0">
              <h3 className="text-white font-bold">
                {modal === 'nova' ? 'Nova clínica parceira' : `Editar — ${editando?.nome}`}
              </h3>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
            </div>

            <form onSubmit={handleSalvar} className="overflow-y-auto">
              <div className="p-6 space-y-4">
                {[
                  { key: 'nome',     label: 'Nome',     type: 'text',  required: true  },
                  { key: 'email',    label: 'E-mail',   type: 'email', required: true  },
                  { key: 'telefone', label: 'Telefone (WhatsApp)', type: 'text', required: false },
                  { key: 'endereco', label: 'Endereço', type: 'text',  required: false },
                ].map(f => (
                  <div key={f.key}>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                      {f.label}
                    </label>
                    <input
                      type={f.type}
                      value={form[f.key as keyof typeof form]}
                      onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                      required={f.required}
                      className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36]"
                    />
                  </div>
                ))}

                {/* Veterinários */}
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                    Veterinários vinculados
                  </label>
                  <div className="border border-gray-200 rounded-lg overflow-hidden max-h-44 overflow-y-auto">
                    {vets.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-4">Nenhum veterinário cadastrado.</p>
                    ) : (
                      vets.map(v => {
                        const checked = vetIds.includes(v.id)
                        const outraClinica = v.clinica_id && v.clinica_id !== editando?.id
                        return (
                          <label
                            key={v.id}
                            className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50 transition border-b border-gray-100 last:border-0 ${
                              outraClinica ? 'opacity-50 cursor-not-allowed' : ''
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => !outraClinica && toggleVet(v.id)}
                              disabled={!!outraClinica}
                              className="accent-[#8a6e36]"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-[#19202d] truncate">{v.nome}</p>
                              <p className="text-xs text-gray-400 truncate">{v.email}</p>
                            </div>
                            {outraClinica && (
                              <span className="text-xs text-gray-400 shrink-0">Outra clínica</span>
                            )}
                          </label>
                        )
                      })
                    )}
                  </div>
                </div>

                {/* Exames permitidos — só aparece ao editar */}
                {modal === 'editar' && examesInfo.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                      Exames que a clínica pode agendar
                    </label>
                    <div className="border border-gray-200 rounded-lg overflow-hidden max-h-44 overflow-y-auto">
                      {examesInfo.map(ex => (
                        <label
                          key={ex.tipo_exame}
                          className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50 transition border-b border-gray-100 last:border-0"
                        >
                          <input
                            type="checkbox"
                            checked={examesSel.has(ex.tipo_exame)}
                            onChange={() => setExamesSel(prev => {
                              const next = new Set(prev)
                              next.has(ex.tipo_exame) ? next.delete(ex.tipo_exame) : next.add(ex.tipo_exame)
                              return next
                            })}
                            className="accent-[#8a6e36]"
                          />
                          <span className="text-sm text-[#19202d]">{ex.tipo_exame}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {formError && (
                  <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>
                )}
              </div>

              <div className="px-6 pb-6 flex gap-3 shrink-0">
                {modal === 'editar' && (
                  <button
                    type="button"
                    onClick={handleResetSenha}
                    disabled={saving}
                    className="text-xs px-3 py-2.5 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 transition disabled:opacity-50"
                  >
                    🔑 Resetar senha
                  </button>
                )}
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="px-4 py-2.5 border border-gray-200 text-gray-500 rounded-lg text-sm hover:bg-gray-50 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 bg-[#19202d] hover:bg-[#232d3f] text-white font-semibold rounded-lg text-sm transition disabled:opacity-60"
                >
                  {saving ? 'Salvando...' : modal === 'nova' ? 'Criar clínica' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
