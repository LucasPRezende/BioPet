'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'

function CadastroForm() {
  const searchParams = useSearchParams()
  const token        = searchParams.get('token') ?? ''
  const router       = useRouter()

  const [email,     setEmail]     = useState('')
  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')
  const [error,     setError]     = useState('')
  const [loading,   setLoading]   = useState(false)
  const [tokenOk,   setTokenOk]   = useState<boolean | null>(null)

  // Valida token ao carregar
  useEffect(() => {
    if (!token) { setTokenOk(false); return }
    // Validação rápida — o server verifica de fato no POST
    setTokenOk(true)
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim())        { setError('Informe o seu e-mail.'); return }
    if (password !== confirm) { setError('As senhas não coincidem.'); return }
    if (password.length < 6)  { setError('A senha deve ter pelo menos 6 caracteres.'); return }

    setLoading(true)
    setError('')

    const res = await fetch('/api/vet/cadastro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, email: email.trim().toLowerCase(), password }),
    })

    if (res.ok) {
      router.push('/vet/dashboard')
    } else {
      const data = await res.json()
      setError(data.error ?? 'Erro ao cadastrar.')
      setLoading(false)
    }
  }

  if (tokenOk === false) {
    return (
      <div className="text-center py-8">
        <div className="text-4xl mb-4">⚠️</div>
        <p className="text-gray-600 font-medium">Link inválido ou expirado.</p>
        <p className="text-gray-400 text-sm mt-2">
          Peça à clínica para reenviar o convite.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-gray-400 text-center mb-2">
        Complete seu cadastro para acessar o portal
      </p>
      <div>
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
          E-mail <span className="text-red-400">*</span>
        </label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="seu@email.com"
          required
          autoFocus
          className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36]"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
          Nova senha <span className="text-red-400">*</span>
        </label>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Mínimo 6 caracteres"
          required
          autoFocus
          className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36]"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
          Confirmar senha
        </label>
        <input
          type="password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          placeholder="Repita a senha"
          required
          className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36]"
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
        {loading ? 'Salvando...' : 'Criar senha e acessar'}
      </button>
    </form>
  )
}

export default function VetCadastroPage() {
  return (
    <div className="min-h-screen bg-[#19202d] flex items-center justify-center px-4">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gold-stripe" />

      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="bg-[#19202d] px-8 pt-8 pb-7 flex flex-col items-center gap-4">
          <div className="relative w-20 h-20">
            <Image src="/logo.png" alt="BioPet" fill className="object-contain drop-shadow-lg" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white tracking-wider">BioPet</h1>
            <p className="text-[#c4a35a] text-xs mt-1 tracking-wide">Bem-vindo ao portal</p>
          </div>
          <div className="w-full h-px bg-gold-stripe rounded opacity-60" />
        </div>

        <div className="px-8 py-7">
          <Suspense fallback={<div className="text-center py-4 text-gray-400 text-sm">Carregando...</div>}>
            <CadastroForm />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
