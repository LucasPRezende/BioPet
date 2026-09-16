import { describe, it, expect, beforeAll } from 'vitest'
import { novaConversa } from './harness'
import { responder } from '@/lib/agente/orquestrador'

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
  // Atualizado em 15/09/2026: horário especial não é mais agendado pela IA
  // (regra HORÁRIO ESPECIAL — PRECISA DE ATENDENTE), então o teste não espera
  // mais que ela cote R$240 e prossiga — o que importa é ela reconhecer que
  // 16:30 é especial (30min começando aí termina às 17h, passa do limite) e
  // NÃO tratar como comercial nem agendar direto.
  it('horário que começa em cima do limite comercial (16h30) mas termina depois: reconhece que é especial, não confunde com comercial', OPTS, async () => {
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
    // Reconhece que é especial/fora do comercial — não pode ter tratado como
    // se fosse um horário comercial normal.
    expect(t).toMatch(/especial|fora do (hor[áa]rio )?comercial/i)
    // Não fecha esse agendamento sozinha (precisa de atendente).
    expect(c.nomes()).not.toContain('agendar')
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
    // Tem que vir um aviso explícito de que falta a confirmação de verdade da BioPet.
    expect(t).toMatch(/ainda não é a confirmação|falta.{0,20}confirma|aguard.{0,20}confirma/i)
    // Nunca sugerir que já pode considerar certo / ir fazer o exame.
    expect(t).not.toMatch(/aproveite que (você )?já está/i)
  })

  // Casos reais (Arlene/Scott, Renato/Belinha, Júlia/Hope, Valeska/Jade): a IA
  // chutava um agendamento_original_id diferente do que já tinha recebido na
  // oferta proativa, tomava 404 do backend, e só então corrigia. O fake agora
  // espelha esse 404 pra id errado (harness.ts) — este teste garante que o
  // PRIMEIRO agendar_revisao já usa o id certo (901, da Fido, sem restrição).
  it('agendar_revisao usa o agendamento_original_id certo de primeira, sem chutar', OPTS, async () => {
    const c = novaConversa()
    await c.enviar('Oi, quero marcar a revisão gratuita do ultrassom do Fido pra quinta às 10h')
    for (let i = 0; i < 3 && !c.nomes().includes('agendar_revisao'); i++) {
      await c.enviar('Isso mesmo, pode confirmar quinta às 10h')
    }

    const chamadas = c.calls.filter((x) => x.nome === 'agendar_revisao')
    expect(chamadas.length).toBeGreaterThan(0)
    // Nenhuma tentativa pode ter tomado o 404 de "agendamento não encontrado".
    for (const ch of chamadas) {
      expect((ch.resultado as any)?.erro).not.toBe(true)
    }
  })

  // Caso real (Aline/Pérola, 09/09): cadastrar_tutor e cadastrar_pet foram
  // chamados no mesmo turno com um tutor_id chutado (2286) em vez do id real
  // que cadastrar_tutor ia devolver (368) — deu erro de FK. O fake agora
  // espelha esse erro pra tutor_id errado (harness.ts) — este teste garante
  // que cadastrar_pet usa o tutor_id real de cadastrar_tutor de primeira.
  it('cadastrar_pet usa o tutor_id real de cadastrar_tutor, sem chutar', OPTS, async () => {
    const c = novaConversa(responder, { novoCliente: true })
    await c.enviar('Oi, meu nome é Bianca, quero marcar um ultrassom abdominal pro meu cachorro Bidu')
    for (let i = 0; i < 6 && !c.nomes().includes('cadastrar_pet'); i++) {
      await c.enviar(
        'Pode marcar pra amanhã de manhã, qualquer horário. Pagamento no PIX, pode confirmar e cadastrar tudo.',
      )
    }

    const chamadas = c.calls.filter((x) => x.nome === 'cadastrar_pet')
    expect(chamadas.length).toBeGreaterThan(0)
    // Nenhuma tentativa pode ter tomado o erro de FK por tutor_id inventado.
    for (const ch of chamadas) {
      expect((ch.resultado as any)?.erro).not.toBe(true)
    }
  })

  // Pedido da Andreza/Luciana (14/09/2026): quando o cliente não especifica
  // manhã ou tarde, priorizar sutilmente sugerir manhã primeiro (sem recusar
  // tarde se ele pedir). A janela fake tem manhã (9h/9h30) e tarde (15h+).
  it('sugere horário sem preferência do cliente: prioriza manhã', OPTS, async () => {
    const c = novaConversa()
    await c.enviar(
      'Meu nome é Maria, quero marcar ultrassom abdominal do Rex na quinta-feira, pode sugerir um horário bom pra mim? Não tenho preferência.',
    )
    for (let i = 0; i < 3 && !c.nomes().includes('horarios_livres'); i++) {
      await c.enviar('Sou cliente sim. Pode sugerir você mesmo, qualquer horário serve.')
    }

    expect(c.nomes()).toContain('horarios_livres')
    const t = c.textos()
    const idxManha = t.search(/9h|09h|9:00|09:00/)
    const idxTarde = t.search(/15h|15:00/)
    // A opção de manhã tem que aparecer, e antes da de tarde (quando ambas aparecem).
    expect(idxManha).toBeGreaterThan(-1)
    if (idxTarde > -1) expect(idxManha).toBeLessThan(idxTarde)
  })

  // Caso real: perguntada de forma genérica "vocês atendem fim de semana?" (antes
  // de qualquer tentativa de marcar algo específico), a IA respondeu "não
  // atendemos aos sábados/domingos, só de segunda a sexta" — sem chamar NENHUMA
  // tool, pura invenção (confundiu "horário comercial" da precificação com
  // horário de funcionamento). A BioPet atende todo dia, só muda o preço.
  it('pergunta genérica sobre fim de semana: não inventa que não atende sábado/domingo', OPTS, async () => {
    const c = novaConversa()
    await c.enviar('Vocês atendem aos fins de semana? Queria marcar um ultrassom pro sábado')

    const t = c.textos()
    expect(t).not.toMatch(/n[ãa]o atendemos.{0,20}(s[áa]bado|domingo)|n[ãa]o temos atendimento.{0,20}(s[áa]bado|domingo)|s[óo] (atendemos|funcionamos|trabalhamos).{0,20}segunda a sexta/i)
  })

  // Caso real (Roselita, 04/09): Raio-X de coluna lombar/pelve/cauda (regiões
  // contíguas, ambíguo se conta como "uma região" ou "várias") — a IA cotou só
  // o preço base (R$230/250), sem avisar do possível acréscimo por estudo
  // adicional (R$150), e tentou chamar `agendar` (que sempre recusa Raio-X)
  // antes de escalar. Novo fluxo: para Raio-X, a IA nunca chama agendar — vai
  // direto para transferir_humano depois de coletar os dados, e a ressalva do
  // possível acréscimo de R$150 é SEMPRE incluída (não só quando parece
  // multi-região — essa divisão não é decisão dela, é do atendente).
  it('Raio-X: nunca chama agendar (vai direto pra atendente) e SEMPRE avisa do possível acréscimo de R$150', OPTS, async () => {
    const c = novaConversa()
    // Região única/ambígua de propósito (igual ao caso real) — a ressalva tem
    // que aparecer mesmo sem "duas regiões" explícitas no pedido.
    await c.enviar('Preciso agendar um raio-x de coluna pro Rex, ele está com dor')
    for (let i = 0; i < 6 && !c.nomes().includes('transferir_humano'); i++) {
      await c.enviar(
        'Pode ser quinta-feira às 9h, pagamento no PIX. Meu nome é Maria, o Rex é um cachorro SRD. Não sei o nome do veterinário.',
      )
    }

    expect(c.nomes()).not.toContain('agendar')
    expect(c.nomes()).toContain('transferir_humano')
    const t = c.textos()
    expect(t).toMatch(/150/)
  })

  // NOTA (histórico, pré-15/09/2026): existia uma contraparte natural do teste
  // acima — tutor com uma revisão SEM restricao_horario (ex.: exame original em
  // horário especial), que antes devia poder CONFIRMAR em horário especial
  // normalmente. Isso mudou: agora NENHUM horário especial é fechado pela IA
  // (regra HORÁRIO ESPECIAL — PRECISA DE ATENDENTE, pedido da Andreza/Luciana,
  // 15/09/2026) — restrito ou não, horário especial sempre vai pra atendente.
  // A observação de "contaminação de julgamento" (Rex+Fido com revisões
  // simultâneas) deixou de fazer sentido pra esse cenário específico, já que o
  // comportamento correto convergiu pros dois lados (nunca confirmar especial
  // sozinha) — mantido aqui só como referência histórica.

  // Pedido da Andreza/Luciana (15/09/2026): fim de semana/feriado/fora do
  // comercial "nem sempre a equipe está disponível" — a IA não fecha mais esse
  // agendamento sozinha (mesmo tratamento do Raio-X), mas continua coletando os
  // dados e cadastrando o cliente normalmente, só a marcação em si que espera
  // atendente. 17h já é "especial":true no fake (harness.ts).
  it('horário especial: cadastra o cliente normalmente, mas não agenda sozinha nem promete o horário', OPTS, async () => {
    const c = novaConversa(responder, { novoCliente: true })
    await c.enviar(
      'Meu nome é Bianca, quero marcar um ultrassom abdominal pro meu cachorro Bidu às 17h de quinta-feira, pagamento pix.',
    )
    for (let i = 0; i < 5 && !c.nomes().includes('transferir_humano'); i++) {
      await c.enviar(
        'Isso mesmo, 17h de quinta-feira, só posso nesse horário. Pagamento PIX. Pode cadastrar tudo e resolver.',
      )
    }

    // Cadastrou o cliente/pet normalmente...
    expect(c.nomes()).toContain('cadastrar_tutor')
    expect(c.nomes()).toContain('cadastrar_pet')
    // ...mas não fechou o agendamento sozinha — foi pra atendente.
    expect(c.nomes()).not.toContain('agendar')
    expect(c.nomes()).toContain('transferir_humano')
    // Nunca deu a entender que o horário já estava marcado/certo.
    const t = c.textos()
    expect(t).not.toMatch(/agendamento (solicitado|confirmado)/i)
  })

  // Mesma regra, lado revisão: Fido (horario_restrito=false) antes podia
  // confirmar horário especial normalmente; agora, mesmo sem restrição de
  // elegibilidade, a MARCAÇÃO em horário especial também precisa de atendente.
  it('revisão em horário especial (mesmo sem restrição de elegibilidade): não confirma sozinha, transfere pra atendente', OPTS, async () => {
    const c = novaConversa()
    await c.enviar('Oi, quero marcar a revisão gratuita do ultrassom do Fido às 17h de quinta-feira')
    for (let i = 0; i < 4 && !c.nomes().includes('transferir_humano'); i++) {
      await c.enviar('Isso mesmo, 17h de quinta, só posso nesse horário, pode resolver')
    }

    // Pode até tentar chamar a tool (o backend barra), mas nunca pode ter
    // conseguido uma revisão de verdade nesse horário.
    const chamadas = c.calls.filter((x) => x.nome === 'agendar_revisao')
    for (const ch of chamadas) expect((ch.resultado as any)?.erro).toBe(true)
    expect(c.nomes()).toContain('transferir_humano')
    const t = c.textos()
    expect(t).not.toMatch(/revis[ãa]o.*(confirmada|marcada|solicitada)|agendamento (solicitado|confirmado)/i)
  })
})
