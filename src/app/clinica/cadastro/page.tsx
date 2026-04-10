'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'

function CadastroForm() {
  const [password,  setPassword]  = useState('')
  const [password2, setPassword2] = useState('')
  const [error,     setError]     = useState('')
  const [loading,   setLoading]   = useState(false)
  const router = useRouter()
  const params = useSearchParams()
  const token  = params.get('token') ?? ''

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== password2) {
      setError('As senhas não coincidem.')
      return
    }
    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.')
      return
    }
    setLoading(true)
    setError('')
    const res = await fetch('/api/clinica/cadastro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    })
    if (res.ok) {
      router.push('/clinica/laudos')
    } else {
      const data = await res.json()
      setError(data.error ?? 'Erro ao definir senha.')
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="text-center p-8">
        <p className="text-red-600 font-semibold">Token de convite não encontrado.</p>
        <p className="text-gray-400 text-sm mt-2">
          Use o link enviado via WhatsApp pela BioPet.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="px-8 py-7 space-y-4">
      <p className="text-sm text-gray-400 text-center mb-2">
        Defina uma nova senha para acessar o portal da sua clínica.
      </p>

      <div>
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
          Nova senha
        </label>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Mínimo 6 caracteres"
          required
          autoFocus
          className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36] focus:border-transparent"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
          Confirmar senha
        </label>
        <input
          type="password"
          value={password2}
          onChange={e => setPassword2(e.target.value)}
          placeholder="Repita a senha"
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
        {loading ? 'Salvando...' : 'Definir senha e entrar'}
      </button>
    </form>
  )
}

export default function ClinicaCadastroPage() {
  return (
    <div className="min-h-screen bg-[#19202d] flex items-center justify-center px-4">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gold-stripe" />

      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="bg-[#19202d] px-8 pt-8 pb-7 flex flex-col items-center gap-4">
          <div className="relative w-24 h-24">
            <Image src="/logo.png" alt="BioPet" fill className="object-contain drop-shadow-lg" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white tracking-wider">BioPet</h1>
            <p className="text-[#c4a35a] text-xs mt-1 tracking-wide leading-relaxed">
              Primeiro Acesso — Clínica Parceira
            </p>
          </div>
          <div className="w-full h-px bg-gold-stripe rounded opacity-60" />
        </div>

        <Suspense fallback={<div className="p-8 text-center text-gray-400">Carregando...</div>}>
          <CadastroForm />
        </Suspense>
      </div>
    </div>
  )
}
