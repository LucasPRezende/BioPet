import { notFound } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'

export default async function LaudoPage({ params }: { params: { token: string } }) {
  const { data: laudo } = await supabase
    .from('laudos')
    .select('*')
    .eq('token', params.token)
    .single()

  if (!laudo) notFound()

  const dataCriacao = new Date(laudo.created_at).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#19202d] text-white">
        <div className="h-1 bg-gold-stripe" />
        <div className="max-w-3xl mx-auto px-4 py-5 flex items-center gap-4">
          <div className="relative w-16 h-16 shrink-0">
            <Image src="/logo.png" alt="BioPet" fill className="object-contain" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-wide">BioPet</h1>
            <p className="text-[#c4a35a] text-xs tracking-widest uppercase">Medicina Veterinária</p>
          </div>
        </div>
        <div className="max-w-3xl mx-auto px-4 pb-3">
          <p className="text-gray-400 text-xs uppercase tracking-widest">Laudo Médico Veterinário</p>
        </div>
        <div className="h-px bg-gold-stripe opacity-30" />
      </header>

      <main className="max-w-3xl mx-auto px-4 py-7 space-y-5">
        {/* Dados do paciente */}
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="h-1 bg-gold-stripe" />
          <div className="p-6">
            <h2 className="text-xs font-bold text-[#19202d] uppercase tracking-widest mb-5">
              Dados do Paciente
            </h2>
            <div className="grid grid-cols-2 gap-5">
              <InfoField label="Nome do Animal" value={laudo.nome_pet} large />
              <InfoField label="Espécie"        value={laudo.especie} />
              <InfoField label="Proprietário"   value={laudo.tutor} />
              <InfoField label="Telefone"       value={laudo.telefone} />
              <div className="col-span-2">
                <InfoField label="Data do Laudo" value={dataCriacao} />
              </div>
            </div>
          </div>
        </div>

        {/* PDF */}
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="h-1 bg-gold-stripe" />
          <div className="p-6">
            <div className="flex justify-between items-center mb-5">
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
            <iframe
              src={`/api/pdf/${laudo.id}`}
              className="w-full rounded-lg border border-gray-100"
              style={{ height: '660px' }}
              title={`Laudo de ${laudo.nome_pet}`}
            />
          </div>
        </div>
      </main>

      <footer className="max-w-3xl mx-auto px-4 py-6 flex items-center justify-between text-xs text-gray-400">
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
      <p className={`text-[#19202d] ${large ? 'text-xl font-bold' : 'font-medium'}`}>{value}</p>
    </div>
  )
}
