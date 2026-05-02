import type { Metadata } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'

const font = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'BioPet – Laboratório Veterinário',
  description: 'Laboratório Veterinário de Análises Clínicas e Diagnóstico por Imagem',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={`${font.className} bg-gray-50 text-gray-900 antialiased`}>{children}</body>
    </html>
  )
}
