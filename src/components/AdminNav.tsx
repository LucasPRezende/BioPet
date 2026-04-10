'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'

interface Props {
  titulo: string
}

export default function AdminNav({ titulo }: Props) {
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    fetch('/api/admin/notificacoes')
      .then(r => r.ok ? r.json() : { nao_visualizadas: 0 })
      .then(d => setUnread(d.nao_visualizadas ?? 0))
      .catch(() => {})
  }, [])

  return (
    <header className="bg-[#19202d] text-white shadow-lg">
      <div className="h-1 bg-gold-stripe" />
      <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="relative w-12 h-12 shrink-0">
            <Image src="/logo.png" alt="BioPet" fill className="object-contain" />
          </div>
          <div>
            <span className="font-bold text-lg tracking-wide">BioPet</span>
            <span className="text-[#c4a35a] text-[10px] block leading-tight tracking-wide">{titulo}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Link href="/admin/dashboard"  className="bg-white/10 hover:bg-white/20 text-white font-semibold px-3 py-2 rounded-lg transition text-sm">Dashboard</Link>
          <Link href="/admin/agenda"     className="bg-white/10 hover:bg-white/20 text-white font-semibold px-3 py-2 rounded-lg transition text-sm">📅 Agenda</Link>
          <Link href="/admin/laudos"     className="bg-white/10 hover:bg-white/20 text-white font-semibold px-3 py-2 rounded-lg transition text-sm">📋 Laudos</Link>
          <Link href="/admin/tutores"    className="bg-white/10 hover:bg-white/20 text-white font-semibold px-3 py-2 rounded-lg transition text-sm">👤 Tutores</Link>
          <Link href="/admin/notificacoes" className="relative bg-white/10 hover:bg-white/20 text-white font-semibold px-3 py-2 rounded-lg transition text-sm flex items-center gap-1">
            🔔 Notificações
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </Link>
          <Link href="/admin/veterinarios"       className="bg-white/10 hover:bg-white/20 text-white font-semibold px-3 py-2 rounded-lg transition text-sm">Veterinários</Link>
          <Link href="/admin/usuarios"           className="bg-white/10 hover:bg-white/20 text-white font-semibold px-3 py-2 rounded-lg transition text-sm">Usuários</Link>
          <Link href="/admin/comissoes"          className="bg-white/10 hover:bg-white/20 text-white font-semibold px-3 py-2 rounded-lg transition text-sm">Preços</Link>
          <Link href="/admin/configuracoes/agente" className="bg-white/10 hover:bg-white/20 text-white font-semibold px-3 py-2 rounded-lg transition text-sm">⚙️ Agente</Link>
          <Link href="/admin/novo-bioquimica"     className="bg-white/10 hover:bg-white/20 text-white font-semibold px-3 py-2 rounded-lg transition text-sm">🧪 Bioquímica</Link>
          <Link href="/admin/novo"               className="bg-white hover:bg-gray-100 font-semibold px-3 py-2 rounded-lg transition text-sm text-[#19202d] shadow">+ Novo Laudo</Link>
        </div>
      </div>
    </header>
  )
}
