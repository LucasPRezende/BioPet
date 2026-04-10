import { notFound } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'

export default async function LaudoPage({ params }: { params: { token: string } }) {
  const { data: laudo } = await supabase
    .from('laudos')
    .select('*, system_users(nome)')
    .eq('token', params.token)
    .single()

  if (!laudo) notFound()

  const dataCriacao = new Date(laudo.created_at).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  })

  const cadastradoPor = (laudo.system_users as { nome: string } | null)?.nome

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#19202d] text-white">
        <div className="h-1 bg-gold-stripe" />
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="relative w-12 h-12 sm:w-16 sm:h-16 shrink-0">
            <Image src="/logo.png" alt="BioPet" fill className="object-contain" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-wide">BioPet</h1>
            <p className="text-[#c4a35a] text-[10px] sm:text-xs tracking-wide leading-relaxed">
              Laboratório Veterinário de Análises Clínicas e Diagnóstico por Imagem
            </p>
          </div>
        </div>
        <div className="max-w-3xl mx-auto px-4 pb-3">
          <p className="text-gray-400 text-xs uppercase tracking-widest">Laudo Médico Veterinário</p>
        </div>
        <div className="h-px bg-gold-stripe opacity-30" />
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5 sm:py-7 space-y-4 sm:space-y-5">
        {/* Dados do paciente */}
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="h-1 bg-gold-stripe" />
          <div className="p-4 sm:p-6">
            <h2 className="text-xs font-bold text-[#19202d] uppercase tracking-widest mb-4 sm:mb-5">
              Dados do Paciente
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
              <InfoField label="Nome do Animal" value={laudo.nome_pet} large />
              <InfoField label="Espécie"        value={laudo.especie} />
              <InfoField label="Proprietário"   value={laudo.tutor} />
              <InfoField label="Telefone"       value={laudo.telefone} />
              {laudo.tipo_exame && (
                <InfoField label="Tipo de Exame" value={laudo.tipo_exame} />
              )}
              <InfoField label="Data do Laudo" value={dataCriacao} />
              {cadastradoPor && (
                <InfoField label="Cadastrado por" value={cadastradoPor} />
              )}
            </div>
          </div>
        </div>

        {/* PDF */}
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="h-1 bg-gold-stripe" />
          <div className="p-4 sm:p-6">
            <div className="flex justify-between items-center mb-4 sm:mb-5">
              <h2 className="text-xs font-bold text-[#19202d] uppercase tracking-widest">
                Laudo em PDF
              </h2>
              <a
                href={`/api/pdf/${laudo.id}?download=1`}
                download={laudo.original_name}
                className="bg-[#19202d] hover:bg-[#232d3f] text-white text-sm font-semibold px-4 py-2 rounded-lg transition flex items-center gap-1.5"
              >
                ⬇ Baixar PDF
              </a>
            </div>

            {/* Mobile: só botão de download */}
            <div className="sm:hidden bg-gray-50 rounded-lg border border-gray-100 p-6 flex flex-col items-center gap-3 text-center">
              <svg className="w-10 h-10 text-[#c4a35a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <p className="text-sm text-gray-500">Toque no botão acima para baixar o PDF do laudo.</p>
              <a
                href={`/api/pdf/${laudo.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#8a6e36] text-sm font-medium underline underline-offset-2"
              >
                Ou abrir PDF no navegador
              </a>
            </div>

            {/* Desktop: iframe */}
            <iframe
              src={`/api/pdf/${laudo.id}`}
              className="hidden sm:block w-full rounded-lg border border-gray-100"
              style={{ height: '700px' }}
              title={`Laudo de ${laudo.nome_pet}`}
            />
          </div>
        </div>
      </main>

      <footer className="max-w-3xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-1 text-xs text-gray-400">
        <span>© {new Date().getFullYear()} BioPet – Medicina Veterinária</span>
        <span>Todos os direitos reservados</span>
      </footer>
    </div>
  )
}

function InfoField({ label, value, large }: { label: string; value: string; large?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-[#8a6e36] uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-[#19202d] ${large ? 'text-lg sm:text-xl font-bold' : 'font-medium'}`}>{value}</p>
    </div>
  )
}
