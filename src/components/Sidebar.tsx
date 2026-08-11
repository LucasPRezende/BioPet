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
  href?:      string       // ausente = item é só um toggle de submenu (tem children)
  badge?:     boolean
  adminOnly?: boolean
  children?:  NavItem[]
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
      { icon: '📅', label: 'Agenda',    href: '/admin/agenda'    },
      { icon: '🔄', label: 'Revisões',  href: '/admin/revisoes'  },
      { icon: '🐾', label: 'Resp. Legais', href: '/admin/tutores' },
    ],
  },
  {
    title: 'LAUDOS',
    items: [
      { icon: '📋', label: 'Laudos',       href: '/admin/laudos'                   },
      { icon: '🧪', label: 'Bioquímica',  href: '/admin/novo-bioquimica'          },
      { icon: '💉', label: 'Teste Rápido', href: '/admin/novo-teste-rapido'       },
      { icon: '📊', label: 'Referências', href: '/admin/bioquimica/referencias'   },
    ],
  },
  {
    title: 'FINANCEIRO',
    items: [
      { icon: '📊', label: 'Dashboard',  href: '/admin/dashboard', adminOnly: true },
      { icon: '💰', label: 'Preços',     href: '/admin/comissoes', adminOnly: true },
      {
        icon: '🔬', label: 'Labs Parceiros', adminOnly: true,
        children: [
          { icon: '📖', label: 'Catálogo', href: '/admin/labs' },
          { icon: '📦', label: 'Pedidos',  href: '/admin/labs/pedidos' },
          { icon: '📋', label: 'Estoque',  href: '/admin/estoque' },
        ],
      },
      { icon: '🩸', label: 'Extrações',  href: '/admin/extracoes'  },
    ],
  },
  {
    title: 'CONFIGURAÇÕES',
    adminOnly: true,
    items: [
      { icon: '👥', label: 'Usuários',      href: '/admin/usuarios',               adminOnly: true },
      { icon: '🔔', label: 'Notificações',  href: '/admin/notificacoes',           badge: true     },
      { icon: '🤖', label: 'Agente',        href: '/admin/configuracoes/agente',   adminOnly: true },
      { icon: '📅', label: 'Feriados',      href: '/admin/configuracoes/feriados', adminOnly: true },
      { icon: '🩺', label: 'Veterinários',  href: '/admin/veterinarios',           adminOnly: true },
      { icon: '🏥', label: 'Clínicas',      href: '/admin/clinicas',               adminOnly: true },
    ],
  },
]

function todosHrefs(items: NavItem[]): string[] {
  return items.flatMap(i => (i.children ? todosHrefs(i.children) : i.href ? [i.href] : []))
}

export default function Sidebar({ isOpen, onClose }: Props) {
  const pathname = usePathname()
  const router   = useRouter()
  const [user,   setUser]   = useState<User | null>(null)
  const [unread, setUnread] = useState(0)
  const [aberto, setAberto] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setUser(d) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    let active = true
    function loadUnread() {
      fetch('/api/admin/notificacoes')
        .then(r => r.ok ? r.json() : { nao_visualizadas: 0, agendamentos_novos: 0 })
        .then(d => { if (active) setUnread((d.nao_visualizadas ?? 0) + (d.agendamentos_novos ?? 0)) })
        .catch(() => {})
    }
    loadUnread()
    const interval = setInterval(loadUnread, 20_000)
    return () => { active = false; clearInterval(interval) }
  }, [pathname])

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  // Entre hrefs aninhados (ex: /admin/labs e /admin/labs/pedidos), só o mais
  // específico fica ativo — senão os dois acendem ao mesmo tempo.
  const melhorMatch = NAV.flatMap(g => todosHrefs(g.items))
    .filter(h => pathname === h || pathname.startsWith(h + '/'))
    .sort((a, b) => b.length - a.length)[0]

  function isActive(href: string) {
    return href === melhorMatch
  }

  // Abre automaticamente o submenu que contém a página atual.
  useEffect(() => {
    for (const group of NAV) {
      for (const item of group.items) {
        if (item.children && todosHrefs(item.children).includes(melhorMatch)) {
          setAberto(prev => new Set(prev).add(item.label))
        }
      }
    }
  }, [melhorMatch])

  function toggleAberto(label: string) {
    setAberto(prev => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
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
          href={isAdmin ? '/admin/dashboard' : '/admin/laudos'}
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
        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20 hover:[&::-webkit-scrollbar-thumb]:bg-[#c4a35a]/60 [scrollbar-width:thin] [scrollbar-color:rgba(196,163,90,0.3)_transparent]">
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
                  if (item.children) {
                    const filhos = item.children.filter(c => !c.adminOnly || isAdmin)
                    if (!filhos.length) return null
                    const algumFilhoAtivo = filhos.some(c => c.href && isActive(c.href))
                    const expandido = aberto.has(item.label) || algumFilhoAtivo
                    return (
                      <div key={item.label}>
                        <button
                          type="button"
                          onClick={() => toggleAberto(item.label)}
                          className={[
                            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                            algumFilhoAtivo
                              ? 'bg-white/15 text-white border-l-2 border-[#c4a35a] pl-[10px]'
                              : 'text-white/65 hover:bg-white/10 hover:text-white',
                          ].join(' ')}
                        >
                          <span className="text-[15px] w-5 text-center shrink-0">{item.icon}</span>
                          <span className="flex-1 truncate text-left">{item.label}</span>
                          <span className={`text-[10px] transition-transform duration-150 ${expandido ? 'rotate-90' : ''}`}>▶</span>
                        </button>
                        {expandido && (
                          <div className="ml-4 pl-3 border-l border-white/10 space-y-0.5 mt-0.5">
                            {filhos.map(filho => {
                              const active = !!filho.href && isActive(filho.href)
                              return (
                                <Link
                                  key={filho.href}
                                  href={filho.href ?? '#'}
                                  onClick={onClose}
                                  className={[
                                    'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                                    active
                                      ? 'bg-white/15 text-white border-l-2 border-[#c4a35a] pl-[10px]'
                                      : 'text-white/55 hover:bg-white/10 hover:text-white',
                                  ].join(' ')}
                                >
                                  <span className="text-[13px] w-4 text-center shrink-0">{filho.icon}</span>
                                  <span className="flex-1 truncate">{filho.label}</span>
                                </Link>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  }

                  const active = !!item.href && isActive(item.href)
                  return (
                    <Link
                      key={item.href}
                      href={item.href ?? '#'}
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
