'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'

// ── Formulário de solicitação (sem token) ────────────────────────────────────
function SolicitarForm() {
  const [email,   setEmail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [done,    setDone]    = useState(false)
  const [error,   setError]   = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await fetch('/api/vet/recuperar/solicitar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    if (res.ok) {
      setDone(true)
    } else {
      const data = await res.json()
      setError(data.error ?? 'Erro ao processar solicitação.')
    }
    setLoading(false)
  }

  if (done) {
    return (
      <div className="text-center py-4 space-y-3">
        <div className="text-4xl">📲</div>
        <p className="text-[#19202d] font-semibold">Verifique seu WhatsApp!</p>
        <p className="text-gray-400 text-sm">
          Se o e-mail estiver cadastrado, você receberá um link para redefinir sua senha.
        </p>
        <Link href="/vet/login" className="block text-[#8a6e36] hover:underline text-sm mt-4">
          ← Voltar ao login
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-gray-400 text-center">
        Informe seu e-mail e enviaremos um link pelo WhatsApp para redefinir sua senha.
      </p>
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
          className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36]"
        />
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-[#19202d] hover:bg-[#232d3f] disabled:opacity-60 text-white font-bold py-3 rounded-lg transition text-sm"
      >
        {loading ? 'Enviando...' : 'Enviar link pelo WhatsApp'}
      </button>

      <Link href="/vet/login" className="block text-center text-xs text-gray-400 hover:text-gray-600 transition">
        ← Voltar ao login
      </Link>
    </form>
  )
}

// ── Formulário de redefinição (com token na URL) ──────────────────────────────
function RedefinirForm({ token }: { token: string }) {
  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError('As senhas não coincidem.'); return }
    if (password.length < 6)  { setError('A senha deve ter pelo menos 6 caracteres.'); return }

    setLoading(true)
    setError('')

    const res = await fetch('/api/vet/recuperar/confirmar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    })

    if (res.ok) {
      router.push('/vet/dashboard')
    } else {
      const data = await res.json()
      setError(data.error ?? 'Erro ao redefinir senha.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-gray-400 text-center">Escolha uma nova senha para sua conta.</p>
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
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-[#19202d] hover:bg-[#232d3f] disabled:opacity-60 text-white font-bold py-3 rounded-lg transition text-sm"
      >
        {loading ? 'Salvando...' : 'Redefinir senha e entrar'}
      </button>
    </form>
  )
}

// ── Wrapper com useSearchParams ───────────────────────────────────────────────
function RecuperarContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''

  return token ? <RedefinirForm token={token} /> : <SolicitarForm />
}

// ── Página ────────────────────────────────────────────────────────────────────
export default function RecuperarPage() {
  return (
    <div className="min-h-screen bg-[#19202d] flex items-center justify-center px-4">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gold-stripe" />

      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="bg-[#19202d] px-8 pt-8 pb-7 flex flex-col items-center gap-4">
          <div className="relative w-20 h-20">
            <Image src="/logo.png" alt="BioPet" fill className="object-contain drop-shadow-lg" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold text-white">Recuperar Senha</h1>
            <p className="text-[#c4a35a] text-xs mt-1 tracking-wide">Portal do Veterinário</p>
          </div>
          <div className="w-full h-px bg-gold-stripe rounded opacity-60" />
        </div>

        <div className="px-8 py-7">
          <Suspense fallback={<div className="text-center py-4 text-gray-400 text-sm">Carregando...</div>}>
            <RecuperarContent />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
