'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'


const NAV = [
  { icon: '📅', label: 'Agendamentos',    href: '/clinica/agendamentos'       },
  { icon: '➕', label: 'Novo agend.',     href: '/clinica/novo-agendamento'   },
  { icon: '📋', label: 'Laudos',          href: '/clinica/laudos'             },
  { icon: '🩺', label: 'Veterinários',    href: '/clinica/veterinarios'       },
  { icon: '👤', label: 'Perfil',          href: '/clinica/perfil'             },
]

function ClinicaSidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const pathname = usePathname()
  const router   = useRouter()

  async function handleLogout() {
    await fetch('/api/clinica/auth', { method: 'DELETE' })
    router.push('/clinica/login')
  }

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={onClose} />
      )}
      <aside
        className={[
          'fixed inset-y-0 left-0 z-40 w-60 flex flex-col bg-[#19202d] overflow-hidden',
          'transition-transform duration-300 ease-in-out',
          'lg:relative lg:z-auto lg:translate-x-0 lg:shrink-0',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        <div className="h-1 bg-gold-stripe shrink-0" />

        <Link
          href="/clinica/laudos"
          onClick={onClose}
          className="flex items-center gap-3 px-4 py-4 border-b border-white/10 hover:bg-white/5 transition shrink-0"
        >
          <div className="relative w-10 h-10 shrink-0">
            <Image src="/logo.png" alt="BioPet" fill className="object-contain" />
          </div>
          <div>
            <p className="text-white font-bold text-base leading-tight">BioPet</p>
            <p className="text-[#c4a35a] text-[10px] uppercase tracking-wide leading-tight">
              Portal da Clínica
            </p>
          </div>
        </Link>

        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-0.5">
          {NAV.map(item => {
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
              </Link>
            )
          })}
        </nav>

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

export default function ClinicaLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()

  if (pathname === '/clinica/login') return <>{children}</>

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <ClinicaSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Mobile header */}
        <header className="lg:hidden bg-[#19202d] text-white px-4 py-3 flex items-center gap-3 shrink-0">
          <div className="h-0.5 absolute top-0 left-0 right-0 bg-gold-stripe" />
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-white/70 hover:text-white p-1 transition"
            aria-label="Abrir menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="font-bold text-sm">BioPet — Portal da Clínica</span>
        </header>

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
