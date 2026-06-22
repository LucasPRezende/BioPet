import { describe, it, expect } from 'vitest'
import { novaConversa } from './harness'

/**
 * Testes COMPORTAMENTAIS — chamam a Anthropic de verdade (pegam regressão de
 * prompt). Auto-pulam sem ANTHROPIC_API_KEY. Rodar com: `npm run test:agent`.
 * As asserções focam em QUAL tool o modelo chamou (robusto), não no texto exato.
 */
const temChave = !!process.env.ANTHROPIC_API_KEY
const run = describe.skipIf(!temChave)

run('comportamento do agente (IA real, tools fake)', () => {
  it(
    'aciona atendente humano em pergunta clínica (não dá orientação)',
    async () => {
      const c = novaConversa()
      await c.enviar('meu cachorro está vomitando muito desde ontem, o que devo dar pra ele?')

      expect(c.nomes()).toContain('transferir_humano')
      expect(c.nomes()).not.toContain('agendar')
    },
    30_000,
  )

  it(
    'envia o laudo como PDF (enviar_laudo) e nunca manda link',
    async () => {
      const c = novaConversa()
      await c.enviar('oi, queria receber o laudo do meu pet Rex')
      // Segunda rodada para confirmar, caso ele tenha perguntado qual laudo.
      if (!c.nomes().includes('enviar_laudo')) {
        await c.enviar('isso, pode enviar esse mesmo')
      }

      expect(c.nomes()).toContain('listar_laudos')
      expect(c.nomes()).toContain('enviar_laudo')
      expect(c.textos()).not.toContain('http')
    },
    45_000,
  )

  it(
    'aceita agendamento em fim de semana (não recusa por ser sábado/domingo)',
    async () => {
      const c = novaConversa()
      await c.enviar('queria marcar um ultrassom abdominal pro Rex no próximo sábado de manhã')

      // Não deve travar/recusar: ou seguiu o fluxo (horários/preços) ou pediu
      // mais dados — o que importa é NÃO ter recusado por ser fim de semana.
      const recusou = /n[ãa]o atendemos|somente de segunda|apenas.*segunda a sexta|n[ãa]o funcionamos/i.test(
        c.textos(),
      )
      expect(recusou).toBe(false)
    },
    30_000,
  )
})
