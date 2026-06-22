import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyAgentKey } from '@/lib/agent-auth'
import { sendWhatsAppDocument } from '@/lib/evolution'
import { readPdf } from '@/lib/pdf-storage'

/**
 * Envia o PDF de um laudo direto no WhatsApp do tutor (base64), como faz o
 * envio manual da admin. Usado pelo agente: os links de laudo exigem login
 * (fechados por segurança), então o cliente recebe o ARQUIVO, não um link.
 *
 * Segurança: confere que o laudo pertence ao tutor dono do telefone informado.
 */
export async function POST(request: NextRequest) {
  if (!verifyAgentKey(request)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const telefone: string | undefined = body?.telefone
  const laudoId = Number(body?.laudo_id)

  if (!telefone || !laudoId) {
    return NextResponse.json({ error: '"telefone" e "laudo_id" são obrigatórios.' }, { status: 400 })
  }

  const digits  = telefone.replace(/\D/g, '')
  const telNorm = digits.startsWith('55') ? digits : `55${digits}`

  const { data: tutor } = await supabase
    .from('tutores')
    .select('id')
    .or(`telefone.eq.${telNorm},telefone.eq.${digits}`)
    .maybeSingle()

  if (!tutor) {
    return NextResponse.json({ error: 'Tutor não encontrado.' }, { status: 404 })
  }

  const { data: laudo } = await supabase
    .from('laudos')
    .select('id, tutor_id, nome_pet, filename, original_name')
    .eq('id', laudoId)
    .maybeSingle()

  if (!laudo || laudo.tutor_id !== tutor.id) {
    // Não vaza existência de laudos de outros tutores.
    return NextResponse.json({ error: 'Laudo não encontrado para este tutor.' }, { status: 404 })
  }
  if (!laudo.filename) {
    return NextResponse.json({ error: 'Este laudo ainda não tem arquivo disponível.' }, { status: 422 })
  }

  const buffer = await readPdf(laudo.filename)
  if (!buffer) {
    return NextResponse.json({ error: 'Arquivo do laudo não encontrado.' }, { status: 404 })
  }

  const fileName = laudo.original_name ?? `laudo_${laudo.nome_pet ?? laudo.id}.pdf`
  const ok = await sendWhatsAppDocument(
    telNorm,
    buffer.toString('base64'),
    fileName,
    `Aqui está o laudo do *${laudo.nome_pet ?? 'seu pet'}* 🐾`,
  )

  if (!ok) return NextResponse.json({ error: 'Falha ao enviar o PDF.' }, { status: 502 })
  return NextResponse.json({ enviado: true })
}
