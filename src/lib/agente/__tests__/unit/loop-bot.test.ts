import { describe, it, expect } from 'vitest'
import { detectarLoopBot, normalizarMensagem } from '@/lib/agente/loop-bot'

const cliente = (texto: string) => ({ role: 'user', content: texto })
const ia = (texto: string) => ({ role: 'assistant', content: [{ type: 'text', text: texto }] })
const iaTool = () => ({
  role: 'assistant',
  content: [{ type: 'tool_use', id: 't1', name: 'consultar_precos', input: {} }],
})
const resultadoTool = () => ({
  role: 'user',
  content: [{ type: 'tool_result', tool_use_id: 't1', content: '{}' }],
})

describe('normalizarMensagem', () => {
  it('ignora acento, caixa, emoji e pontuação', () => {
    expect(normalizarMensagem('*Assistente BB:* 😀\nDesculpe, não entendi muito bem 😥')).toBe(
      'assistente bb desculpe nao entendi muito bem',
    )
  })
})

describe('detectarLoopBot — repetição', () => {
  const URA = 'Você está com problemas técnicos em qual serviço? 1- Claro Móvel 2- Claro Tv'

  it('1ª e 2ª vez não disparam; a 3ª dispara', () => {
    const h1 = [cliente(URA), ia('Chat errado!')]
    expect(detectarLoopBot([], URA).loop).toBe(false)
    expect(detectarLoopBot(h1, URA).loop).toBe(false)
    const h2 = [...h1, cliente(URA), ia('Não sou a Claro.')]
    const r = detectarLoopBot(h2, URA)
    expect(r.loop).toBe(true)
    expect(r.motivo).toBe('repeticao')
  })

  it('repetição com emoji/pontuação diferente conta como a mesma', () => {
    const h = [
      cliente('*Assistente BB:* Desculpe, não entendi muito bem 😥'),
      ia('ok'),
      cliente('*Assistente BB:*  😀\nDesculpe, não entendi muito bem 😥'),
      ia('ok'),
    ]
    expect(detectarLoopBot(h, 'Assistente BB: Desculpe, não entendi muito bem').loop).toBe(true)
  })

  it('mensagem curta repetida ("oi", "ok", "?") não dispara', () => {
    const h = [cliente('oi'), ia('Olá!'), cliente('oi'), ia('Olá!')]
    expect(detectarLoopBot(h, 'oi').loop).toBe(false)
    const h2 = [cliente('ok obrigada'), ia('de nada'), cliente('ok obrigada'), ia('de nada')]
    expect(detectarLoopBot(h2, 'ok obrigada').loop).toBe(false)
  })

  it('tool_result (entrada user sem texto) não conta como mensagem do cliente', () => {
    const h = [cliente('Quero marcar ultrassom amanhã de manhã'), iaTool(), resultadoTool(), ia('Tenho 9h')]
    expect(detectarLoopBot(h, 'Quero marcar ultrassom amanhã de manhã').loop).toBe(false)
  })
})

describe('detectarLoopBot — cara de robô', () => {
  const variantes = [
    'Poxa, não consegui entender o que você falou. Digite o tema, por favor',
    'Desculpe, não consegui processar sua mensagem! Tente novamente mais tarde.',
    'Sou um assistente virtual, volte ao menu principal',
    'Desculpe, não entendi muito bem 😥 (1)',
    'Desculpe, não entendi muito bem 😥 (2)',
  ]

  it('4 de 6 com cara de robô e sem nenhuma tool → dispara', () => {
    const h = [
      cliente('Oi, bom dia'),
      ia('Olá!'),
      ...variantes.slice(0, 4).flatMap((t) => [cliente(t), ia('ok')]),
    ]
    const r = detectarLoopBot(h, variantes[4])
    expect(r.loop).toBe(true)
    expect(r.motivo).toBe('robo')
  })

  it('se a IA chamou tool no intervalo, é conversa de verdade → não dispara', () => {
    const h = [
      cliente('Oi, bom dia'),
      iaTool(),
      resultadoTool(),
      ia('Olá!'),
      ...variantes.slice(0, 4).flatMap((t) => [cliente(t), ia('ok')]),
    ]
    expect(detectarLoopBot(h, variantes[4]).loop).toBe(false)
  })

  it('menos de 6 mensagens no total não dispara por esse critério', () => {
    const h = [cliente(variantes[0]), ia('ok'), cliente(variantes[1]), ia('ok')]
    expect(detectarLoopBot(h, variantes[2]).loop).toBe(false)
  })
})

describe('detectarLoopBot — conversa normal', () => {
  it('cliente de verdade com várias mensagens diferentes não dispara', () => {
    const h = [
      cliente('Bom dia'),
      ia('Olá!'),
      cliente('Gostaria de agendar um ultrassom'),
      ia('Qual o pet?'),
      cliente('Mel, cachorra'),
      ia('Qual dia?'),
      cliente('Amanhã de manhã'),
      ia('Tenho 9h'),
      cliente('Pode ser 9h'),
      ia('Pix ou cartão?'),
    ]
    expect(detectarLoopBot(h, 'Pix').loop).toBe(false)
  })

  it('histórico vazio / mensagem única não dispara', () => {
    expect(detectarLoopBot([], 'Oi, tudo bem? Queria saber o valor do raio-x').loop).toBe(false)
  })
})
