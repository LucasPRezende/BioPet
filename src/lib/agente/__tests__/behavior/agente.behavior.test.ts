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

  // Caso real (Giovania, 14/08): pediu ultrassom abdominal (30min) às 16h30 de
  // segunda. 16h30 é exatamente o limite comercial — mas o exame TERMINA às 17h,
  // então é horário especial. A IA cotou o preço comercial (R$180) de cabeça,
  // ignorando o campo "especial": true que horarios_livres já devolvia para
  // aquele horário, e repetiu o valor errado até na confirmação final (mesmo
  // depois da tool agendar informar o valor certo). Corrigido tirando o
  // "horario_comercial": {inicio, fim} solto de horarios_livres e reforçando a
  // ressalva em consultar_precos (nota_horario_comercial) — sem tocar na lista
  // de regras do prompt.
  it('horário que começa em cima do limite comercial (16h30) mas termina depois: cota o preço de horário especial, não o comercial', OPTS, async () => {
    const c = novaConversa()
    await c.enviar(
      'oi, sou tutor do Rex, o veterinário pediu um ultrassom abdominal pra ele, dá pra marcar segunda às 16:30?',
    )
    // Se a 1ª mensagem só gerou uma pergunta de esclarecimento, reafirma o horário.
    if (!c.nomes().includes('horarios_livres')) {
      await c.enviar('isso, segunda-feira às 16:30 mesmo')
    }

    expect(c.nomes()).toContain('horarios_livres')
    const t = c.textos()
    // Preço de horário especial (fora do comercial): R$240 PIX / R$260 cartão.
    expect(t).toMatch(/240/)
    // Não pode ter ficado no preço comercial (R$180) pra esse horário.
    expect(t).not.toMatch(/\b180\b/)
  })

  // Controle do teste acima: um horário claramente dentro do comercial (15h,
  // termina às 15h30, bem antes do limite) tem que continuar cotando o preço
  // comercial normal — a correção não pode ter virado "sempre fora de horário".
  it('horário claramente dentro do comercial (15h): continua cotando o preço comercial normal', OPTS, async () => {
    const c = novaConversa()
    await c.enviar(
      'oi, sou tutor do Rex, o veterinário pediu um ultrassom abdominal pra ele, dá pra marcar segunda às 15:00?',
    )
    if (!c.nomes().includes('horarios_livres')) {
      await c.enviar('isso, segunda-feira às 15:00 mesmo')
    }

    expect(c.nomes()).toContain('horarios_livres')
    const t = c.textos()
    expect(t).toMatch(/180/)
    expect(t).not.toMatch(/\b240\b/)
  })

  // Caso real (Josiane, 24/08): revisão do Rex tem restricao_horario (exame
  // original em horário comercial). A cliente pediu "final da tarde", só
  // sobrou horário especial (17h/17h30) — a IA ofereceu e confirmou mesmo
  // assim, e pior: nunca chamou agendar_revisao, só disse "confirmado" de
  // graça (nada foi criado no banco). Corrigido reforçando duas coisas: (1)
  // revisão restrita descarta qualquer horário "especial":true, mesmo em dia
  // útil; (2) nunca declarar confirmado sem ter chamado a tool e visto sucesso.
  it('revisão restrita (exame original em horário comercial): não confirma em horário especial, e só confirma com tool_result de sucesso', OPTS, async () => {
    const c = novaConversa()
    await c.enviar(
      'Oi, o Rex já fez a ultrassom abdominal aqui e tem direito à revisão gratuita. Consegue marcar pra segunda às 17h?',
    )
    if (c.nomes().length === 0) {
      await c.enviar('É a revisão gratuita da ultrassom do Rex mesmo, quero marcar às 17h')
    }

    const chamadas = c.calls.filter((x) => x.nome === 'agendar_revisao')
    // Não pode ter chamado a tool com um horário fora do comercial (17h).
    for (const ch of chamadas) {
      const hora = String(ch.input.data_hora ?? '').split('T')[1]?.slice(0, 5)
      expect(hora).not.toBe('17:00')
    }
    // Não pode ter dito "confirmado"/"marcado" sem uma chamada de SUCESSO à tool.
    const houveSucesso = chamadas.some((ch) => !(ch.resultado as any)?.erro)
    const alegouConfirmado = /confirmad[ao]|revis[ãa]o.*marcad[ao]|marquei a revis/i.test(c.textos())
    if (alegouConfirmado) expect(houveSucesso).toBe(true)
  })

  // Caso real (Nida Maria, 29/08): a IA abriu a mensagem final com "Agendamento
  // confirmado! ✅" — a cliente tratou como certo na hora e entrou na clínica
  // sem esperar a confirmação de verdade da BioPet, e reclamou de atraso quando
  // não foi atendida no horário. Corrigido: a mensagem de sucesso não pode mais
  // abrir com "confirmado" — só "solicitado"/"registrado", deixando claro que a
  // confirmação de verdade vem depois, numa mensagem separada da clínica.
  it('mensagem final de agendamento NÃO afirma "confirmado" — é só um pedido, a clínica confirma depois', OPTS, async () => {
    const c = novaConversa()
    // Rex tem revisão gratuita disponível pra ultrassom — a IA pode oferecer
    // esse caminho (agendar_revisao) em vez do agendamento pago (agendar).
    // Ambos são afetados pela mesma regra de não dizer "confirmado", então
    // aceitamos qualquer um dos dois nesse teste.
    await c.enviar('Quero marcar um ultrassom abdominal pro Rex, pode ser quinta-feira às 9h')
    for (let i = 0; i < 3 && !c.nomes().some((n) => n === 'agendar' || n === 'agendar_revisao'); i++) {
      await c.enviar('Sim, pode ser quinta-feira mesmo às 9h, pagamento no PIX, pode confirmar')
    }

    expect(c.nomes().some((n) => n === 'agendar' || n === 'agendar_revisao')).toBe(true)
    const t = c.textos()
    // Não pode abrir a mensagem de sucesso como se já estivesse garantido.
    expect(t).not.toMatch(/agendamento confirmado/i)
  })

  // NOTA: existe uma contraparte natural do teste acima — tutor com uma revisão
  // SEM restricao_horario (ex.: exame original em horário especial), que devia
  // poder confirmar em horário especial normalmente. Testado manualmente: quando
  // o mesmo tutor tem DUAS revisões simultâneas (uma restrita, outra não — caso
  // do harness com Rex+Fido), a IA às vezes "contamina" o julgamento e recusa
  // horário especial até pra quem tem direito. Ficou bem melhor depois do campo
  // booleano "horario_restrito" em revisoes_disponiveis, mas não 100% (~1/3 de
  // falha). Decisão (2026-08-24): aceitar como limitação conhecida — é o sentido
  // OPOSTO do bug original (recusa horário válido, não confirma nada errado; sem
  // risco de dado incorreto), e não vale o custo de mais rodadas de ajuste agora.
  // Sem teste automatizado pra não ficar "falhando" pra sempre na suíte.
})
