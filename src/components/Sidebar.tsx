'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'

interface User { nome: string; role: string }

interface Props {
  isOpen:  boolean
  onClose: () => void
}

interface NavItem {
  icon:       string
  label:      string
  href:       string
  badge?:     boolean
  adminOnly?: boolean
}

interface NavGroup {
  title:      string
  adminOnly?: boolean
  items:      NavItem[]
}

const NAV: NavGroup[] = [
  {
    title: 'ATENDIMENTO',
    items: [
      { icon: '📅', label: 'Agenda',   href: '/admin/agenda'   },
      { icon: '🐾', label: 'Resp. Legais', href: '/admin/tutores' },
    ],
  },
  {
    title: 'LAUDOS',
    items: [
      { icon: '📋', label: 'Laudos',      href: '/admin/laudos'          },
      { icon: '🧪', label: 'Bioquímica',  href: '/admin/novo-bioquimica' },
    ],
  },
  {
    title: 'FINANCEIRO',
    items: [
      { icon: '📊', label: 'Dashboard', href: '/admin/dashboard' },
      { icon: '💰', label: 'Preços',    href: '/admin/comissoes' },
    ],
  },
  {
    title: 'CONFIGURAÇÕES',
    adminOnly: true,
    items: [
      { icon: '👥', label: 'Usuários',      href: '/admin/usuarios',               adminOnly: true },
      { icon: '🔔', label: 'Notificações',  href: '/admin/notificacoes',           badge: true     },
      { icon: '🤖', label: 'Agente',        href: '/admin/configuracoes/agente',   adminOnly: true },
      { icon: '🩺', label: 'Veterinários',  href: '/admin/veterinarios',           adminOnly: true },
      { icon: '🏥', label: 'Clínicas',      href: '/admin/clinicas',               adminOnly: true },
    ],
  },
]

export default function Sidebar({ isOpen, onClose }: Props) {
  const pathname = usePathname()
  const router   = useRouter()
  const [user,   setUser]   = useState<User | null>(null)
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setUser(d) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/admin/notificacoes')
      .then(r => r.ok ? r.json() : { nao_visualizadas: 0 })
      .then(d => setUnread(d.nao_visualizadas ?? 0))
      .catch(() => {})
  }, [pathname])

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

  const isAdmin = user?.role === 'admin'

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={[
          'fixed inset-y-0 left-0 z-40 w-60 flex flex-col bg-[#19202d] overflow-hidden',
          'transition-transform duration-300 ease-in-out',
          'lg:relative lg:z-auto lg:translate-x-0 lg:shrink-0',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        {/* Gold stripe */}
        <div className="h-1 bg-gold-stripe shrink-0" />

        {/* Logo */}
        <Link
          href="/admin/dashboard"
          onClick={onClose}
          className="flex items-center gap-3 px-4 py-4 border-b border-white/10 hover:bg-white/5 transition shrink-0"
        >
          <div className="relative w-10 h-10 shrink-0">
            <Image src="/logo.png" alt="BioPet" fill className="object-contain" />
          </div>
          <div>
            <p className="text-white font-bold text-base leading-tight">BioPet</p>
            <p className="text-[#c4a35a] text-[10px] uppercase tracking-wide leading-tight">
              Medicina Veterinária
            </p>
          </div>
        </Link>

        {/* User info */}
        {user && (
          <div className="px-3 pt-3 pb-1 shrink-0">
            <div className="bg-white/8 rounded-lg px-3 py-2.5 border border-white/10">
              <p className="text-white text-sm font-semibold truncate leading-tight">{user.nome}</p>
              <p className="text-[#c4a35a] text-[11px] mt-0.5">
                {user.role === 'admin' ? 'Administrador' : user.role === 'vet' ? 'Veterinário' : 'Usuário'}
              </p>
            </div>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
          {NAV.map(group => {
            if (group.adminOnly && !isAdmin) return null
            const items = group.items.filter(i => !i.adminOnly || isAdmin)
            if (!items.length) return null

            return (
              <div key={group.title} className="mb-2">
                <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest px-3 py-2">
                  {group.title}
                </p>
                {items.map(item => {
                  const active = isActive(item.href)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      className={[
                        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                        active
                          ? 'bg-white/15 text-white border-l-2 border-[#c4a35a] pl-[10px]'
                          : 'text-white/65 hover:bg-white/10 hover:text-white',
                      ].join(' ')}
                    >
                      <span className="text-[15px] w-5 text-center shrink-0">{item.icon}</span>
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.badge && unread > 0 && (
                        <span className="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 shrink-0">
                          {unread > 99 ? '99+' : unread}
                        </span>
                      )}
                    </Link>
                  )
                })}
              </div>
            )
          })}
        </nav>

        {/* CTA Novo Laudo */}
        <div className="px-3 py-2 shrink-0">
          <Link
            href="/admin/novo"
            onClick={onClose}
            className="flex items-center justify-center gap-2 w-full bg-[#c4a35a] hover:bg-[#a88a47] text-white font-bold py-2.5 rounded-lg text-sm transition"
          >
            + Novo Laudo
          </Link>
        </div>

        {/* Logout */}
        <div className="px-3 py-3 border-t border-white/10 shrink-0">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 text-sm transition text-left"
          >
            <span className="text-base">→</span>
            <span>Sair</span>
          </button>
        </div>
      </aside>
    </>
  )
}
