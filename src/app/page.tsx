import Image from 'next/image'
import Link from 'next/link'

const WA_URL = 'https://wa.me/5524999225305'

const services = [
  {
    icon: '🩻',
    title: 'Raio-X',
    desc: 'Diagnóstico por imagem com equipamentos modernos para avaliação óssea e torácica.',
  },
  {
    icon: '🔊',
    title: 'Ultrassom',
    desc: 'Exame de imagem em tempo real para avaliação de órgãos abdominais e gestação.',
  },
  {
    icon: '💨',
    title: 'Hemogasometria',
    desc: 'Análise dos gases sanguíneos para avaliação do equilíbrio ácido-base e respiratório.',
  },
  {
    icon: '🩸',
    title: 'Exame de Sangue Completo',
    desc: 'Hemograma, bioquímicos e painéis completos para diagnóstico preciso do seu pet.',
  },
]

const team = [
  { name: 'Andreza Moreira de Souza', role: 'Médica Veterinária' },
  { name: 'Luciana Pereira de Brites', role: 'Médica Responsável • CRMV 12923' },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-[#19202d]">

      {/* ── Faixa dourada topo ── */}
      <div className="h-1.5 bg-gold-stripe" />

      {/* ── Nav ── */}
      <nav className="bg-[#19202d] sticky top-0 z-50 shadow-lg">
        <div className="max-w-5xl mx-auto px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 shrink-0">
              <Image src="/logo.png" alt="BioPet" fill className="object-contain" />
            </div>
            <span className="text-white font-bold text-lg tracking-wide">BioPet</span>
          </div>
          <a
            href={WA_URL}
            target="_blank"
            rel="noreferrer"
            className="bg-green-500 hover:bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition flex items-center gap-2"
          >
            <WhatsAppIcon />
            Fale conosco
          </a>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="bg-[#19202d] text-white">
        <div className="max-w-5xl mx-auto px-5 py-20 flex flex-col items-center text-center gap-7">
          <div className="relative w-28 h-28 drop-shadow-xl">
            <Image src="/logo.png" alt="BioPet" fill className="object-contain" />
          </div>

          <div>
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-3">BioPet</h1>
            <p className="text-[#c4a35a] text-base sm:text-lg font-medium max-w-xl leading-relaxed">
              Laboratório Veterinário de Análises Clínicas e Diagnóstico por Imagem
            </p>
          </div>

          <div className="w-24 h-0.5 bg-gold-stripe rounded opacity-60" />

          <p className="text-gray-300 max-w-md text-sm sm:text-base leading-relaxed">
            Cuidado especializado para o seu pet com tecnologia de ponta e profissionais dedicados.
            Resultados precisos, atendimento humanizado.
          </p>

          <a
            href={WA_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2.5 bg-green-500 hover:bg-green-600 text-white font-bold px-7 py-3.5 rounded-xl text-base transition shadow-lg hover:shadow-green-900/30"
          >
            <WhatsAppIcon size={22} />
            Agendar pelo WhatsApp
          </a>
        </div>
        <div className="h-1 bg-gold-stripe opacity-50" />
      </section>

      {/* ── Serviços ── */}
      <section id="servicos" className="py-20 bg-gray-50">
        <div className="max-w-5xl mx-auto px-5">
          <SectionTitle>Nossos Serviços</SectionTitle>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-10">
            {services.map(s => (
              <div
                key={s.title}
                className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md hover:-translate-y-0.5 transition-all flex flex-col gap-3"
              >
                <div className="text-4xl">{s.icon}</div>
                <h3 className="font-bold text-[#19202d] text-base">{s.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Profissionais ── */}
      <section id="equipe" className="py-20 bg-white">
        <div className="max-w-5xl mx-auto px-5">
          <SectionTitle>Nossa Equipe</SectionTitle>

          <div className="flex flex-col sm:flex-row gap-6 mt-10 justify-center">
            {team.map(p => (
              <div
                key={p.name}
                className="flex-1 max-w-sm mx-auto sm:mx-0 bg-gray-50 rounded-2xl p-7 border border-gray-100 shadow-sm text-center"
              >
                <div className="w-16 h-16 rounded-full bg-[#19202d] flex items-center justify-center mx-auto mb-4 text-2xl text-[#c4a35a] font-bold">
                  {p.name.split(' ').map(w => w[0]).slice(0, 2).join('')}
                </div>
                <h3 className="font-bold text-[#19202d] text-base">{p.name}</h3>
                <p className="text-[#8a6e36] text-sm mt-1">{p.role}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Contato ── */}
      <section id="contato" className="py-20 bg-[#19202d] text-white">
        <div className="max-w-5xl mx-auto px-5">
          <SectionTitle light>Fale com a Gente</SectionTitle>

          <div className="mt-10 flex flex-col sm:flex-row gap-5 justify-center">
            <ContactCard icon="📍" label="Endereço">
              Av. Sávio Cota de Almeida Gama, 137<br />
              Niterói, Volta Redonda – RJ
            </ContactCard>

            <ContactCard icon="💬" label="WhatsApp">
              <a href={WA_URL} target="_blank" rel="noreferrer"
                className="text-green-400 hover:text-green-300 transition font-semibold">
                (24) 99922-5305
              </a>
            </ContactCard>

            <ContactCard icon="✉️" label="E-mail">
              <a href="mailto:contato@biopet.com"
                className="text-[#c4a35a] hover:text-[#e0c07a] transition">
                contato@biopet.com
              </a>
            </ContactCard>
          </div>

          <div className="mt-14 text-center">
            <a
              href={WA_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2.5 bg-green-500 hover:bg-green-600 text-white font-bold px-8 py-3.5 rounded-xl text-base transition shadow-lg"
            >
              <WhatsAppIcon size={22} />
              Agendar pelo WhatsApp
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-[#111820] text-gray-500 text-xs text-center py-5 px-4">
        <div className="h-px bg-gold-stripe opacity-20 mb-4 max-w-5xl mx-auto" />
        © {new Date().getFullYear()} BioPet – Laboratório Veterinário de Análises Clínicas e Diagnóstico por Imagem.
        Todos os direitos reservados.
        <span className="mx-3 opacity-30">|</span>
        <Link href="/admin/login" className="hover:text-gray-300 transition">
          Área restrita
        </Link>
      </footer>

    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function SectionTitle({ children, light }: { children: React.ReactNode; light?: boolean }) {
  return (
    <div className="text-center">
      <h2 className={`text-2xl sm:text-3xl font-extrabold ${light ? 'text-white' : 'text-[#19202d]'}`}>
        {children}
      </h2>
      <div className="w-14 h-1 bg-gold-stripe rounded mx-auto mt-3" />
    </div>
  )
}

function ContactCard({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex-1 max-w-xs mx-auto sm:mx-0 bg-white/5 border border-white/10 rounded-2xl p-6 text-center">
      <div className="text-3xl mb-3">{icon}</div>
      <p className="text-[#c4a35a] text-xs font-bold uppercase tracking-widest mb-2">{label}</p>
      <p className="text-gray-300 text-sm leading-relaxed">{children}</p>
    </div>
  )
}

function WhatsAppIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}
