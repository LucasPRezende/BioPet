import Image from 'next/image'
import Link from 'next/link'

const cards = [
  {
    href:    '/login',
    label:   'Admin / Atendente',
    desc:    'Equipe interna da BioPet — agendamentos, laudos e gestão do sistema.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
      </svg>
    ),
  },
  {
    href:    '/vet/login',
    label:   'Veterinário parceiro',
    desc:    'Médicos veterinários cadastrados — acesse seus laudos e resultados de exames.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
        <path d="M9 12h6M12 9v6" />
        <path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0" />
      </svg>
    ),
  },
  {
    href:    '/clinica/login',
    label:   'Clínica parceira',
    desc:    'Clínicas e hospitais veterinários conveniados — agendamentos e laudos dos seus pacientes.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <path d="M9 22V12h6v10" />
      </svg>
    ),
  },
]

export default function AcessoPage() {
  return (
    <div className="min-h-screen bg-[#19202d] flex flex-col items-center justify-center px-4 py-12">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gold-stripe" />

      <div className="flex flex-col items-center gap-3 mb-10">
        <div className="relative w-20 h-20">
          <Image src="/logo.png" alt="BioPet" fill className="object-contain drop-shadow-lg" />
        </div>
        <h1 className="text-2xl font-bold text-white">Portal de Acesso</h1>
        <p className="text-[#c4a35a] text-sm text-center max-w-xs">
          Selecione abaixo qual é o seu perfil para acessar a área correta.
        </p>
      </div>

      <div className="w-full max-w-sm flex flex-col gap-4">
        {cards.map(({ href, label, desc, icon }) => (
          <Link
            key={href}
            href={href}
            className="group bg-white/5 hover:bg-white/10 border border-white/10 hover:border-[#c4a35a]/60 rounded-2xl p-5 flex items-start gap-4 transition-all duration-200"
          >
            <div className="text-[#c4a35a] mt-0.5 shrink-0">
              {icon}
            </div>
            <div>
              <p className="font-bold text-white text-base group-hover:text-[#c4a35a] transition-colors">
                {label}
              </p>
              <p className="text-gray-400 text-sm mt-0.5 leading-snug">{desc}</p>
            </div>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-gray-600 group-hover:text-[#c4a35a] shrink-0 ml-auto mt-1 transition-colors">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </Link>
        ))}
      </div>

      <Link href="/" className="mt-10 text-xs text-gray-500 hover:text-gray-400 transition">
        ← Voltar ao site
      </Link>
    </div>
  )
}
