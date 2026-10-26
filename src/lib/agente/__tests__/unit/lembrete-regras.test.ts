import { describe, it, expect } from 'vitest'
import {
  temProgressoReal,
  terminaEmPergunta,
  ehOfertaSecundaria,
  equipeRespondeuDepois,
} from '@/lib/agente/lembrete-regras'

const uso = (...nomes: string[]) => ({
  role: 'assistant',
  content: nomes.map((name, i) => ({ type: 'tool_use', id: `t${i}`, name, input: {} })),
})

describe('terminaEmPergunta', () => {
  it('pega pergunta colada, com emoji e com parêntese final', () => {
    expect(terminaEmPergunta('Qual horário você prefere?')).toBe(true)
    expect(terminaEmPergunta('Quer aproveitar? 🐾')).toBe(true)
    expect(terminaEmPergunta('Posso confirmar? 😊')).toBe(true)
    // Caso real Valdir/Oto, 15/10: parou aqui e nenhum lembrete saiu.
    expect(terminaEmPergunta('Qual é a espécie do Oto? (cachorro ou gato)')).toBe(true)
    expect(terminaEmPergunta('Pode ser PIX ou cartão?\n')).toBe(true)
  })

  it('não dispara em afirmação, aviso ou "?" no meio', () => {
    expect(terminaEmPergunta('Anotei tudo. Um atendente confirma em breve.')).toBe(false)
    expect(terminaEmPergunta('Você disse "ok?" mas ainda preciso do nome do tutor.')).toBe(false)
    expect(terminaEmPergunta('Recebemos seu comprovante, obrigada! 🐾')).toBe(false)
  })
})

describe('temProgressoReal', () => {
  it('só preço/identificação/laudo NÃO é progresso (fim do ia_travou à toa)', () => {
    expect(temProgressoReal([uso('consultar_precos')])).toBe(false)
    expect(temProgressoReal([uso('identificar_tutor', 'consultar_precos', 'listar_laudos')])).toBe(false)
    expect(temProgressoReal([{ role: 'user', content: 'oi' }])).toBe(false)
  })

  it('cadastro, horário ou agendamento é progresso', () => {
    expect(temProgressoReal([uso('cadastrar_tutor')])).toBe(true)
    expect(temProgressoReal([uso('consultar_precos'), uso('horarios_livres')])).toBe(true)
    expect(temProgressoReal([uso('agendar')])).toBe(true)
  })
})

describe('ehOfertaSecundaria', () => {
  it('reconhece o gancho "Aliás"', () => {
    expect(ehOfertaSecundaria('Aliás, a Zelda ainda tem revisão gratuita. Quer aproveitar?')).toBe(true)
    expect(ehOfertaSecundaria('Qual horário você prefere?')).toBe(false)
  })
})

describe('equipeRespondeuDepois (item 34)', () => {
  const ia = '2026-10-06T17:22:00.000Z'

  it('mensagem do sistema/atendente DEPOIS da IA → pula o lembrete', () => {
    expect(equipeRespondeuDepois('2026-10-06T17:29:00', ia)).toBe(true) // criado_em naive = UTC
    expect(equipeRespondeuDepois('2026-10-06T17:29:00+00:00', ia)).toBe(true)
  })

  it('mensagem ANTES da IA, ou nenhuma → lembrete segue', () => {
    expect(equipeRespondeuDepois('2026-10-06T17:00:00', ia)).toBe(false)
    expect(equipeRespondeuDepois(null, ia)).toBe(false)
    expect(equipeRespondeuDepois(undefined, ia)).toBe(false)
  })
})
