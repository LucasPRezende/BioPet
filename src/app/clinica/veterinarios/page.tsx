'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface Vet {
  id: number
  nome: string
  email: string
  whatsapp: string | null
  convite_aceito: boolean
  total_laudos: number
}

export default function ClinicaVeterinariosPage() {
  const [vets,    setVets]    = useState<Vet[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  const load = useCallback(async () => {
    const res = await fetch('/api/clinica/veterinarios')
    if (res.status === 401) { router.push('/clinica/login'); return }
    if (res.ok) setVets(await res.json())
    setLoading(false)
  }, [router])

  useEffect(() => { load() }, [load])

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-[#19202d]">
          Veterinários
          {!loading && <span className="ml-2 text-sm font-normal text-gray-400">({vets.length})</span>}
        </h1>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Carregando...</div>
      ) : vets.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl shadow-sm border">
          <div className="text-5xl mb-4">🩺</div>
          <p className="text-gray-500">Nenhum veterinário vinculado à sua clínica.</p>
          <p className="text-gray-400 text-sm mt-2">Entre em contato com a BioPet para vincular veterinários.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="h-1 bg-gold-stripe" />
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Nome', 'E-mail', 'WhatsApp', 'Status', 'Laudos'].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-bold text-[#19202d] uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {vets.map(vet => (
                <tr key={vet.id} className="hover:bg-amber-50/30 transition">
                  <td className="px-5 py-4 font-semibold text-[#19202d]">{vet.nome}</td>
                  <td className="px-5 py-4 text-gray-500 text-sm">{vet.email}</td>
                  <td className="px-5 py-4 text-gray-500 text-sm">{vet.whatsapp ?? '—'}</td>
                  <td className="px-5 py-4">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                      vet.convite_aceito
                        ? 'bg-green-50 text-green-700 border border-green-200'
                        : 'bg-amber-50 text-[#8a6e36] border border-[#8a6e36]/20'
                    }`}>
                      {vet.convite_aceito ? '✓ Ativo' : '⏳ Pendente'}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-gray-600 font-semibold">{vet.total_laudos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
