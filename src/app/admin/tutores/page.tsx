'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface Pet  { id: number; nome: string; especie: string | null; raca: string | null; sexo: string | null }
interface Tutor {
  id:            number
  telefone:      string
  nome:          string | null
  criado_em:     string
  pets:          Pet[]
  agendamentos:  { id: number }[]
}

const ESPECIES      = ['Cachorro','Gato','Pássaro','Coelho','Hamster','Réptil','Outro']
const SEXOS         = ['Macho', 'Fêmea', 'Não informado']
const ESPECIES_ICON: Record<string, string> = {
  'Cachorro':'🐶','Gato':'🐱','Pássaro':'🐦','Coelho':'🐰','Hamster':'🐹','Réptil':'🦎',
}

function especieIcon(e: string | null) { return e ? (ESPECIES_ICON[e] ?? '🐾') : '🐾' }
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day:'2-digit', month:'short', year:'numeric' })
}

const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36]'

export default function TutoresPage() {
  const router = useRouter()
  const [tutores,  setTutores]  = useState<Tutor[]>([])
  const [loading,  setLoading]  = useState(true)
  const [busca,    setBusca]    = useState('')

  // Modal novo tutor
  const [novoTutorModal, setNovoTutorModal] = useState(false)
  const [novoTutorForm,  setNovoTutorForm]  = useState({ nome: '', telefone: '' })
  const [novoTutorSaving, setNovoTutorSaving] = useState(false)
  const [novoTutorError,  setNovoTutorError]  = useState('')

  // Modal editar tutor
  const [editTutor,       setEditTutor]       = useState<Tutor | null>(null)
  const [editTutorForm,   setEditTutorForm]   = useState({ nome: '', telefone: '' })
  const [editTutorSaving, setEditTutorSaving] = useState(false)
  const [editTutorError,  setEditTutorError]  = useState('')

  // Modal novo pet
  const [petTutor,     setPetTutor]     = useState<Tutor | null>(null)
  const [petForm,      setPetForm]      = useState({ nome: '', especie: '', raca: '', sexo: '' })
  const [petSaving,    setPetSaving]    = useState(false)
  const [petError,     setPetError]     = useState('')

  const load = useCallback(async () => {
    const res = await fetch('/api/tutores')
    if (res.status === 401) { router.push('/login'); return }
    if (res.ok) setTutores(await res.json())
    setLoading(false)
  }, [router])

  useEffect(() => { load() }, [load])

  const filtrados = useMemo(() => {
    const q = busca.toLowerCase().trim()
    if (!q) return tutores
    return tutores.filter(t =>
      t.nome?.toLowerCase().includes(q) ||
      t.telefone.includes(q) ||
      t.pets.some(p => p.nome.toLowerCase().includes(q))
    )
  }, [tutores, busca])

  const totalPets         = tutores.reduce((s, t) => s + t.pets.length, 0)
  const totalAgendamentos = tutores.reduce((s, t) => s + t.agendamentos.length, 0)

  // ── Novo tutor ────────────────────────────────────────────────────────────
  async function handleNovoTutor(e: React.FormEvent) {
    e.preventDefault()
    setNovoTutorSaving(true); setNovoTutorError('')
    const res = await fetch('/api/tutores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(novoTutorForm),
    })
    if (res.ok) {
      await load()
      setNovoTutorModal(false)
      setNovoTutorForm({ nome: '', telefone: '' })
    } else {
      const d = await res.json()
      setNovoTutorError(d.error ?? 'Erro ao cadastrar.')
    }
    setNovoTutorSaving(false)
  }

  // ── Editar tutor ──────────────────────────────────────────────────────────
  function openEdit(t: Tutor) {
    setEditTutor(t)
    setEditTutorForm({ nome: t.nome ?? '', telefone: t.telefone })
    setEditTutorError('')
  }

  async function handleEditTutor(e: React.FormEvent) {
    e.preventDefault()
    if (!editTutor) return
    setEditTutorSaving(true); setEditTutorError('')
    const res = await fetch(`/api/tutores/${editTutor.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editTutorForm),
    })
    if (res.ok) {
      await load()
      setEditTutor(null)
    } else {
      const d = await res.json()
      setEditTutorError(d.error ?? 'Erro ao salvar.')
    }
    setEditTutorSaving(false)
  }

  // ── Novo pet ──────────────────────────────────────────────────────────────
  function openNovoPet(t: Tutor) {
    setPetTutor(t)
    setPetForm({ nome: '', especie: '', raca: '', sexo: '' })
    setPetError('')
  }

  async function handleNovoPet(e: React.FormEvent) {
    e.preventDefault()
    if (!petTutor) return
    setPetSaving(true); setPetError('')
    const res = await fetch(`/api/tutores/${petTutor.id}/pets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(petForm),
    })
    if (res.ok) {
      await load()
      setPetTutor(null)
    } else {
      const d = await res.json()
      setPetError(d.error ?? 'Erro ao cadastrar pet.')
    }
    setPetSaving(false)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-5xl mx-auto px-4 py-7 space-y-5">

        {/* Resumo */}
        {!loading && (
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Tutores',      value: tutores.length },
              { label: 'Pets',         value: totalPets },
              { label: 'Agendamentos', value: totalAgendamentos },
            ].map(c => (
              <div key={c.label} className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="h-1 bg-gold-stripe" />
                <div className="p-4 text-center">
                  <p className="text-2xl font-bold text-[#19202d]">{c.value}</p>
                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mt-0.5">{c.label}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Busca + novo tutor */}
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="h-1 bg-gold-stripe" />
          <div className="p-4 flex gap-3">
            <input
              type="text"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por nome, telefone ou nome do pet..."
              className="flex-1 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36]"
            />
            <button
              onClick={() => { setNovoTutorForm({ nome: '', telefone: '' }); setNovoTutorError(''); setNovoTutorModal(true) }}
              className="shrink-0 bg-[#c4a35a] hover:bg-[#a88a47] text-white font-bold px-4 py-2.5 rounded-lg text-sm transition"
            >
              + Novo tutor
            </button>
          </div>
          {busca && (
            <p className="text-xs text-gray-400 px-4 pb-3">
              {filtrados.length} resultado{filtrados.length !== 1 ? 's' : ''} para &quot;{busca}&quot;
            </p>
          )}
        </div>

        {/* Lista */}
        {loading ? (
          <div className="text-center py-16 text-gray-400">Carregando tutores...</div>
        ) : filtrados.length === 0 ? (
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="h-1 bg-gold-stripe" />
            <div className="text-center py-16 text-gray-400">
              <p className="text-3xl mb-2">👤</p>
              <p className="font-medium text-sm">{busca ? 'Nenhum resultado encontrado' : 'Nenhum tutor cadastrado ainda'}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {filtrados.map(tutor => (
              <div key={tutor.id} className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="h-1 bg-gold-stripe" />
                <div className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-4 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-[#19202d] flex items-center justify-center shrink-0">
                        <span className="text-[#c4a35a] font-bold text-sm">
                          {(tutor.nome ?? tutor.telefone).charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-[#19202d] text-[15px]">
                          {tutor.nome ?? <span className="text-gray-400 font-normal italic">Sem nome</span>}
                        </p>
                        <p className="text-sm text-gray-500 mt-0.5">{tutor.telefone}</p>
                        <p className="text-xs text-gray-400 mt-0.5">Cadastrado em {formatDate(tutor.criado_em)}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      <div className="text-center px-3 py-1.5 bg-gray-50 rounded-lg">
                        <p className="text-lg font-bold text-[#19202d] leading-none">{tutor.agendamentos.length}</p>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">agend.</p>
                      </div>
                      <button
                        onClick={() => openNovoPet(tutor)}
                        className="text-xs font-semibold text-[#8a6e36] bg-amber-50 border border-[#8a6e36]/20 px-3 py-2 rounded-lg hover:bg-amber-100 transition"
                      >
                        + Pet
                      </button>
                      <button
                        onClick={() => openEdit(tutor)}
                        className="text-xs font-semibold text-gray-600 bg-gray-100 border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-200 transition"
                      >
                        ✏️ Editar
                      </button>
                    </div>
                  </div>

                  {tutor.pets.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-50">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Pets</p>
                      <div className="flex flex-wrap gap-2">
                        {tutor.pets.map(pet => (
                          <div key={pet.id}
                            className="flex items-center gap-1.5 bg-gray-50 border border-gray-100 px-3 py-1.5 rounded-full text-sm">
                            <span>{especieIcon(pet.especie)}</span>
                            <span className="font-medium text-[#19202d]">{pet.nome}</span>
                            {pet.especie && <span className="text-gray-400 text-xs">· {pet.especie}</span>}
                            {pet.raca    && <span className="text-gray-400 text-xs">· {pet.raca}</span>}
                            {pet.sexo    && <span className="text-gray-400 text-xs">· {pet.sexo}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modal novo tutor */}
      {novoTutorModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-[#19202d] px-6 py-4 flex items-center justify-between">
              <h3 className="text-white font-bold">Novo tutor</h3>
              <button onClick={() => setNovoTutorModal(false)} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
            </div>
            <form onSubmit={handleNovoTutor} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                  Telefone (WhatsApp) <span className="text-red-400">*</span>
                </label>
                <input type="tel" value={novoTutorForm.telefone}
                  onChange={e => setNovoTutorForm(p => ({ ...p, telefone: e.target.value }))}
                  placeholder="(24) 99999-9999" required className={INPUT} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Nome</label>
                <input type="text" value={novoTutorForm.nome}
                  onChange={e => setNovoTutorForm(p => ({ ...p, nome: e.target.value }))}
                  placeholder="Nome completo" className={INPUT} />
              </div>
              {novoTutorError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{novoTutorError}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setNovoTutorModal(false)}
                  className="flex-1 border border-gray-200 text-gray-500 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition">
                  Cancelar
                </button>
                <button type="submit" disabled={novoTutorSaving}
                  className="flex-1 bg-[#19202d] hover:bg-[#232d3f] text-white font-semibold py-2.5 rounded-lg text-sm transition disabled:opacity-60">
                  {novoTutorSaving ? 'Salvando...' : 'Cadastrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal editar tutor */}
      {editTutor && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-[#19202d] px-6 py-4 flex items-center justify-between">
              <h3 className="text-white font-bold">Editar tutor</h3>
              <button onClick={() => setEditTutor(null)} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
            </div>
            <form onSubmit={handleEditTutor} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Nome</label>
                <input type="text" value={editTutorForm.nome}
                  onChange={e => setEditTutorForm(p => ({ ...p, nome: e.target.value }))}
                  placeholder="Nome completo" className={INPUT} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Telefone</label>
                <input type="tel" value={editTutorForm.telefone}
                  onChange={e => setEditTutorForm(p => ({ ...p, telefone: e.target.value }))}
                  placeholder="(24) 99999-9999" className={INPUT} />
              </div>
              {editTutorError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{editTutorError}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setEditTutor(null)}
                  className="flex-1 border border-gray-200 text-gray-500 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition">
                  Cancelar
                </button>
                <button type="submit" disabled={editTutorSaving}
                  className="flex-1 bg-[#19202d] hover:bg-[#232d3f] text-white font-semibold py-2.5 rounded-lg text-sm transition disabled:opacity-60">
                  {editTutorSaving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal novo pet */}
      {petTutor && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-[#19202d] px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-white font-bold">Novo pet</h3>
                <p className="text-gray-400 text-xs mt-0.5">{petTutor.nome ?? petTutor.telefone}</p>
              </div>
              <button onClick={() => setPetTutor(null)} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
            </div>
            <form onSubmit={handleNovoPet} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                  Nome do pet <span className="text-red-400">*</span>
                </label>
                <input type="text" value={petForm.nome}
                  onChange={e => setPetForm(p => ({ ...p, nome: e.target.value }))}
                  placeholder="Ex: Thor" required className={INPUT} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Espécie</label>
                <select value={petForm.especie} onChange={e => setPetForm(p => ({ ...p, especie: e.target.value }))} className={INPUT}>
                  <option value="">—</option>
                  {ESPECIES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Raça</label>
                <input type="text" value={petForm.raca}
                  onChange={e => setPetForm(p => ({ ...p, raca: e.target.value }))}
                  placeholder="Ex: Golden Retriever" className={INPUT} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Sexo</label>
                <select value={petForm.sexo} onChange={e => setPetForm(p => ({ ...p, sexo: e.target.value }))} className={INPUT}>
                  <option value="">—</option>
                  {SEXOS.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              {petError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{petError}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setPetTutor(null)}
                  className="flex-1 border border-gray-200 text-gray-500 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition">
                  Cancelar
                </button>
                <button type="submit" disabled={petSaving}
                  className="flex-1 bg-[#19202d] hover:bg-[#232d3f] text-white font-semibold py-2.5 rounded-lg text-sm transition disabled:opacity-60">
                  {petSaving ? 'Salvando...' : 'Cadastrar pet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
