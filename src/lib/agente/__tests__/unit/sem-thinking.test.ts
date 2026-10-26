import { describe, it, expect } from 'vitest'
import { semThinking } from '@/lib/agente/orquestrador'

describe('semThinking (histórico persistido sem blocos de thinking)', () => {
  it('remove thinking/redacted_thinking das mensagens da IA e mantém texto e tool_use', () => {
    const msgs: any[] = [
      { role: 'user', content: 'Oi' },
      {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: '', signature: 'abc' },
          { type: 'redacted_thinking', data: 'xyz' },
          { type: 'text', text: 'Vou consultar' },
          { type: 'tool_use', id: 't1', name: 'consultar_precos', input: {} },
        ],
      },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: '{}' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Pronto' }] },
    ]
    const r: any[] = semThinking(msgs)
    expect(r[1].content.map((b: any) => b.type)).toEqual(['text', 'tool_use'])
    expect(r[0]).toEqual(msgs[0])
    expect(r[2]).toEqual(msgs[2])
    expect(r[3]).toEqual(msgs[3])
  })

  it('não altera o array original e aceita conteúdo em string', () => {
    const msgs: any[] = [
      { role: 'assistant', content: 'texto puro' },
      { role: 'assistant', content: [{ type: 'thinking', thinking: 'x', signature: 's' }, { type: 'text', text: 'a' }] },
    ]
    const r: any[] = semThinking(msgs)
    expect(r[0].content).toBe('texto puro')
    expect(msgs[1].content).toHaveLength(2)
    expect(r[1].content).toHaveLength(1)
  })
})
