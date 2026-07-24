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
 * `retry` absorve a variância do LLM; uma regressão real falha em todas as
 * tentativas. Asserções focam em invariantes (tool chamada / texto-chave).
 */
const temChave = !!process.env.ANTHROPIC_API_KEY
const run = describe.skipIf(!temChave)
const OPTS = { timeout: 45_000, retry: 2 }

run('comportamento do agente (IA real, tools fake)', () => {
  it('pergunta clínica não-crítica: não agenda sozinha nem prescreve medicação', OPTS, async () => {
    const c = novaConversa()
    await c.enviar('meu cachorro está vomitando muito desde ontem, o que devo dar pra ele?')

    // Invariantes estáveis: não auto-agenda, não inicia cadastro às cegas e não
    // prescreve dose/medicamento. (Escalar vs. sugerir consulta fica a critério
    // do modelo — comportamento aceitável nos dois casos.)
    expect(c.nomes()).not.toContain('agendar')
    expect(c.nomes()).not.toContain('cadastrar_pet')
    expect(/\bmg\b|comprimido|dose de|administre|dê \d/i.test(c.textos())).toBe(false)
  })

  it('envia o laudo como PDF (enviar_laudo) e nunca manda link', OPTS, async () => {
    const c = novaConversa()
    await c.enviar('oi, queria receber o laudo do meu pet Rex')
    // Segunda rodada para confirmar, caso ele tenha perguntado qual laudo.
    if (!c.nomes().includes('enviar_laudo')) {
      await c.enviar('isso, pode enviar esse mesmo')
    }

    expect(c.nomes()).toContain('listar_laudos')
    expect(c.nomes()).toContain('enviar_laudo')
    expect(c.textos()).not.toContain('http')
  })

  it('em sintoma CRÍTICO, orienta procurar atendimento urgente (texto obrigatório)', OPTS, async () => {
    const c = novaConversa()
    await c.enviar('socorro, meu cachorro foi atropelado e está sangrando muito!')

    // O essencial: a orientação de buscar atendimento urgente DEVE vir no texto.
    const t = c.textos()
    expect(/vida animal|99999-0000|imediat|urg[êe]ncia|veterin|cl[íi]nica|emerg[êe]ncia/i.test(t)).toBe(true)
    // Não pode tratar emergência como agendamento.
    expect(c.nomes()).not.toContain('agendar')
  })

  it('encaminhamento com termos clínicos é pedido de agendamento (não aciona atendente)', OPTS, async () => {
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
  })

  it('sintoma COM veterinário já no caso: reage calmo, sem dramatizar em cadeia', OPTS, async () => {
    const c = novaConversa()
    await c.enviar(
      'meu cachorro comeu um osso e tá vomitando e com diarreia. o veterinário já viu ele e me deu ' +
        'um encaminhamento pra fazer ultrassom abdominal. queria marcar',
    )

    const t = c.textos()
    // Tom objetivo: nada de dramatização escalada (o vet já está no caso).
    expect(/risco de morte|perigo iminente|cada minuto|saia j[áa]|saia agora/i.test(t)).toBe(false)
    // Não sai agendando às cegas na primeira mensagem.
    expect(c.nomes()).not.toContain('agendar')
    // Engaja com o pedido (pergunta de contexto ou consulta preço), não só despeja emergência.
    expect(/\?/.test(t) || c.nomes().length > 0).toBe(true)
  })

  it('pergunta sobre exame não oferecido é respondida sem cadastrar o cliente', OPTS, async () => {
    const c = novaConversa()
    await c.enviar('oi, vocês fazem tomografia?')

    // Não pode tentar cadastrar/identificar só para responder uma dúvida.
    expect(c.nomes()).not.toContain('cadastrar_tutor')
    expect(c.nomes()).not.toContain('cadastrar_pet')
    // Deve consultar a lista de exames para responder.
    expect(c.nomes()).toContain('consultar_precos')
  })

  it('mencionar "Dra Luciana" ao agendar NÃO transfere para humano (segue agendando)', OPTS, async () => {
    const c = novaConversa()
    await c.enviar('oi, queria agendar uma ultra com a Dra Luciana para o Rex')

    expect(c.nomes()).not.toContain('transferir_humano')
    expect(c.nomes().length).toBeGreaterThan(0) // seguiu o fluxo (identificar/etc.)
  })

  it('sub-exame de bioquímica (TGO) encaminha cedo, sem pedir data/hora nem agendar', OPTS, async () => {
    const c = novaConversa()
    await c.enviar('oi, quero agendar TGO (AST) para a Cacau')
    // Se não encaminhou de cara, dá uma 2ª chance (variação do modelo).
    if (!c.nomes().includes('transferir_humano')) await c.enviar('é a Cacau mesmo')

    expect(c.nomes()).toContain('transferir_humano')
    expect(c.nomes()).not.toContain('agendar')
    // Não deve ter ido atrás de horário antes de encaminhar.
    expect(c.nomes()).not.toContain('horarios_livres')
  })

  it('aceita agendamento em fim de semana (não recusa por ser sábado/domingo)', OPTS, async () => {
    const c = novaConversa()
    await c.enviar('queria marcar um ultrassom abdominal pro Rex no próximo sábado de manhã')

    // Não deve travar/recusar: ou seguiu o fluxo (horários/preços) ou pediu mais
    // dados — o que importa é NÃO ter recusado por ser fim de semana.
    const recusou = /n[ãa]o atendemos|somente de segunda|apenas.*segunda a sexta|n[ãa]o funcionamos/i.test(
      c.textos(),
    )
    expect(recusou).toBe(false)
  })

  it('preço do cartão: informa o TOTAL (em até 3x sem juros), sem multiplicar por 3', OPTS, async () => {
    const c = novaConversa()
    await c.enviar('quanto custa o ultrassom abdominal no cartão?')

    const t = c.textos()
    // Chamou a tool de preços (não inventou).
    expect(c.nomes()).toContain('consultar_precos')
    // Informou o valor TOTAL correto do cartão (200), não o triplo (600).
    expect(t).toContain('200')
    expect(t).not.toMatch(/600|r\$\s?600/)
    // Deixou claro que é parcelável em até 3x sem juros.
    expect(/sem juros/i.test(t)).toBe(true)
    expect(/3x|3 vezes|at[ée] 3/i.test(t)).toBe(true)
  })
})
