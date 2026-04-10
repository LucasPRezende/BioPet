'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'


interface SystemUser {
  id: number
  nome: string
  email: string
  role: string
  ativo: boolean
  primeira_senha: boolean
  recebe_comissao: boolean
  criado_em: string
}

const INPUT = 'w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36] focus:border-transparent bg-white'

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ── Modal: Novo Usuário ────────────────────────────────────────────────────────
function NovoUsuarioModal({ onClose, onCreated }: {
  onClose: () => void
  onCreated: (u: SystemUser) => void
}) {
  const [form, setForm] = useState({ nome: '', email: '', senha: '', role: 'user', recebe_comissao: true })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await fetch('/api/system-users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, recebe_comissao: form.recebe_comissao }),
    })
    const data = await res.json()
    if (res.ok) {
      onCreated(data)
    } else {
      setError(data.error ?? 'Erro ao criar usuário.')
    }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="bg-[#19202d] px-6 py-4 flex items-center justify-between">
          <h3 className="text-white font-bold text-sm">Novo Usuário</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Nome *</label>
            <input type="text" value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))}
              placeholder="Nome completo" required autoFocus className={INPUT} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">E-mail *</label>
            <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
              placeholder="email@biopet.com" required className={INPUT} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Senha Temporária *</label>
            <input type="text" value={form.senha} onChange={e => setForm(p => ({ ...p, senha: e.target.value }))}
              placeholder="Mínimo 6 caracteres" required minLength={6} className={INPUT} />
            <p className="text-xs text-gray-400 mt-1">O usuário deverá trocar no primeiro login.</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Perfil *</label>
            <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} className={INPUT}>
              <option value="user">Usuário</option>
              <option value="admin">Administrador</option>
            </select>
          </div>
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div>
              <p className="text-sm font-medium text-[#19202d]">Recebe comissão por exame</p>
              <p className="text-xs text-gray-400 mt-0.5">Desative para quem tem salário fixo</p>
            </div>
            <button
              type="button"
              onClick={() => setForm(p => ({ ...p, recebe_comissao: !p.recebe_comissao }))}
              className={`relative w-11 h-6 rounded-full transition-colors ${form.recebe_comissao ? 'bg-[#19202d]' : 'bg-gray-300'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.recebe_comissao ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
          <div className="flex gap-3 pt-1">
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

// ── Modal: Reset de Senha ──────────────────────────────────────────────────────
function ResetSenhaModal({ user, onClose, onDone }: {
  user: SystemUser
  onClose: () => void
  onDone: () => void
}) {
  const [novaSenha, setNovaSenha] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await fetch(`/api/system-users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset_senha: novaSenha }),
    })
    const data = await res.json()
    if (res.ok) {
      setSuccess(true)
      onDone()
    } else {
      setError(data.error ?? 'Erro ao resetar senha.')
    }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="bg-[#19202d] px-6 py-4 flex items-center justify-between">
          <h3 className="text-white font-bold text-sm">Resetar Senha — {user.nome}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
        </div>
        {success ? (
          <div className="p-6 text-center">
            <div className="text-3xl mb-3">✅</div>
            <p className="font-semibold text-[#19202d]">Senha resetada!</p>
            <p className="text-xs text-gray-400 mt-1">O usuário deverá trocar no próximo login.</p>
            <button onClick={onClose}
              className="mt-5 w-full bg-[#19202d] text-white font-semibold py-2.5 rounded-lg text-sm hover:bg-[#232d3f] transition">
              Fechar
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Nova Senha Temporária</label>
              <input type="text" value={novaSenha} onChange={e => setNovaSenha(e.target.value)}
                placeholder="Mínimo 6 caracteres" required minLength={6} autoFocus className={INPUT} />
            </div>
            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}
            <div className="flex gap-3">
              <button type="button" onClick={onClose}
                className="flex-1 border border-gray-200 text-gray-500 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition">
                Cancelar
              </button>
              <button type="submit" disabled={loading}
                className="flex-1 bg-[#19202d] hover:bg-[#232d3f] text-white font-semibold py-2.5 rounded-lg text-sm transition disabled:opacity-60">
                {loading ? 'Salvando...' : 'Resetar'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────────────────────
export default function UsuariosPage() {
  const [users, setUsers] = useState<SystemUser[]>([])
  const [loading, setLoading] = useState(true)
  const [novoModal, setNovoModal] = useState(false)
  const [resetModal, setResetModal] = useState<SystemUser | null>(null)

  const fetchUsers = useCallback(async () => {
    const res = await fetch('/api/system-users')
    if (res.ok) setUsers(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  async function toggleAtivo(user: SystemUser) {
    const res = await fetch(`/api/system-users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo: !user.ativo }),
    })
    if (res.ok) {
      const updated = await res.json()
      setUsers(prev => prev.map(u => u.id === updated.id ? updated : u))
    }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  return (
    <div className="min-h-screen bg-gray-50">


      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-[#19202d]">
            Usuários do Sistema
            {!loading && (
              <span className="ml-2 text-sm font-normal text-gray-400">({users.length})</span>
            )}
          </h2>
          <button
            onClick={() => setNovoModal(true)}
            className="bg-[#19202d] hover:bg-[#232d3f] text-white font-semibold px-4 py-2 rounded-lg transition text-sm"
          >
            + Novo Usuário
          </button>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400">Carregando...</div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="h-1 bg-gold-stripe" />
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Nome', 'E-mail', 'Perfil', 'Comissão', 'Status', 'Criado em', 'Ações'].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-bold text-[#19202d] uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map(user => (
                  <tr key={user.id} className="hover:bg-amber-50/30 transition">
                    <td className="px-5 py-4">
                      <span className="font-semibold text-[#19202d]">{user.nome}</span>
                      {user.primeira_senha && (
                        <span className="ml-2 text-[10px] bg-orange-50 text-orange-600 border border-orange-200 px-1.5 py-0.5 rounded">
                          Troca pendente
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-gray-600 text-sm">{user.email}</td>
                    <td className="px-5 py-4">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                        user.role === 'admin'
                          ? 'bg-amber-100 text-[#8a6e36]'
                          : 'bg-blue-50 text-blue-600'
                      }`}>
                        {user.role === 'admin' ? 'Admin' : 'Usuário'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => {
                          fetch(`/api/system-users/${user.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ recebe_comissao: !user.recebe_comissao }),
                          }).then(r => r.ok ? r.json() : null).then(u => {
                            if (u) setUsers(prev => prev.map(x => x.id === u.id ? u : x))
                          })
                        }}
                        className={`relative w-11 h-6 rounded-full transition-colors ${user.recebe_comissao ? 'bg-[#19202d]' : 'bg-gray-300'}`}
                        title={user.recebe_comissao ? 'Recebe comissão' : 'Salário fixo (sem comissão)'}
                      >
                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${user.recebe_comissao ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                        user.ativo ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-600'
                      }`}>
                        {user.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-gray-400 text-sm">{formatDate(user.criado_em)}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setResetModal(user)}
                          className="text-xs px-3 py-1.5 rounded-lg bg-amber-50 text-[#8a6e36] border border-[#8a6e36]/20 hover:bg-amber-100 transition"
                        >
                          Resetar senha
                        </button>
                        <button
                          onClick={() => toggleAtivo(user)}
                          className={`text-xs px-3 py-1.5 rounded-lg transition ${
                            user.ativo
                              ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
                              : 'bg-green-50 text-green-600 border border-green-200 hover:bg-green-100'
                          }`}
                        >
                          {user.ativo ? 'Desativar' : 'Ativar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {novoModal && (
        <NovoUsuarioModal
          onClose={() => setNovoModal(false)}
          onCreated={u => { setUsers(prev => [...prev, u]); setNovoModal(false) }}
        />
      )}

      {resetModal && (
        <ResetSenhaModal
          user={resetModal}
          onClose={() => setResetModal(null)}
          onDone={() => setResetModal(null)}
        />
      )}
    </div>
  )
}
