import Image from 'next/image'

// Recibo do link já pago. Sem CPF, nome do pet, exame ou valor: o link fica pra
// sempre na conversa do WhatsApp e pode acabar na mão de qualquer um.
export default function PagamentoConfirmado() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-8">
      <div className="bg-white rounded-2xl shadow-sm border max-w-sm w-full p-6 space-y-5">

        <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
          <div className="relative w-10 h-10 flex-shrink-0">
            <Image src="/logo.png" alt="BioPet" fill className="object-contain" />
          </div>
          <div>
            <p className="font-bold text-[#19202d] text-sm">BioPet Vet</p>
            <p className="text-xs text-gray-400">Pagamento PIX</p>
          </div>
        </div>

        <div className="text-center space-y-3 py-4">
          <div className="text-5xl">✅</div>
          <p className="font-bold text-[#19202d]">Pagamento confirmado!</p>
          <p className="text-sm text-gray-500">
            Este link já foi pago. O agendamento está garantido — os detalhes foram enviados no WhatsApp.
          </p>
        </div>

        <p className="text-xs text-gray-300 text-center pt-2 border-t border-gray-50">
          Powered by Mercado Pago
        </p>
      </div>
    </div>
  )
}
