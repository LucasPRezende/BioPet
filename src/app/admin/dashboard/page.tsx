'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'

interface Laudo {
  id: number
  nome_pet: string
  especie: string
  tutor: string
  telefone: string
  token: string
  tipo: string
  created_at: string
}

function whatsappLink(telefone: string, laudoUrl: string, nomePet: string): string {
  const digits = telefone.replace(/\D/g, '')
  const number = digits.startsWith('55') && digits.length >= 12 ? digits : `55${digits}`
  const msg = encodeURIComponent(
    `Olá! O laudo do *${nomePet}* já está disponível. Acesse pelo link abaixo:\n${laudoUrl}`
  )
  return `https://wa.me/${number}?text=${msg}`
}

export default function DashboardPage() {
  const [laudos, setLaudos]   = useState<Laudo[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied]   = useState<number | null>(null)
  const [search, setSearch]   = useState('')
  const router = useRouter()

  const fetchLaudos = useCallback(async () => {
    const res = await fetch('/api/laudos')
    if (res.status === 401) { router.push('/admin/login'); return }
    if (res.ok) setLaudos(await res.json())
    setLoading(false)
  }, [router])

  useEffect(() => { fetchLaudos() }, [fetchLaudos])

  async function handleLogout() {
    await fetch('/api/auth', { method: 'DELETE' })
    router.push('/admin/login')
  }

  function copyLink(laudo: Laudo) {
    navigator.clipboard.writeText(`${window.location.origin}/laudo/${laudo.token}`)
    setCopied(laudo.id)
    setTimeout(() => setCopied(null), 2500)
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return laudos
    return laudos.filter(
      l =>
        l.nome_pet.toLowerCase().includes(q) ||
        l.tutor.toLowerCase().includes(q) ||
        l.telefone.replace(/\D/g, '').includes(q.replace(/\D/g, ''))
    )
  }, [laudos, search])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#19202d] text-white shadow-lg">
        <div className="h-1 bg-gold-stripe" />
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            {/* Logo maior no header */}
            <div className="relative w-14 h-14 shrink-0">
              <Image src="/logo.png" alt="BioPet" fill className="object-contain" />
            </div>
            <div>
              <span className="font-bold text-xl tracking-wide">BioPet</span>
              <span className="text-[#c4a35a] text-[10px] block leading-tight tracking-wide">
                Lab. Veterinário de Análises Clínicas e Diagnóstico por Imagem
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin/novo"
              className="bg-white hover:bg-gray-100 font-semibold px-4 py-2 rounded-lg transition text-sm text-[#19202d] shadow"
            >
              + Novo Laudo
            </Link>
            <button onClick={handleLogout} className="text-gray-400 hover:text-white transition text-sm">
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Título + busca */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <h2 className="text-xl font-bold text-[#19202d]">
            Laudos Cadastrados
            {!loading && (
              <span className="ml-2 text-sm font-normal text-gray-400">
                ({filtered.length}{search ? ` de ${laudos.length}` : ''})
              </span>
            )}
          </h2>

          <div className="relative w-full sm:w-72">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm select-none">🔍</span>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Pet, tutor ou telefone..."
              className="w-full pl-8 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#8a6e36] bg-white"
            />
            {search && (
              <button onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">
                ✕
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400">Carregando...</div>
        ) : laudos.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl shadow-sm border">
            <div className="text-5xl mb-4">📋</div>
            <p className="text-gray-500 text-lg mb-4">Nenhum laudo cadastrado ainda.</p>
            <Link href="/admin/novo"
              className="inline-block bg-gold-grad text-white font-semibold px-6 py-2 rounded-lg hover:brightness-110 transition">
              Cadastrar primeiro laudo
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl shadow-sm border">
            <div className="text-4xl mb-3">🔍</div>
            <p className="text-gray-500">Nenhum resultado para &quot;{search}&quot;</p>
            <button onClick={() => setSearch('')} className="mt-3 text-[#8a6e36] hover:underline text-sm">
              Limpar busca
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            {/* Faixa dourada topo da tabela */}
            <div className="h-1 bg-gold-stripe" />
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Pet', 'Espécie', 'Tutor', 'Telefone', 'Data', 'Ações'].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-bold text-[#19202d] uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(laudo => {
                  const url = typeof window !== 'undefined'
                    ? `${window.location.origin}/laudo/${laudo.token}` : ''
                  return (
                    <tr key={laudo.id} className="hover:bg-amber-50/30 transition">
                      <td className="px-5 py-4">
                        <span className="font-semibold text-[#19202d]">
                          <Highlight text={laudo.nome_pet} query={search} />
                        </span>
                        {laudo.tipo === 'gerado' && (
                          <span className="ml-2 text-[10px] bg-amber-50 text-[#8a6e36] border border-[#8a6e36]/20 px-1.5 py-0.5 rounded">
                            Gerado
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-gray-500 text-sm">{laudo.especie}</td>
                      <td className="px-5 py-4 text-gray-700">
                        <Highlight text={laudo.tutor} query={search} />
                      </td>
                      <td className="px-5 py-4 text-gray-500 text-sm">
                        <Highlight text={laudo.telefone} query={search} />
                      </td>
                      <td className="px-5 py-4 text-gray-400 text-sm">{formatDate(laudo.created_at)}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => copyLink(laudo)}
                            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition border ${
                              copied === laudo.id
                                ? 'bg-green-50 text-green-700 border-green-200'
                                : 'bg-amber-50 text-[#8a6e36] border-[#8a6e36]/20 hover:bg-amber-100'
                            }`}
                          >
                            {copied === laudo.id ? '✓ Copiado!' : '🔗 Copiar'}
                          </button>
                          <a
                            href={whatsappLink(laudo.telefone, url, laudo.nome_pet)}
                            target="_blank" rel="noreferrer"
                            className="text-xs px-3 py-1.5 rounded-lg bg-green-500 hover:bg-green-600 text-white font-medium transition"
                          >
                            WhatsApp
                          </a>
                          <a
                            href={`/laudo/${laudo.token}`}
                            target="_blank" rel="noreferrer"
                            className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
                          >
                            Ver
                          </a>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}

function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim()
  if (!q) return <>{text}</>
  const idx = text.toLowerCase().indexOf(q.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 text-gray-900 rounded-sm px-0.5">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  )
}
