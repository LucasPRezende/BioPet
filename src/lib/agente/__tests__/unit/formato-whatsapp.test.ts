import { describe, it, expect } from 'vitest'
import { paraWhatsApp } from '@/lib/agente/orquestrador'

describe('paraWhatsApp', () => {
  it('converte **negrito** markdown para *negrito* do WhatsApp', () => {
    expect(paraWhatsApp('Olá **Maria**, tudo bem?')).toBe('Olá *Maria*, tudo bem?')
  })

  it('converte ***x*** para *x*', () => {
    expect(paraWhatsApp('total ***R$ 180***')).toBe('total *R$ 180*')
  })

  it('mantém o negrito de asterisco único intacto', () => {
    expect(paraWhatsApp('valor *180*')).toBe('valor *180*')
  })

  it('remove títulos markdown (#)', () => {
    expect(paraWhatsApp('## Resumo\nPet: Rex')).toBe('Resumo\nPet: Rex')
  })

  it('faz trim do resultado', () => {
    expect(paraWhatsApp('  oi  ')).toBe('oi')
  })

  it('não deixa asteriscos duplos escaparem para o cliente', () => {
    expect(paraWhatsApp('**Pet:** Rex • **Exame:** Ultrassom')).not.toContain('**')
  })
})
