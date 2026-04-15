import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyAgentKey } from '@/lib/agent-auth'
import { sendWhatsAppText } from '@/lib/evolution'

const TIPOS_QUE_ENVIAM_WHATSAPP = new Set([
  'ia_travou', 'pergunta_laudo', 'pergunta_tecnica', 'erro_tecnico',
  'agendamento_clinica',
])

const TIPOS_QUE_BLOQUEIAM_IA = new Set([
  'ia_travou', 'pergunta_laudo', 'pergunta_tecnica', 'erro_tecnico',
])

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
  const {
    telefone, nome_tutor, motivo, mensagem_cliente, mensagem_ia,
    tipo_evento, agendamento_id,
  } = body ?? {}

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
    tipo_evento:      tipo_evento ?? null,
    agendamento_id:   agendamento_id ?? null,
  })
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  // Tipo efetivo: usa tipo_evento se fornecido, senão trata motivo como tipo
  const tipoEfetivo = tipo_evento ?? motivo

  // Bloqueia IA (atendimento_humano) apenas para tipos de atenção
  if (TIPOS_QUE_BLOQUEIAM_IA.has(tipoEfetivo)) {
    const digits  = telefone.replace(/\D/g, '')
    const telNorm = digits.startsWith('55') ? digits : `55${digits}`

    const { data: cfg } = await supabase
      .from('configuracoes_agente')
      .select('tempo_retorno_ia_horas')
      .limit(1)
      .single()
    const horas = cfg?.tempo_retorno_ia_horas ?? 2
    const expiracao = new Date(Date.now() + horas * 60 * 60 * 1000).toISOString()

    await supabase
      .from('tutores')
      .update({ atendimento_humano: true, atendimento_humano_ate: expiracao })
      .or(`telefone.eq.${telNorm},telefone.eq.${digits}`)
  }

  // Envia WhatsApp para admins para tipos que requerem notificação
  if (TIPOS_QUE_ENVIAM_WHATSAPP.has(tipoEfetivo)) {
    const motivoLabel  = MOTIVO_LABEL[motivo] ?? motivo
    const telFormatado = formatTelefone(telefone)

    const mensagem = tipoEfetivo === 'agendamento_clinica'
      ? [
          `🏥 BioPet — Novo agendamento pela clínica`,
          nome_tutor ? `Tutor: ${nome_tutor}` : null,
          mensagem_cliente ? mensagem_cliente : null,
          agendamento_id ? `Agendamento #${agendamento_id}` : null,
        ].filter(Boolean).join('\n')
      : [
          `⚠️ BioPet — Atendimento necessário`,
          `Cliente: ${nome_tutor ?? 'Desconhecido'}`,
          `Motivo: ${motivoLabel}`,
          mensagem_cliente ? `Mensagem: '${mensagem_cliente}'` : null,
          `Número: ${telFormatado}`,
        ].filter(Boolean).join('\n')

    const admins = [
      process.env.ADMIN_WHATSAPP_1,
      process.env.ADMIN_WHATSAPP_2,
    ].filter(Boolean) as string[]

    await Promise.all(admins.map(num => sendWhatsAppText(num, mensagem)))
  }

  return NextResponse.json({ sucesso: true })
}
