'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

export default function TrocaSenhaPage() {
  const [senhaAtual,  setSenhaAtual]  = useState('')
  const [novaSenha,   setNovaSenha]   = useState('')
  const [confirmar,   setConfirmar]   = useState('')
  const [error,       setError]       = useState('')
  const [loading,     setLoading]     = useState(false)
  const [nomeUsuario, setNomeUsuario] = useState('')
  const router = useRouter()

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(u => { if (u) setNomeUsuario(u.nome) })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (novaSenha !== confirmar) {
      setError('As senhas não coincidem.')
      return
    }
    if (novaSenha.length < 6) {
      setError('A nova senha deve ter ao menos 6 caracteres.')
      return
    }
    if (novaSenha === senhaAtual) {
      setError('A nova senha deve ser diferente da senha atual.')
      return
    }

    setLoading(true)

    const res = await fetch('/api/auth/trocar-senha', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senha_atual: senhaAtual, nova_senha: novaSenha }),
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Erro ao trocar a senha.')
      setLoading(false)
      return
    }

    // Redireciona após troca bem-sucedida
    const meRes = await fetch('/api/auth/me')
    const me = await meRes.json()
    if (me.role === 'admin') {
      router.push('/admin/dashboard')
    } else {
      router.push('/admin/laudos')
    }
  }

  return (
    <div className="min-h-screen bg-[#19202d] flex items-center justify-center px-4">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gold-stripe" />

      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="bg-[#19202d] px-8 pt-8 pb-7 flex flex-col items-center gap-4">
          <div className="relative w-20 h-20">
            <Image src="/logo.png" alt="BioPet" fill className="object-contain drop-shadow-lg" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold text-white">Troca de Senha Obrigatória</h1>
            {nomeUsuario && (
              <p className="text-[#c4a35a] text-xs mt-1">Olá, {nomeUsuario.split(' ')[0]}!</p>
            )}
          </div>
          <div className="w-full h-px bg-gold-stripe rounded opacity-60" />
        </div>

        <div className="px-8 py-7">
          <p className="text-xs text-gray-400 mb-5 text-center bg-amber-50 border border-[#8a6e36]/20 rounded-lg px-3 py-2.5">
            Por segurança, defina uma nova senha antes de continuar.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                Senha Atual (temporária)
              </label>
              <input
                type="password"
                value={senhaAtual}
                onChange={e => setSenhaAtual(e.target.value)}
                placeholder="••••••••"
                required
                autoFocus
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36] focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                Nova Senha
              </label>
              <input
                type="password"
                value={novaSenha}
                onChange={e => setNovaSenha(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                required
                minLength={6}
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36] focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                Confirmar Nova Senha
              </label>
              <input
                type="password"
                value={confirmar}
                onChange={e => setConfirmar(e.target.value)}
                placeholder="Repita a nova senha"
                required
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36] focus:border-transparent"
              />
            </div>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#19202d] hover:bg-[#232d3f] disabled:opacity-60 text-white font-bold py-3 rounded-lg transition text-sm tracking-wide"
            >
              {loading ? 'Salvando...' : 'Definir Nova Senha'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
