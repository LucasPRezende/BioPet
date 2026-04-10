'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

interface Perfil {
  id: number
  nome: string
  email: string
  telefone: string | null
  endereco: string | null
  convite_aceito: boolean
}

function PerfilContent() {
  const [perfil,       setPerfil]       = useState<Perfil | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState('')
  const [success,      setSuccess]      = useState('')
  const [form,         setForm]         = useState({ nome: '', email: '', telefone: '', endereco: '' })
  const [senhaForm,    setSenhaForm]    = useState({ atual: '', nova: '', confirmar: '' })
  const [senhaError,   setSenhaError]   = useState('')
  const [senhaSuccess, setSenhaSuccess] = useState('')
  const [savingSenha,  setSavingSenha]  = useState(false)
  const router     = useRouter()
  const params     = useSearchParams()
  const trocarSenha = params.get('trocar_senha') === '1'

  const load = useCallback(async () => {
    const res = await fetch('/api/clinica/perfil')
    if (res.status === 401) { router.push('/clinica/login'); return }
    if (res.ok) {
      const p = await res.json()
      setPerfil(p)
      setForm({
        nome:     p.nome     ?? '',
        email:    p.email    ?? '',
        telefone: p.telefone ?? '',
        endereco: p.endereco ?? '',
      })
    }
    setLoading(false)
  }, [router])

  useEffect(() => { load() }, [load])

  async function handleSavePerfil(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')
    const res = await fetch('/api/clinica/perfil', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      const updated = await res.json()
      setPerfil(updated)
      setSuccess('Perfil atualizado com sucesso!')
    } else {
      const err = await res.json()
      setError(err.error ?? 'Erro ao salvar.')
    }
    setSaving(false)
  }

  async function handleSaveSenha(e: React.FormEvent) {
    e.preventDefault()
    setSenhaError('')
    setSenhaSuccess('')
    if (senhaForm.nova !== senhaForm.confirmar) {
      setSenhaError('As senhas não coincidem.')
      return
    }
    if (senhaForm.nova.length < 6) {
      setSenhaError('A nova senha deve ter pelo menos 6 caracteres.')
      return
    }
    setSavingSenha(true)
    const res = await fetch('/api/clinica/perfil', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senha_atual: senhaForm.atual, nova_senha: senhaForm.nova }),
    })
    if (res.ok) {
      setSenhaForm({ atual: '', nova: '', confirmar: '' })
      setSenhaSuccess('Senha alterada com sucesso!')
    } else {
      const err = await res.json()
      setSenhaError(err.error ?? 'Erro ao alterar senha.')
    }
    setSavingSenha(false)
  }

  if (loading) return <div className="text-center py-16 text-gray-400">Carregando...</div>

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-bold text-[#19202d]">Perfil da Clínica</h1>

      {trocarSenha && (
        <div className="bg-amber-50 border border-[#8a6e36]/30 rounded-xl px-4 py-3 text-sm text-[#8a6e36]">
          Por favor, troque sua senha temporária antes de continuar.
        </div>
      )}

      {/* Dados da clínica */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="h-1 bg-gold-stripe" />
        <div className="px-6 py-5">
          <h2 className="font-semibold text-[#19202d] mb-4">Dados da clínica</h2>
          <form onSubmit={handleSavePerfil} className="space-y-4">
            {[
              { key: 'nome',     label: 'Nome',     type: 'text',  required: true  },
              { key: 'email',    label: 'E-mail',   type: 'email', required: true  },
              { key: 'telefone', label: 'Telefone', type: 'text',  required: false },
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

            {error   && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            {success && <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{success}</p>}

            <button
              type="submit"
              disabled={saving}
              className="bg-[#19202d] hover:bg-[#232d3f] disabled:opacity-60 text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition"
            >
              {saving ? 'Salvando...' : 'Salvar dados'}
            </button>
          </form>
        </div>
      </div>

      {/* Trocar senha */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="h-1 bg-gold-stripe" />
        <div className="px-6 py-5">
          <h2 className="font-semibold text-[#19202d] mb-4">Alterar senha</h2>
          <form onSubmit={handleSaveSenha} className="space-y-4">
            {[
              { key: 'atual',     label: 'Senha atual'         },
              { key: 'nova',      label: 'Nova senha'          },
              { key: 'confirmar', label: 'Confirmar nova senha'},
            ].map(f => (
              <div key={f.key}>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                  {f.label}
                </label>
                <input
                  type="password"
                  value={senhaForm[f.key as keyof typeof senhaForm]}
                  onChange={e => setSenhaForm(p => ({ ...p, [f.key]: e.target.value }))}
                  required
                  className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36]"
                />
              </div>
            ))}

            {senhaError   && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{senhaError}</p>}
            {senhaSuccess && <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{senhaSuccess}</p>}

            <button
              type="submit"
              disabled={savingSenha}
              className="bg-[#19202d] hover:bg-[#232d3f] disabled:opacity-60 text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition"
            >
              {savingSenha ? 'Alterando...' : 'Alterar senha'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default function ClinicaPerfilPage() {
  return (
    <Suspense fallback={<div className="text-center py-16 text-gray-400">Carregando...</div>}>
      <PerfilContent />
    </Suspense>
  )
}
