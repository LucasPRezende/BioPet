import { describe, it, expect } from 'vitest'
import { novaConversa, type ResponderFn } from './harness'
import { responderOpenRouter } from '@/lib/agente/orquestrador-openrouter'

/**
 * COMPARAÇÃO DE MODELOS (experimental) — roda os mesmos cenários comportamentais
 * contra vários modelos via OpenRouter e imprime uma tabela pass/fail + custo.
 * Auto-pula sem OPENROUTER_API_KEY. Rodar com: `npm run test:compare`.
 *
 * Modelos via env OPENROUTER_MODELOS (csv) — confirmar os slugs exatos em
 * openrouter.ai/models. Inclui o Haiku pela MESMA via (sem cache nativo), como
 * base apples-to-apples no dialeto OpenAI.
 */
const temChave = !!process.env.OPENROUTER_API_KEY
const run = describe.skipIf(!temChave)

const MODELOS = (
  process.env.OPENROUTER_MODELOS ??
  'anthropic/claude-haiku-4.5,deepseek/deepseek-v4-flash,minimax/minimax-m3'
)
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean)

interface Cenario {
  nome: string
  run: (c: ReturnType<typeof novaConversa>) => Promise<boolean>
}

const CENARIOS: Cenario[] = [
  {
    nome: 'bioquímica (TGO) → atendente, não agenda',
    run: async (c) => {
      await c.enviar('oi, quero agendar TGO (AST) para a Cacau')
      if (!c.nomes().includes('transferir_humano')) await c.enviar('é a Cacau mesmo')
      return c.nomes().includes('transferir_humano') && !c.nomes().includes('agendar')
    },
  },
  {
    nome: 'exame não oferecido (tomografia) sem cadastrar',
    run: async (c) => {
      await c.enviar('oi, vocês fazem tomografia?')
      return (
        !c.nomes().includes('cadastrar_tutor') &&
        !c.nomes().includes('cadastrar_pet') &&
        c.nomes().includes('consultar_precos')
      )
    },
  },
  {
    nome: 'mencionar "Dra Luciana" NÃO transfere (segue agendando)',
    run: async (c) => {
      await c.enviar('oi, queria agendar uma ultra com a Dra Luciana para o Rex')
      return !c.nomes().includes('transferir_humano') && c.nomes().length > 0
    },
  },
  {
    nome: 'emergência: orienta atendimento urgente, não agenda',
    run: async (c) => {
      await c.enviar('socorro, meu cachorro foi atropelado e está sangrando muito!')
      const t = c.textos()
      const orientou = /imediat|urg[êe]ncia|veterin|cl[íi]nica|emerg[êe]ncia|99999|vida animal/i.test(t)
      return orientou && !c.nomes().includes('agendar')
    },
  },
  {
    nome: 'laudo via enviar_laudo (não manda link)',
    run: async (c) => {
      await c.enviar('oi, queria receber o laudo do meu pet Rex')
      if (!c.nomes().includes('enviar_laudo')) await c.enviar('isso, pode enviar esse mesmo')
      return c.nomes().includes('enviar_laudo') && !c.textos().includes('http')
    },
  },
]

run('comparação de modelos (OpenRouter)', () => {
  it(
    'roda cenários em cada modelo e imprime tabela',
    async () => {
      const linhas: string[] = []
      for (const modelo of MODELOS) {
        const responderFn: ResponderFn = (t, x, h, d) => responderOpenRouter(modelo, t, x, h, d)
        let passou = 0
        let custo = 0
        const detalhes: string[] = []
        for (const cen of CENARIOS) {
          const c = novaConversa(responderFn)
          let ok = false
          try {
            ok = await cen.run(c)
          } catch (e) {
            detalhes.push(`⚠️  ${cen.nome}: ERRO (${String((e as Error).message).slice(0, 60)})`)
            custo += c.custoUSD()
            continue
          }
          if (ok) passou++
          custo += c.custoUSD()
          detalhes.push(`${ok ? '✅' : '❌'} ${cen.nome}`)
        }
        linhas.push(
          `\n=== ${modelo} ===\n` +
            detalhes.join('\n') +
            `\n→ ${passou}/${CENARIOS.length} cenários | custo total: $${custo.toFixed(5)} | ~$${(custo / CENARIOS.length).toFixed(5)}/conversa`,
        )
      }
      console.log('\n' + linhas.join('\n'))
      expect(linhas.length).toBe(MODELOS.length)
    },
    600_000,
  )
})
