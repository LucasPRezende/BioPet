/* eslint-disable @next/next/no-img-element */
import Image from 'next/image'
import Link from 'next/link'

const WA_URL = 'https://wa.me/5524999999867'

export default function LandingPage() {
  return (
    <div style={{ background: '#fff', color: '#19202d' }}>
      <div className="gold-stripe" style={{ height: 6 }} />

      {/* Nav */}
      <nav className="top">
        <div className="inner">
          <div className="brand">
            <div className="logo">
              <Image src="/logo.png" alt="BioPet" fill style={{ objectFit: 'contain' }} />
            </div>
            <span>BioPet</span>
          </div>
          <a className="btn-wa" href={WA_URL} target="_blank" rel="noreferrer">
            <WaIcon size={16} /> Fale conosco
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="hero" data-variant="C">
        <div className="inner">
          <div className="logo-big">
            <Image src="/logo.png" alt="BioPet" fill style={{ objectFit: 'contain' }} />
          </div>
          <div>
            <h1>BioPet</h1>
            <p className="tag">Laboratório Veterinário de Análises Clínicas e Diagnóstico por Imagem</p>
          </div>
          <div className="rule gold-stripe" />
          <p className="lede">
            Cuidado especializado para o seu pet com tecnologia de ponta e profissionais dedicados.
            Resultados precisos, atendimento humanizado.
          </p>

          {/* Badges — visíveis no variant C */}
          <div className="badges v-badges">
            <span className="badge">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z" /></svg>
              Desde 2014
            </span>
            <span className="badge">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
              Laudos em até 48h
            </span>
            <span className="badge">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              Equipe especializada
            </span>
          </div>

          <a className="btn-wa lg" href={WA_URL} target="_blank" rel="noreferrer">
            <WaIcon size={22} /> Agendar pelo WhatsApp
          </a>
        </div>
        <div className="gold-stripe" style={{ height: 4, opacity: 0.5 }} />
      </section>

      {/* Serviços */}
      <section id="servicos" className="block services">
        <div className="wrap">
          <div className="sec-title">
            <h2>Nossos Serviços</h2>
            <div className="underline gold-stripe" />
          </div>
          <div className="grid-services">
            <ServiceCard photo="/servico-raiox.jpg" dark alt="Raio-X torácico de pet" title="Raio-X Digital">
              Diagnóstico por imagem com equipamento digital de alta resolução. Avaliação óssea, torácica e abdominal com baixa exposição à radiação.
            </ServiceCard>
            <ServiceCard photo="/servico-ultrassom.jpg" alt="Exame de ultrassonografia veterinária" title="Ultrassonografia">
              Exame em tempo real para avaliação de órgãos abdominais, gestação e cardiologia. <strong>Laudos em até 48h.</strong>
            </ServiceCard>
            <ServiceCard photo="/servico-analises.jpg" alt="Analisador bioquímico Mindray BS-200" title="Análises Clínicas">
              Hemograma completo, bioquímicos, urinálise, parasitológicos e painéis específicos. Resultados precisos para diagnóstico e acompanhamento.
            </ServiceCard>
            <ServiceCard photo="/servico-hemogasometria.jpg" alt="Aparelho de hemogasometria" title="Hemogasometria">
              Análise dos gases sanguíneos para avaliação do equilíbrio ácido-base, ventilação e oxigenação — essencial em emergências.
            </ServiceCard>
            <ServiceCard photo="/servico-doppler.jpg" alt="Aparelho de ultrassom com Doppler" title="Doppler">
              Avaliação do fluxo sanguíneo em tempo real para diagnóstico de alterações cardíacas, vasculares e abdominais.
            </ServiceCard>
            <ServiceCard photo="/servico-elastografia.jpg" dark alt="Imagem de elastografia veterinária" title="Elastografia">
              Avalia a rigidez dos tecidos internos de forma não invasiva, auxiliando no diagnóstico e acompanhamento de diversas doenças.
            </ServiceCard>
            <ServiceCard photo="/endoscopia.png" dark alt="Endoscópio veterinário" title="Endoscopia">
              Exame minimamente invasivo para visualização direta do trato digestivo, respiratório e remoção de corpos estranhos.
            </ServiceCard>
          </div>
        </div>
      </section>

      {/* Diferenciais */}
      <section id="diferenciais" className="block diff">
        <div className="wrap">
          <div className="sec-title">
            <h2>Por que escolher a BioPet</h2>
            <div className="underline gold-stripe" />
          </div>
          <p className="lead">
            Somos uma clínica focada em diagnóstico veterinário, unindo tecnologia de ponta, agilidade
            e uma equipe altamente especializada.
          </p>
          <div className="diff-grid">
            <div className="diff-card">
              <div className="num">01</div>
              <h3>Foco em diagnóstico</h3>
              <p>Não somos uma clínica geral. Toda nossa estrutura é dedicada à precisão e qualidade dos exames laboratoriais e por imagem.</p>
            </div>
            <div className="diff-card">
              <div className="num">02</div>
              <h3>Laudos em até 48h</h3>
              <p>Resultados rápidos para o médico veterinário iniciar ou ajustar o tratamento sem perder tempo precioso.</p>
            </div>
            <div className="diff-card">
              <div className="num">03</div>
              <h3>Equipamentos de última geração</h3>
              <p>Hemogasometria, ultrassom com Doppler e Elastografia, raio-X digital e analisador bioquímico Mindray BS-200.</p>
            </div>
            <div className="diff-card">
              <div className="num">04</div>
              <h3>Equipe especializada</h3>
              <p>Profissionais com pós-graduações em Diagnóstico por Imagem, Patologia Clínica, Ortopedia e Neurologia — com atualização constante em centros de referência.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Equipe */}
      <section id="equipe" className="block team">
        <div className="wrap">
          <div className="sec-title">
            <h2>Nossa Equipe</h2>
            <div className="underline gold-stripe" />
          </div>
          <p className="intro">
            Na BioPet, contamos com uma equipe altamente qualificada, comprometida com a excelência no
            diagnóstico e cuidado veterinário, aliando conhecimento técnico, atualização constante e
            dedicação aos pacientes.
          </p>
          <div className="row">
            <div className="person">
              <div className="avatar">
                <img src="/luciana.jpg" alt="Luciana Pereira de Brites" />
              </div>
              <h3>Luciana Pereira de Brites</h3>
              <p className="role">Responsável Técnica e Proprietária<br />CRMV 12923</p>
              <p className="bio-text">
                Médica Veterinária e Zootecnista formada pela <strong>UFRRJ</strong>, com pós-graduação em
                Diagnóstico por Imagem. Atua na área desde <strong>2014</strong>, com sólida experiência e
                constante atualização profissional por meio de cursos realizados na NAUS e na USP de Pirassununga.
              </p>
              <p className="bio-text">Possui aprimoramento em citologia, hematologia e análises clínicas.</p>
            </div>

            <div className="person">
              <div className="avatar">
                <img src="/Lucas.jpg" alt="Lucas Orgal" />
              </div>
              <h3>Lucas Orgal</h3>
              <p className="role">Especialista em Ortopedia<br />e Traumatologia</p>
              <p className="bio-text">
                Médico Veterinário formado pela <strong>Universidade Severino Sombra (2014)</strong>, especialista
                em ortopedia e traumatologia. Possui aprimoramento em radiologia do aparelho locomotor e constante
                atualização profissional por meio de cursos e aperfeiçoamentos.
              </p>
              <p className="bio-text">Atualmente, também é pós-graduando em Neurologia e Neurocirurgia.</p>
            </div>

            <div className="person">
              <div className="avatar">
                <img src="/Andreza.jpg" alt="Andreza Moreira de Souza" />
              </div>
              <h3>Andreza Moreira de Souza</h3>
              <p className="role">Diagnóstico por Imagem<br />e Patologia Clínica</p>
              <p className="bio-text">
                Médica Veterinária formada pela <strong>UFRRJ (2021)</strong>, com pós-graduação em Diagnóstico
                por Imagem e Endocrinologia Veterinária. Realizou cursos de atualização em ultrassonografia pela NAUS.
              </p>
              <p className="bio-text">
                Atualmente é pós-graduanda em Patologia Clínica, com foco na integração diagnóstica e precisão
                nos resultados laboratoriais.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Contato */}
      <section id="contato" className="block contact">
        <div className="wrap">
          <div className="sec-title">
            <h2 className="light">Fale com a Gente</h2>
            <div className="underline gold-stripe" />
          </div>
          <div className="row">
            <div className="ccard">
              <div className="ico">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                </svg>
              </div>
              <p className="label">Endereço</p>
              <p className="ccard-body">Av. Sávio Cota de Almeida Gama, 137<br />Niterói, Volta Redonda – RJ</p>
            </div>
            <div className="ccard">
              <div className="ico"><WaIcon size={22} /></div>
              <p className="label">WhatsApp</p>
              <p className="ccard-body">
                <a className="green" href={WA_URL} target="_blank" rel="noreferrer">(24) 99999-9867</a>
              </p>
            </div>
            <div className="ccard">
              <div className="ico">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" />
                </svg>
              </div>
              <p className="label">E-mail</p>
              <p className="ccard-body">
                <a className="gold" href="mailto:contato@biopetvet.com">contato@biopetvet.com</a>
              </p>
            </div>
          </div>
          <div className="cta">
            <a className="btn-wa lg" href={WA_URL} target="_blank" rel="noreferrer">
              <WaIcon size={22} /> Agendar pelo WhatsApp
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="lp-footer">
        <div className="lp-div gold-stripe" />
        © {new Date().getFullYear()} BioPet – Laboratório Veterinário de Análises Clínicas e Diagnóstico por Imagem.
        Todos os direitos reservados.
        <span style={{ margin: '0 12px', opacity: 0.3 }}>|</span>
        <Link href="/admin/login">Área restrita</Link>
      </footer>
    </div>
  )
}

function ServiceCard({
  photo, dark, alt, title, children,
}: {
  photo: string
  dark?: boolean
  alt: string
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="card">
      <div className={`photo${dark ? ' dark' : ''}`}>
        <img src={photo} alt={alt} />
      </div>
      <div className="card-body">
        <h3>{title}</h3>
        <p>{children}</p>
      </div>
    </div>
  )
}

function WaIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}
