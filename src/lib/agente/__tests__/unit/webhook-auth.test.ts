import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * O webhook do agente é a porta de entrada do WhatsApp e o corpo dele é 100%
 * controlável por quem faz o POST — inclusive o telefone que autoriza cancelar,
 * remarcar e receber laudo. Estes testes provam que sem o segredo nada acontece:
 * não parseia o corpo, não enfileira mensagem, não manda WhatsApp.
 */

const parseEvolutionWebhook = vi.fn(() => ({ processavel: true, telefone: '5524981367482', texto: 'oi', msgId: 'X1' }))
const enfileirarMensagem = vi.fn()
const sendWhatsAppText = vi.fn(async () => true)

vi.mock('@/lib/agente/conversa', () => ({
  parseEvolutionWebhook,
  carregarConversa: vi.fn(async () => ({ historico: [], ultimaMsgId: null })),
  salvarConversa: vi.fn(async () => {}),
  telefoneBloqueado: vi.fn(async () => false),
  emAtendimentoHumano: vi.fn(async () => false),
  marcarAtendimentoHumano: vi.fn(async () => {}),
  getConfigPromptAgente: vi.fn(async () => ({ faq: '', examesNaoAgendaveis: '' })),
}))
vi.mock('@/lib/agente/debounce', () => ({ enfileirarMensagem }))
vi.mock('@/lib/evolution', () => ({
  sendWhatsAppText,
  getBase64FromMedia: vi.fn(async () => null),
}))
vi.mock('@/lib/agente/orquestrador', () => ({ acionarHumanoPorErro: vi.fn(async () => {}) }))
vi.mock('@/lib/agente/responder-provedor', () => ({
  responder: vi.fn(async () => ({ resposta: 'ok', historico: [] })),
}))
vi.mock('@/lib/agente/midia', () => ({
  transcreverAudio: vi.fn(async () => ''),
  lerImagemEncaminhamento: vi.fn(async () => ''),
}))
vi.mock('@/lib/agente/outbound', () => ({
  classificarFromMe: vi.fn(async () => 'ia'),
  registrarHumano: vi.fn(async () => {}),
  contextoPendente: vi.fn(async () => undefined),
}))
vi.mock('@/lib/agente/revisoes-disponiveis', () => ({
  montarInfoClienteNovo: vi.fn(async () => undefined),
}))

const SEGREDO = 'segredo-de-teste-do-webhook'

/** Payload legítimo de mensagem recebida (o que a Evolution mandaria). */
const BODY = {
  event: 'messages.upsert',
  data: {
    key: { remoteJid: '28278182142054@lid', remoteJidAlt: '5524981367482@s.whatsapp.net', fromMe: false, id: 'ABC123' },
    pushName: 'Atacante',
    message: { conversation: 'cancela meu agendamento' },
  },
}

function req(headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/agente/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(BODY),
  }) as any
}

/** Importa a rota já com o ambiente montado (o módulo lê env em runtime). */
async function POST(request: any) {
  const mod = await import('@/app/api/agente/webhook/route')
  return mod.POST(request)
}

describe('POST /api/agente/webhook — segredo compartilhado', () => {
  const envOriginal = process.env.EVOLUTION_WEBHOOK_SECRET

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    process.env.EVOLUTION_WEBHOOK_SECRET = SEGREDO
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (envOriginal === undefined) delete process.env.EVOLUTION_WEBHOOK_SECRET
    else process.env.EVOLUTION_WEBHOOK_SECRET = envOriginal
  })

  it('sem header de segredo: 401 e não chega a parsear o corpo', async () => {
    const res = await POST(req())
    expect(res.status).toBe(401)
    expect(parseEvolutionWebhook).not.toHaveBeenCalled()
    expect(enfileirarMensagem).not.toHaveBeenCalled()
  })

  it('com segredo errado: 401 e nenhuma mensagem de WhatsApp disparada', async () => {
    const res = await POST(req({ 'x-webhook-token': 'chute-do-atacante' }))
    expect(res.status).toBe(401)
    expect(parseEvolutionWebhook).not.toHaveBeenCalled()
    expect(enfileirarMensagem).not.toHaveBeenCalled()
    expect(sendWhatsAppText).not.toHaveBeenCalled()
  })

  it('sem EVOLUTION_WEBHOOK_SECRET no ambiente: falha fechada mesmo com header "certo"', async () => {
    delete process.env.EVOLUTION_WEBHOOK_SECRET
    const res = await POST(req({ 'x-webhook-token': SEGREDO }))
    expect(res.status).toBe(401)
    expect(parseEvolutionWebhook).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalled()
  })

  it('com o segredo certo: processa normalmente (a Evolution real continua entregando)', async () => {
    const res = await POST(req({ 'x-webhook-token': SEGREDO }))
    expect(res.status).toBe(200)
    expect(parseEvolutionWebhook).toHaveBeenCalledTimes(1)
    expect(enfileirarMensagem).toHaveBeenCalledTimes(1)
    expect(enfileirarMensagem.mock.calls[0][0]).toBe('5524981367482')
  })

  it('aceita o segredo também pelo header "apikey" (formato nativo da Evolution)', async () => {
    const res = await POST(req({ apikey: SEGREDO }))
    expect(res.status).toBe(200)
    expect(parseEvolutionWebhook).toHaveBeenCalledTimes(1)
  })

  it('não vaza o motivo da recusa no corpo da resposta', async () => {
    const res = await POST(req({ 'x-webhook-token': 'errado' }))
    expect(await res.json()).toEqual({ error: 'Não autorizado.' })
  })
})
