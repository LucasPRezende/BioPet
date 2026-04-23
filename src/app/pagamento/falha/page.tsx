import Image from 'next/image'

export default function PagamentoFalhaPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-sm border max-w-sm w-full p-8 text-center space-y-5">
        <div className="flex justify-center mb-2">
          <div className="relative w-14 h-14">
            <Image src="/logo.png" alt="BioPet" fill className="object-contain" />
          </div>
        </div>
        <div className="text-5xl">❌</div>
        <div>
          <h1 className="text-xl font-bold text-[#19202d]">Houve um problema com o pagamento</h1>
          <p className="text-gray-500 text-sm mt-2">
            Você pode tentar novamente pelo link que recebeu no WhatsApp.
          </p>
          <p className="text-gray-500 text-sm mt-1">
            Em caso de dúvidas, entre em contato conosco.
          </p>
        </div>
        <div className="pt-2 border-t border-gray-100">
          <p className="text-xs text-gray-400">BioPet Vet — Volta Redonda</p>
        </div>
      </div>
    </div>
  )
}
