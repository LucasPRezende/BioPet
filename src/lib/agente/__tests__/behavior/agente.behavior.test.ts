import { describe, it, expect, beforeAll } from 'vitest'
import { novaConversa } from './harness'

// Contato de emergência usado pelo prompt — fixado para a asserção do teste.
beforeAll(() => {
  process.env.AGENTE_CONTATO_EMERGENCIA =
    'a Clínica Veterinária 24h Vida Animal (24) 99999-0000'
})

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
    'em sintoma CRÍTICO, orienta procurar atendimento e aciona humano',
    async () => {
      const c = novaConversa()
      await c.enviar('socorro, meu cachorro foi atropelado e está sangrando muito!')

      // Deve acionar humano E orientar a buscar atendimento veterinário urgente.
      expect(c.nomes()).toContain('transferir_humano')
      const t = c.textos()
      expect(/vida animal|99999-0000|imediat|urg[êe]ncia|veterin|cl[íi]nica/i.test(t)).toBe(true)
      expect(c.nomes()).not.toContain('agendar')
    },
    30_000,
  )

  it(
    'encaminhamento com termos clínicos é pedido de agendamento (não aciona atendente)',
    async () => {
      const c = novaConversa()
      await c.enviar(
        '[O cliente enviou um encaminhamento veterinário por PDF para AGENDAR o(s) exame(s) descrito(s). ' +
          'Termos clínicos abaixo são a indicação do exame, NÃO um sintoma relatado pelo cliente — prossiga com o agendamento normalmente. ' +
          'Conteúdo extraído pelo sistema:]\n' +
          'Exame solicitado: Ultrassom abdominal. Pet: Rex. Indicação: suspeita de neoplasia, vômito recorrente. Solicitante: Dra. Ana.',
      )

      // Deve seguir o fluxo (identificar/preço/horário/etc.), não repassar para humano.
      expect(c.nomes()).not.toContain('transferir_humano')
      expect(c.nomes().length).toBeGreaterThan(0)
    },
    30_000,
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
