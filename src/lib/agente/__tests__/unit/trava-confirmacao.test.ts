import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(function AnthropicMock(this: any) {
    this.messages = { create: mockCreate }
  }),
}))

import {
  afirmaAgendamentoCriado,
  turnoCriouAgendamento,
  violouTrava,
  TEXTO_SEM_CONFIRMACAO,
} from '@/lib/agente/trava-confirmacao'
import { responder } from '@/lib/agente/orquestrador'

const TEL = '5524999999999'

describe('afirmaAgendamentoCriado', () => {
  it('pega o selo padrão e variações', () => {
    expect(afirmaAgendamentoCriado('Agendamento solicitado ✓\n\nNina — 09/10')).toBe(true)
    expect(afirmaAgendamentoCriado('Revisão registrada ✓ Segunda, 19/10')).toBe(true)
    expect(afirmaAgendamentoCriado('Exame agendado ✓')).toBe(true)
    expect(afirmaAgendamentoCriado('✓ Agendamento solicitado')).toBe(true)
  })

  it('não dispara em recap, pergunta, promessa ou aviso', () => {
    expect(afirmaAgendamentoCriado('Vejo que já agendei um ultrassom hoje (02/10) às 13h.')).toBe(false)
    expect(afirmaAgendamentoCriado('Posso confirmar o agendamento?')).toBe(false)
    expect(afirmaAgendamentoCriado('Seu agendamento é amanhã às 9h30, tudo certo!')).toBe(false)
    expect(afirmaAgendamentoCriado('Um atendente vai confirmar o agendamento com você.')).toBe(false)
    expect(afirmaAgendamentoCriado('⚠️ Isso ainda não é a confirmação.')).toBe(false)
  })
})

describe('turnoCriouAgendamento / violouTrava', () => {
  const ok = { nome: 'agendar', resultado: { agendamento_id: 734, valor_total: 200 } }

  it('sucesso real (agendamento_id, sem erro) libera a mensagem', () => {
    expect(turnoCriouAgendamento([ok])).toBe(true)
    expect(violouTrava('Agendamento solicitado ✓', [ok])).toBe(false)
    expect(
      violouTrava('Revisão registrada ✓', [{ nome: 'agendar_revisao', resultado: { agendamento_id: 157 } }]),
    ).toBe(false)
  })

  it('tool recusada, nenhuma tool ou tool de outro tipo → viola', () => {
    const recusado = { nome: 'agendar', resultado: { erro: true, status: 422, error: 'precisa_atendente' } }
    expect(violouTrava('Agendamento solicitado ✓', [recusado])).toBe(true)
    expect(violouTrava('Agendamento solicitado ✓', [])).toBe(true)
    expect(violouTrava('Agendamento solicitado ✓', [{ nome: 'transferir_humano', resultado: { sucesso: true } }])).toBe(true)
    expect(violouTrava('Agendamento solicitado ✓', [{ nome: 'consultar_precos', resultado: { agendamento_id: 1 } }])).toBe(true)
  })

  it('sem afirmação de criação nunca viola, mesmo sem tool', () => {
    expect(violouTrava('Qual horário você prefere?', [])).toBe(false)
  })
})

describe('responder() com a trava (modelo simulado)', () => {
  beforeEach(() => {
    mockCreate.mockReset()
    process.env.ANTHROPIC_API_KEY = 'sk-ant-fake'
  })

  const usage = { input_tokens: 10, output_tokens: 5 }

  // Caso real 04/10 (Leidiane/Nina): agendar recusado + "Agendamento solicitado ✓".
  it('agendar recusado + "Agendamento solicitado ✓" → texto honesto, escala e limpa o histórico', async () => {
    mockCreate
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [
          { type: 'tool_use', id: 't1', name: 'agendar', input: { exames: [{ tipo_exame: 'Raio-X' }] } },
        ],
        usage,
      })
      .mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Agendamento solicitado ✓\n\nNina — Raio-X — 05/10 9h' }],
        usage,
      })
    const chamadas: string[] = []
    const executar = vi.fn(async (nome: string) => {
      chamadas.push(nome)
      if (nome === 'agendar') return { erro: true, status: 422, error: 'precisa_atendente' }
      return { sucesso: true }
    })

    const r = await responder(TEL, 'pode confirmar', [], { executar })

    expect(r.resposta).toMatch(/não está marcado/i)
    expect(r.resposta).not.toMatch(/✓/)
    expect(chamadas).toEqual(['agendar', 'transferir_humano'])
    const transf = executar.mock.calls.find((c) => c[0] === 'transferir_humano')!
    expect((transf[1] as any).resumo).toMatch(/TRAVA/)
    // O histórico que vai pro banco não guarda a mentira.
    const ultima = r.historico[r.historico.length - 1]
    expect(JSON.stringify(ultima)).toContain(TEXTO_SEM_CONFIRMACAO.slice(0, 30))
    expect(JSON.stringify(r.historico)).not.toContain('Agendamento solicitado ✓')
  })

  it('já escalou no turno (transferir_humano) → troca o texto mas NÃO escala de novo', async () => {
    mockCreate
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 't1', name: 'transferir_humano', input: { motivo: 'pergunta_tecnica', resumo: 'x' } }],
        usage,
      })
      .mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Agendamento solicitado ✓ Camila — Raio-X' }],
        usage,
      })
    const executar = vi.fn(async () => ({ sucesso: true }))

    const r = await responder(TEL, 'ok', [], { executar })

    expect(r.resposta).toMatch(/não está marcado/i)
    expect(executar).toHaveBeenCalledTimes(1) // só a transferência da própria IA
  })

  it('agendar com sucesso + selo ✓ → mensagem passa intacta, sem escalar', async () => {
    mockCreate
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 't1', name: 'agendar', input: { pet_id: 1 } }],
        usage,
      })
      .mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Agendamento solicitado ✓\n\nNina — 09/10 9h30' }],
        usage,
      })
    const executar = vi.fn(async (nome: string) => (nome === 'agendar' ? { agendamento_id: 734, valor_total: 200 } : { sucesso: true }))

    const r = await responder(TEL, 'sim', [], { executar })

    expect(r.resposta).toMatch(/Agendamento solicitado ✓/)
    expect(executar).toHaveBeenCalledTimes(1)
  })

  it('selo ✓ numa resposta SEM nenhuma tool (alucinação pura) → bloqueia e escala', async () => {
    mockCreate.mockResolvedValueOnce({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Agendamento solicitado ✓ Maya — 16h30 — R$ 120' }],
      usage,
    })
    const executar = vi.fn(async () => ({ sucesso: true }))

    const r = await responder(TEL, 'quero hoje 16h30', [], { executar })

    expect(r.resposta).toMatch(/não está marcado/i)
    expect(executar).toHaveBeenCalledWith('transferir_humano', expect.any(Object), TEL)
  })
})
