/**
 * Integração com Evolution API para envio de mensagens WhatsApp.
 */

export async function sendWhatsAppText(whatsapp: string, text: string): Promise<boolean> {
  const apiUrl   = process.env.EVOLUTION_API_URL
  const apiKey   = process.env.EVOLUTION_API_KEY
  const instance = process.env.EVOLUTION_INSTANCE

  if (!apiUrl || !apiKey || !instance) {
    console.warn('[Evolution API] Variáveis não configuradas.')
    console.log(`  Para: ${whatsapp}`)
    console.log(`  Texto: ${text}`)
    return false
  }

  const digits = whatsapp.replace(/\D/g, '')
  const number = digits.startsWith('55') ? digits : `55${digits}`

  try {
    const res = await fetch(`${apiUrl}/message/sendText/${instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify({ number, text }),
    })
    if (!res.ok) {
      console.error(`[Evolution API] Erro ${res.status}:`, await res.text())
      return false
    }
    return true
  } catch (err) {
    console.error('[Evolution API] Falha na requisição:', err)
    return false
  }
}

export async function sendClinicaInvite(
  telefone: string,
  nomeClinica: string,
  token: string,
  senhaTemporaria: string,
): Promise<boolean> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const link = `${baseUrl}/clinica/cadastro?token=${token}`
  const message =
    `Olá! A BioPet cadastrou *${nomeClinica}* como parceira.\n\n` +
    `Acesse o portal pelo link abaixo para definir sua senha:\n${link}\n\n` +
    `Senha temporária: *${senhaTemporaria}*`

  return sendWhatsAppText(telefone, message)
}

export async function sendVetInvite(
  whatsapp: string,
  nome: string,
  token: string,
  tipo: 'convite' | 'recuperacao' = 'convite',
): Promise<boolean> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const rota    = tipo === 'recuperacao' ? 'recuperar' : 'cadastro'
  const link    = `${baseUrl}/vet/${rota}?token=${token}`
  const message = tipo === 'recuperacao'
    ? `Olá ${nome}! Recebemos uma solicitação de redefinição de senha. Acesse o link abaixo para criar uma nova senha:\n\n${link}`
    : `Olá ${nome}! A BioPet compartilhou laudos com você. Acesse seu portal pelo link abaixo:\n\n${link}`

  const apiUrl   = process.env.EVOLUTION_API_URL
  const apiKey   = process.env.EVOLUTION_API_KEY
  const instance = process.env.EVOLUTION_INSTANCE

  if (!apiUrl || !apiKey || !instance) {
    console.warn('[Evolution API] Variáveis não configuradas — mensagem não enviada.')
    console.log(`  Para: ${whatsapp}`)
    console.log(`  Texto: ${message}`)
    return false
  }

  const digits = whatsapp.replace(/\D/g, '')
  const number = digits.startsWith('55') ? digits : `55${digits}`

  try {
    const res = await fetch(`${apiUrl}/message/sendText/${instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify({ number, text: message }),
    })

    if (!res.ok) {
      const body = await res.text()
      console.error(`[Evolution API] Erro ${res.status}:`, body)
      return false
    }

    console.log(`[Evolution API] Mensagem enviada para ${number}`)
    return true
  } catch (err) {
    console.error('[Evolution API] Falha na requisição:', err)
    return false
  }
}
