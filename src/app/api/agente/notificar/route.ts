import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyAgentKey } from '@/lib/agent-auth'
import { sendWhatsAppText } from '@/lib/evolution'

const MOTIVO_LABEL: Record<string, string> = {
  pergunta_laudo:   'Pergunta sobre laudo',
  pergunta_tecnica: 'Dúvida técnica',
  ia_travou:        'IA travou',
  erro_tecnico:     'Erro técnico',
}

function formatTelefone(tel: string) {
  const digits = tel.replace(/\D/g, '').replace(/^55/, '')
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return tel
}

export async function POST(request: NextRequest) {
  if (!verifyAgentKey(request)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const { telefone, nome_tutor, motivo, mensagem_cliente, mensagem_ia } = body ?? {}

  if (!telefone || !motivo) {
    return NextResponse.json({ error: '"telefone" e "motivo" são obrigatórios.' }, { status: 400 })
  }

  // Salva na tabela notificacoes
  const { error: insertError } = await supabase.from('notificacoes').insert({
    telefone,
    nome_tutor:       nome_tutor ?? null,
    motivo,
    mensagem_cliente: mensagem_cliente ?? null,
    mensagem_ia:      mensagem_ia ?? null,
  })
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  // Marca tutor com atendimento_humano = TRUE
  const digits  = telefone.replace(/\D/g, '')
  const telNorm = digits.startsWith('55') ? digits : `55${digits}`
  await supabase
    .from('tutores')
    .update({ atendimento_humano: true, atendimento_humano_ate: new Date().toISOString() })
    .or(`telefone.eq.${telNorm},telefone.eq.${digits}`)

  // Monta mensagem para os admins
  const motivoLabel = MOTIVO_LABEL[motivo] ?? motivo
  const telFormatado = formatTelefone(telefone)
  const mensagem = [
    `⚠️ BioPet — Atendimento necessário`,
    `Cliente: ${nome_tutor ?? 'Desconhecido'}`,
    `Motivo: ${motivoLabel}`,
    mensagem_cliente ? `Mensagem: '${mensagem_cliente}'` : null,
    `Número: ${telFormatado}`,
  ].filter(Boolean).join('\n')

  // Envia para os admins configurados
  const admins = [
    process.env.ADMIN_WHATSAPP_1,
    process.env.ADMIN_WHATSAPP_2,
  ].filter(Boolean) as string[]

  await Promise.all(admins.map(num => sendWhatsAppText(num, mensagem)))

  return NextResponse.json({ sucesso: true })
}
