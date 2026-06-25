import { describe, it, expect } from 'vitest'
import { writeFileSync } from 'node:fs'
import { novaConversa, type ResponderFn } from './harness'
import { responderOpenRouter } from '@/lib/agente/orquestrador-openrouter'

/**
 * TRANSCRIÇÃO (experimental) — roda uma conversa de agendamento real + o caso
 * difícil (encaminhamento de pet novo) contra alguns modelos e grava o diálogo
 * em transcricao-modelos.txt, para ver o "jeitão" de cada um na prática.
 * Auto-pula sem OPENROUTER_API_KEY. `npm run test:transcricao`.
 */
const temChave = !!process.env.OPENROUTER_API_KEY
const run = describe.skipIf(!temChave)

const MODELOS = (
  process.env.OPENROUTER_MODELOS ??
  'deepseek/deepseek-v4-pro,minimax/minimax-m3,meta-llama/llama-3.3-70b-instruct:free'
)
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean)

const CONVERSA = [
  'Oi',
  'Queria marcar um ultrassom abdominal pro Rex',
  'Pode ser amanhã de manhã',
  'as 9h fica bom',
  'isso, pode confirmar',
]

const ENCAMINHAMENTO =
  '[O cliente enviou um encaminhamento veterinário por PDF para AGENDAR o exame descrito. ' +
  'Conteúdo extraído pelo sistema:]\n' +
  'Exame solicitado: Ultrassom Abdominal. Pet: Bibi. Espécie: felino (gato). ' +
  'Indicação: investigação de massa abdominal. Solicitante: Dra. Ana.'

function formatar(dialogo: { de: string; texto: string; tools?: string[] }[]): string {
  return dialogo
    .map((t) => {
      if (t.de === 'cliente') return `👤 CLIENTE: ${t.texto}`
      const tools = t.tools && t.tools.length ? `   [tools: ${t.tools.join(', ')}]\n` : ''
      return `${tools}🤖 BOT: ${t.texto}`
    })
    .join('\n')
}

run('transcrição de modelos', () => {
  it(
    'grava conversas reais por modelo',
    async () => {
      const blocos: string[] = []
      for (const modelo of MODELOS) {
        const responderFn: ResponderFn = (t, x, h, d) => responderOpenRouter(modelo, t, x, h, d)
        let custo = 0
        let bloco = `\n\n══════════════════════════════════════\n MODELO: ${modelo}\n══════════════════════════════════════\n`

        // 1) Conversa de agendamento
        try {
          const c = novaConversa(responderFn)
          for (const msg of CONVERSA) await c.enviar(msg)
          custo += c.custoUSD()
          bloco += `\n--- Agendamento (texto) ---\n${formatar(c.dialogo())}\n`
        } catch (e) {
          bloco += `\n--- Agendamento: ERRO (${String((e as Error).message).slice(0, 120)}) ---\n`
        }

        // 2) Caso difícil: encaminhamento de pet novo
        try {
          const c = novaConversa(responderFn)
          await c.enviar(ENCAMINHAMENTO)
          custo += c.custoUSD()
          const passou = c.nomes().includes('cadastrar_pet') && !c.nomes().includes('transferir_humano')
          bloco += `\n--- Encaminhamento de pet NOVO (difícil) — ${passou ? '✅ cadastrou inferindo' : '❌ não cadastrou'} ---\n${formatar(c.dialogo())}\n`
        } catch (e) {
          bloco += `\n--- Encaminhamento: ERRO (${String((e as Error).message).slice(0, 120)}) ---\n`
        }

        bloco += `\n>>> custo aproximado destas conversas: $${custo.toFixed(5)}\n`
        blocos.push(bloco)
      }

      const saida = blocos.join('\n')
      writeFileSync('transcricao-modelos.txt', saida)
      expect(blocos.length).toBe(MODELOS.length)
    },
    1_500_000,
  )
})
