'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'

export default function VetLoginPage() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await fetch('/api/vet/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (res.ok) {
      router.push('/vet/dashboard')
    } else {
      const data = await res.json()
      setError(data.error ?? 'Erro ao fazer login.')
      setLoading(false)
    }
  }

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
            <p className="text-[#c4a35a] text-xs mt-1 tracking-wide leading-relaxed text-center">
              Portal do Veterinário
            </p>
          </div>
          <div className="w-full h-px bg-gold-stripe rounded opacity-60" />
        </div>

        <div className="px-8 py-7">
          <p className="text-sm text-gray-400 mb-5 text-center">Acesse seus laudos</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                E-mail
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                autoFocus
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36] focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                Senha
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
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
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <div className="flex justify-between text-xs text-gray-400 mt-5">
            <Link href="/vet/recuperar" className="hover:text-[#8a6e36] transition">
              Esqueci minha senha
            </Link>
            <Link href="/vet/cadastro" className="text-[#8a6e36] hover:underline">
              Primeiro acesso
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
