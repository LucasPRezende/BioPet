'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

interface Laudo {
  id: number
  nome_pet: string
  especie: string
  tutor: string
  tipo: string
  original_name: string
  token: string
  created_at: string
}

interface Perfil {
  id: number
  nome: string
  email: string
  whatsapp: string
}

export default function VetDashboard() {
  const [laudos,  setLaudos]  = useState<Laudo[]>([])
  const [perfil,  setPerfil]  = useState<Perfil | null>(null)
  const [loading, setLoading] = useState(true)
  const [editModal, setEditModal] = useState(false)
  const [editForm, setEditForm]   = useState({ nome: '', email: '', whatsapp: '' })
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError]     = useState('')
  const router = useRouter()

  const load = useCallback(async () => {
    const [laudosRes, perfilRes] = await Promise.all([
      fetch('/api/vet/laudos'),
      fetch('/api/vet/perfil'),
    ])
    if (laudosRes.status === 401 || perfilRes.status === 401) {
      router.push('/vet/login')
      return
    }
    if (laudosRes.ok)  setLaudos(await laudosRes.json())
    if (perfilRes.ok) {
      const p = await perfilRes.json()
      setPerfil(p)
      setEditForm({ nome: p.nome, email: p.email, whatsapp: p.whatsapp ?? '' })
    }
    setLoading(false)
  }, [router])

  useEffect(() => { load() }, [load])

  async function handleLogout() {
    await fetch('/api/vet/auth', { method: 'DELETE' })
    router.push('/vet/login')
  }

  async function handleSavePerfil(e: React.FormEvent) {
    e.preventDefault()
    setEditLoading(true)
    setEditError('')
    const res = await fetch('/api/vet/perfil', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    if (res.ok) {
      const updated = await res.json()
      setPerfil(prev => ({ ...prev!, ...updated }))
      setEditModal(false)
    } else {
      const err = await res.json()
      setEditError(err.error ?? 'Erro ao salvar.')
    }
    setEditLoading(false)
  }

  function fmt(d: string) {
    return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#19202d] text-white shadow-lg">
        <div className="h-1 bg-gold-stripe" />
        <div className="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 shrink-0">
              <Image src="/logo.png" alt="BioPet" fill className="object-contain" />
            </div>
            <div>
              <span className="font-bold text-base">BioPet</span>
              <span className="text-[#c4a35a] text-[10px] block leading-none tracking-wide">
                Portal do Veterinário
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {perfil && (
              <button
                onClick={() => setEditModal(true)}
                className="text-gray-300 hover:text-white text-sm transition"
              >
                ✏️ {perfil.nome}
              </button>
            )}
            <button onClick={handleLogout} className="text-gray-400 hover:text-white text-sm transition">
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-[#19202d]">
            Meus Laudos
            {!loading && (
              <span className="ml-2 text-sm font-normal text-gray-400">({laudos.length})</span>
            )}
          </h2>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400">Carregando...</div>
        ) : laudos.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl shadow-sm border">
            <div className="text-5xl mb-4">📋</div>
            <p className="text-gray-500">Nenhum laudo vinculado ao seu perfil ainda.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="h-1 bg-gold-stripe" />
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Pet', 'Espécie', 'Resp. Legal', 'Tipo', 'Data', 'Ações'].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-bold text-[#19202d] uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {laudos.map(l => (
                  <tr key={l.id} className="hover:bg-amber-50/30 transition">
                    <td className="px-5 py-4 font-semibold text-[#19202d]">{l.nome_pet}</td>
                    <td className="px-5 py-4 text-gray-500 text-sm">{l.especie}</td>
                    <td className="px-5 py-4 text-gray-700">{l.tutor}</td>
                    <td className="px-5 py-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        l.tipo === 'gerado'
                          ? 'bg-amber-50 text-[#8a6e36] border border-[#8a6e36]/20'
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {l.tipo === 'gerado' ? 'Gerado' : 'Upload'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-gray-400 text-sm">{fmt(l.created_at)}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <a
                          href={`/laudo/${l.token}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
                        >
                          Ver
                        </a>
                        <a
                          href={`/api/pdf/${l.id}?download=1`}
                          className="text-xs px-3 py-1.5 rounded-lg bg-[#19202d] text-white hover:bg-[#232d3f] transition"
                        >
                          ⬇ PDF
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Modal editar perfil */}
      {editModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-[#19202d] px-6 py-4 flex items-center justify-between">
              <h3 className="text-white font-bold">Editar Perfil</h3>
              <button onClick={() => setEditModal(false)} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
            </div>
            <form onSubmit={handleSavePerfil} className="p-6 space-y-4">
              {(['nome', 'email', 'whatsapp'] as const).map(field => (
                <div key={field}>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5 capitalize">
                    {field === 'whatsapp' ? 'WhatsApp' : field.charAt(0).toUpperCase() + field.slice(1)}
                  </label>
                  <input
                    type={field === 'email' ? 'email' : 'text'}
                    value={editForm[field]}
                    onChange={e => setEditForm(p => ({ ...p, [field]: e.target.value }))}
                    required={field !== 'whatsapp'}
                    className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36]"
                  />
                </div>
              ))}

              {editError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{editError}</p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setEditModal(false)}
                  className="flex-1 border border-gray-200 text-gray-500 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="flex-1 bg-[#19202d] hover:bg-[#232d3f] text-white font-semibold py-2.5 rounded-lg text-sm transition disabled:opacity-60"
                >
                  {editLoading ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
