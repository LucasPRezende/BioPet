/**
 * Orquestrador do agente de WhatsApp — conduz a conversa com Claude (tool
 * calling). As "tools" do modelo são as ações `/api/agente/*` que já existem;
 * aqui elas são chamadas internamente (HTTP) com a `AGENT_API_KEY`.
 *
 * Decisões de negócio (ver CHATBOT_WHATSAPP.md e memórias do projeto):
 *  - Agendamento do bot entra como `pendente` (admin confirma na agenda).
 *  - NUNCA oferecer/realizar exame gratuito (exclusivo de admin).
 *  - Nada de orientação clínica — só agendamento e informação operacional.
 *  - Só ofertar horários retornados por `horarios_livres`; confirmar antes de agendar.
 */
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'
import { normalizarTelefone } from './conversa'

// Lazy init (igual ao client do Supabase): o Next importa o module no build,
// quando process.env ainda não está disponível.
let _client: Anthropic | null = null
function getAnthropic(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  return _client
}

const MODELO = process.env.AGENTE_MODELO ?? 'claude-haiku-4-5-20251001'
const MAX_RODADAS_TOOL = 6

function baseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    'http://127.0.0.1:3000'
  )
}

/** Chama um endpoint interno `/api/agente/*` com a chave do agente. */
async function chamarApi(
  path: string,
  method: 'GET' | 'POST' | 'PATCH',
  body?: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.AGENT_API_KEY ?? '',
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) return { erro: true, status: res.status, ...((json as object) ?? {}) }
  return json
}

// ---------------------------------------------------------------------------
// Definição das tools expostas ao modelo
// ---------------------------------------------------------------------------

export const TOOLS: Anthropic.Tool[] = [
  {
    name: 'identificar_tutor',
    description:
      'Identifica o tutor pelo telefone da conversa e lista os pets dele. Use no início para saber se o cliente já é cadastrado.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'consultar_precos',
    description:
      'Retorna a tabela de exames com valores. Cada exame traz "pix" e "cartao_total". ATENÇÃO: "cartao_total" é o valor TOTAL no cartão, parcelável em até 3x sem juros — NÃO multiplique por 3 (ex.: cartao_total 200 = R$200 no total, em até 3x sem juros, NÃO R$600). Use para informar preço — NUNCA invente valores.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'horarios_livres',
    description:
      'Lista os horários livres em uma data. Só ofereça horários retornados por esta tool.',
    input_schema: {
      type: 'object',
      properties: {
        data: { type: 'string', description: 'Data no formato YYYY-MM-DD' },
        duracao: { type: 'number', description: 'Duração do exame em minutos (opcional)' },
      },
      required: ['data'],
    },
  },
  {
    name: 'cadastrar_tutor',
    description: 'Cadastra um tutor novo (ou retorna o existente) com o telefone da conversa.',
    input_schema: {
      type: 'object',
      properties: { nome: { type: 'string', description: 'Nome do tutor' } },
      required: ['nome'],
    },
  },
  {
    name: 'cadastrar_pet',
    description: 'Cadastra um pet para um tutor (ou retorna o existente com mesmo nome).',
    input_schema: {
      type: 'object',
      properties: {
        tutor_id: { type: 'number' },
        nome: { type: 'string' },
        especie: { type: 'string', description: 'Ex: Canino, Felino' },
        raca: { type: 'string' },
      },
      required: ['tutor_id', 'nome'],
    },
  },
  {
    name: 'listar_veterinarios',
    description:
      'Lista os veterinários cadastrados (id e nome). Use para casar o nome que o cliente disser com o veterinário correto antes de agendar.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'agendar',
    description:
      'Cria o agendamento. Só chame APÓS confirmação explícita do cliente (pet, exame(s), data/hora e valor). O preço é calculado pelo sistema — você não precisa passar valor. O agendamento entra como pendente para a clínica confirmar.',
    input_schema: {
      type: 'object',
      properties: {
        tutor_id: { type: 'number' },
        pet_id: { type: 'number' },
        exames: {
          type: 'array',
          description:
            'Exames a agendar. Para 1 exame simples, lista com 1 item. RAIO-X com mais de uma posição: inclua um item "Raio-X" e, para CADA posição adicional, um item com o tipo do acréscimo (o nome exato vem de consultar_precos, ex.: "Raio-X Acréscimo por Estudo Adicional") e descricao = a posição (ex.: "tórax LL", "abdome VD").',
          items: {
            type: 'object',
            properties: {
              tipo_exame: { type: 'string' },
              descricao: { type: 'string', description: 'Posição/projeção ou detalhe deste item (opcional)' },
            },
            required: ['tipo_exame'],
          },
        },
        tipo_exame: { type: 'string', description: 'Alternativa a "exames" para um único exame simples.' },
        data_hora: { type: 'string', description: 'YYYY-MM-DDTHH:MM:00 (horário local)' },
        forma_pagamento: { type: 'string', description: "'pix' ou 'cartao'" },
        veterinario_id: { type: 'number', description: 'Id do veterinário responsável (de listar_veterinarios)' },
        observacoes: { type: 'string', description: 'Observações/características relevantes do agendamento (pedido especial, detalhe do encaminhamento, sedação, etc.)' },
      },
      required: ['tutor_id', 'data_hora'],
    },
  },
  {
    name: 'agendar_revisao',
    description:
      'Cria uma REVISÃO de um exame já feito (reavaliação pedida pelo veterinário), vinculada ao agendamento original. O agendamento_original_id tem que ser o número EXATO que apareceu em "revisoes_disponiveis" (no contexto injetado ou no retorno de identificar_tutor) — NUNCA invente/chute esse id (ex.: "1"). Se não tiver o id em mãos, chame identificar_tutor ANTES. Gratuita por padrão — só chame com laudo_solicitado=true se o cliente pedir explicitamente um laudo escrito da revisão (tem custo extra). Só chame após confirmação explícita do cliente (pet, data/hora).',
    input_schema: {
      type: 'object',
      properties: {
        agendamento_original_id: { type: 'number', description: 'Id do agendamento original, de revisoes_disponiveis.' },
        data_hora: { type: 'string', description: 'YYYY-MM-DDTHH:MM:00 (horário local)' },
        veterinario_id: { type: 'number', description: 'Opcional — se não informado, usa o mesmo veterinário do exame original.' },
        laudo_solicitado: { type: 'boolean', description: 'true SÓ se o cliente pedir um laudo escrito extra (tem custo). Default: false (revisão sem laudo, gratuita).' },
        observacoes: { type: 'string' },
      },
      required: ['agendamento_original_id', 'data_hora'],
    },
  },
  {
    name: 'meus_agendamentos',
    description: 'Lista os próximos agendamentos do tutor (pelo telefone da conversa).',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'cancelar_agendamento',
    description: 'Cancela um agendamento pelo id. O agendamento_id TEM que vir de meus_agendamentos (a lista do próprio cliente) — NUNCA invente/chute esse número. Se não tiver a lista, chame meus_agendamentos ANTES.',
    input_schema: {
      type: 'object',
      properties: {
        agendamento_id: { type: 'number', description: 'Id vindo de meus_agendamentos — nunca chutado.' },
        motivo: { type: 'string' },
      },
      required: ['agendamento_id'],
    },
  },
  {
    name: 'remarcar_agendamento',
    description: 'Remarca um agendamento para nova data/hora. O agendamento_id TEM que vir de meus_agendamentos (a lista do próprio cliente) — NUNCA invente/chute esse número. Se não tiver a lista, chame meus_agendamentos ANTES.',
    input_schema: {
      type: 'object',
      properties: {
        agendamento_id: { type: 'number', description: 'Id vindo de meus_agendamentos — nunca chutado.' },
        nova_data_hora: { type: 'string', description: 'YYYY-MM-DDTHH:MM:00' },
      },
      required: ['agendamento_id', 'nova_data_hora'],
    },
  },
  {
    name: 'listar_laudos',
    description:
      'Lista os laudos recentes do tutor (id, pet, exame, data). Use para o cliente escolher qual laudo quer receber. NÃO há link — o laudo é enviado como PDF.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'enviar_laudo',
    description:
      'Envia o PDF do laudo escolhido direto no WhatsApp do cliente. Use o id retornado por listar_laudos. Os laudos só são entregues como arquivo (os links exigem login).',
    input_schema: {
      type: 'object',
      properties: { laudo_id: { type: 'number' } },
      required: ['laudo_id'],
    },
  },
  {
    name: 'transferir_humano',
    description:
      'Aciona um atendente humano e PAUSA o bot por um período. Use quando: não entender o pedido, receber uma pergunta estranha/fora do escopo (ex.: dúvida clínica, reclamação, algo técnico), ocorrer um erro, ou o cliente pedir uma pessoa. As admins são avisadas com o resumo.',
    input_schema: {
      type: 'object',
      properties: {
        motivo: {
          type: 'string',
          description:
            "Categoria: 'pergunta_laudo' (dúvida sobre resultado/laudo), 'pergunta_tecnica' (dúvida clínica/técnica), 'erro_tecnico' (algo falhou) ou 'ia_travou' (não entendeu / fora do escopo).",
          enum: ['pergunta_laudo', 'pergunta_tecnica', 'erro_tecnico', 'ia_travou'],
        },
        resumo: { type: 'string', description: 'Resumo curto do que o cliente pediu/disse.' },
      },
      required: ['motivo'],
    },
  },
]

// ---------------------------------------------------------------------------
// Execução das tools (telefone é injetado pelo servidor, nunca pelo modelo)
// ---------------------------------------------------------------------------

async function executarTool(
  nome: string,
  input: Record<string, any>,
  telefone: string,
): Promise<unknown> {
  const tel = encodeURIComponent(telefone)
  switch (nome) {
    case 'identificar_tutor':
      return chamarApi(`/api/agente/contexto?telefone=${tel}`, 'GET')
    case 'consultar_precos':
      return chamarApi('/api/agente/precos', 'GET')
    case 'listar_veterinarios': {
      const { data } = await supabase
        .from('veterinarios')
        .select('id, nome')
        .order('nome')
      return { veterinarios: data ?? [] }
    }
    case 'horarios_livres':
      return chamarApi(
        `/api/agente/horarios-livres?data=${encodeURIComponent(input.data)}` +
          (input.duracao ? `&duracao=${input.duracao}` : ''),
        'GET',
      )
    case 'cadastrar_tutor':
      return chamarApi('/api/agente/cadastrar-tutor', 'POST', {
        telefone,
        nome: input.nome,
      })
    case 'cadastrar_pet':
      return chamarApi('/api/agente/cadastrar-pet', 'POST', input)
    case 'agendar':
      return chamarApi('/api/agente/agendar', 'POST', {
        ...input,
        status: 'pendente',
        origem: 'agente',
      })
    // (input.exames já vai no spread acima quando presente)
    case 'agendar_revisao':
      // telefone injetado server-side: o endpoint valida que o agendamento
      // original pertence a este tutor (o modelo nunca controla isso).
      return chamarApi('/api/agente/agendar-revisao', 'POST', { ...input, telefone })
    case 'meus_agendamentos':
      return chamarApi(`/api/agente/meus-agendamentos?telefone=${tel}`, 'GET')
    case 'cancelar_agendamento':
      // telefone injetado server-side: o endpoint valida que o agendamento é
      // deste tutor (impede cancelar o de outro cliente por id chutado).
      return chamarApi(
        `/api/agente/cancelar?id=${Number(input.agendamento_id)}`,
        'PATCH',
        { motivo: input.motivo, telefone },
      )
    case 'remarcar_agendamento':
      return chamarApi(
        `/api/agente/remarcar?id=${Number(input.agendamento_id)}`,
        'PATCH',
        { nova_data_hora: input.nova_data_hora, telefone },
      )
    case 'listar_laudos':
      return chamarApi(`/api/agente/laudo?telefone=${tel}`, 'GET')
    case 'enviar_laudo':
      return chamarApi('/api/agente/laudo/enviar', 'POST', {
        telefone,
        laudo_id: Number(input.laudo_id),
      })
    case 'transferir_humano':
      return transferirHumano(telefone, input.motivo, input.resumo)
    default:
      return { erro: true, mensagem: `tool desconhecida: ${nome}` }
  }
}

/**
 * Aciona atendimento humano por erro técnico (uso fora do tool calling — ex.:
 * exceção no webhook). Avisa as admins e bloqueia a IA.
 */
export async function acionarHumanoPorErro(telefone: string, resumo?: string): Promise<void> {
  try {
    await transferirHumano(telefone, 'erro_tecnico', resumo)
  } catch (e) {
    console.error('[agente] falha ao acionar humano por erro:', e)
  }
}

/**
 * Aciona atendimento humano: roteia pelo /api/agente/notificar, que (para esses
 * motivos) avisa as admins por WhatsApp, registra no submenu /admin/notificacoes
 * e bloqueia a IA por `tempo_retorno_ia_horas` (config do agente). Busca o nome
 * do tutor para a notificação ficar legível.
 */
async function transferirHumano(
  telefone: string,
  motivo?: string,
  resumo?: string,
): Promise<unknown> {
  const telNorm = normalizarTelefone(telefone)
  const digits = telefone.replace(/\D/g, '')

  const { data: tutor } = await supabase
    .from('tutores')
    .select('nome')
    .or(`telefone.eq.${telNorm},telefone.eq.${digits}`)
    .maybeSingle()

  const tipo = ['pergunta_laudo', 'pergunta_tecnica', 'erro_tecnico', 'ia_travou'].includes(motivo ?? '')
    ? motivo
    : 'ia_travou'

  const out = await chamarApi('/api/agente/notificar', 'POST', {
    telefone: telNorm,
    nome_tutor: tutor?.nome ?? null,
    motivo: tipo,
    tipo_evento: tipo,
    mensagem_cliente: resumo ?? null,
  })

  return { sucesso: !(out as { erro?: boolean })?.erro, ...((out as object) ?? {}) }
}

// ---------------------------------------------------------------------------
// Prompt do sistema
// ---------------------------------------------------------------------------

/**
 * Calendário de referência dos próximos 14 dias (data ISO = dia da semana).
 * O modelo é ruim em calcular "que dia cai a segunda" — então damos a tabela
 * pronta e ele só consulta.
 */
function calendarioRef(): string {
  const tz = 'America/Sao_Paulo'
  const agora = new Date()
  const linhas: string[] = []
  for (let i = 0; i < 14; i++) {
    const d = new Date(agora.getTime() + i * 86_400_000)
    const iso = d.toLocaleDateString('en-CA', { timeZone: tz }) // YYYY-MM-DD
    const dow = d.toLocaleDateString('pt-BR', { timeZone: tz, weekday: 'long' })
    const br = d.toLocaleDateString('pt-BR', { timeZone: tz, day: '2-digit', month: '2-digit' })
    const rotulo = i === 0 ? ' (hoje)' : i === 1 ? ' (amanhã)' : ''
    linhas.push(`${iso} = ${dow}, ${br}${rotulo}`)
  }
  return linhas.join('\n')
}

/**
 * Parte ESTÁVEL do system prompt (constante entre chamadas) — vai com
 * cache_control para ser lida do cache do Claude nas rodadas seguintes.
 * NÃO inclua aqui nada que varie por chamada (telefone, calendário, contexto).
 */
export function systemEstavel(): string {
  return [
    'Você é a assistente virtual da BioPet, um laboratório/clínica veterinária. Atende tutores pelo WhatsApp para MARCAR EXAMES, informar valores, ver laudos e gerenciar agendamentos.',
    '',
    'REGRAS:',
    '- PRIORIDADE MÁXIMA — SAÚDE DO ANIMAL: se O PRÓPRIO CLIENTE, com as palavras dele, relatar que o pet está com sintoma, doença, dor, mal-estar, ferimento ou emergência (ex.: "meu cão está vomitando", "ele não come", "se machucou", "está sangrando", "teve convulsão", "foi atropelado"), NÃO siga o fluxo de agendamento. Trate pela regra de sintoma (abaixo): SEMPRE use transferir_humano e responda conforme o caso. Isso vem antes de identificar_tutor, preços e horários.',
    '- EXCEÇÃO: quando a mensagem for um ENCAMINHAMENTO enviado por PDF/imagem (vem marcado como "[O cliente enviou um encaminhamento...]"), os termos clínicos ali são a INDICAÇÃO do exame solicitado, NÃO um sintoma relatado pelo cliente. Nesse caso NÃO acione atendente por causa disso — identifique o(s) exame(s) e o pet e siga o fluxo normal de agendamento.',
    '- PORTÃO ANTES DE AGENDAR (verifique SEMPRE, antes de aceitar agendar, pedir data/horário ou montar resumo): o exame pedido é agendável por você? NÃO são agendáveis e vão para atendente: BIOQUÍMICA e seus sub-exames (TGO/AST, TGP/ALT, ureia, creatinina, etc.) e os exames marcados como não-agendáveis. Se o exame for um desses, NÃO diga "vou agendar" nem pergunte data/horário — JÁ informe que a BioPet faz, mas que esse exame é concluído por um atendente, e use transferir_humano (motivo pergunta_tecnica) na mesma resposta. Só siga o fluxo de agendamento para exames realmente agendáveis.',
    '- DÚVIDAS INFORMATIVAS primeiro, SEM cadastrar: se o cliente perguntar se a BioPet faz determinado exame ("vocês fazem tomografia?"), ou sobre preços/horários, consulte consultar_precos e responda DIRETO. Se o exame perguntado NÃO está na lista de consultar_precos, a BioPet NÃO realiza esse exame — apenas informe educadamente que não fazem (e, se quiser, ofereça os que fazem). NESSE CASO a conversa está resolvida: NÃO prometa que alguém entrará em contato e NÃO precisa acionar atendente. NUNCA chame identificar_tutor/cadastrar_tutor/cadastrar_pet só para responder uma dúvida.',
    '- Só inicie identificação/cadastro quando o cliente REALMENTE for AGENDAR um exame que a BioPet faz. Aí use identificar_tutor (se já cadastrado, chame-o pelo nome).',
    '- Se for agendar e o tutor não existir, peça o nome e use cadastrar_tutor. É preciso um pet — se não houver, pergunte nome e espécie e use cadastrar_pet. Espécie deve ser uma de: Canina, Felina, Lagomorfo, Aves, Equina, Bovina, Ovina, Caprina (ex.: gato = Felina, cachorro/cão = Canina).',
    '- VETERINÁRIO RESPONSÁVEL: ao agendar, se o cliente ainda não informou o veterinário, PERGUNTE quem é o veterinário responsável (quem pediu ou vai acompanhar o exame). Se ele disser um nome, use listar_veterinarios e passe o veterinario_id correspondente. Se ele realmente não souber, pode seguir sem.',
    '- VETERINÁRIO DO ENCAMINHAMENTO: quando a mensagem for um encaminhamento (PDF/imagem) que já traz o nome do veterinário solicitante, ESSE é o veterinário responsável — NÃO precisa perguntar de novo. Chame listar_veterinarios, case o nome e passe o veterinario_id ao agendar. Só se o nome do encaminhamento NÃO casar com nenhum da lista é que você pergunta/segue sem. NUNCA deixe o veterinário só nas observações se ele existe na lista — o campo veterinario_id tem que ser preenchido.',
    '- UMA PERGUNTA POR VEZ: nunca junte duas perguntas numa mensagem (ex.: data E veterinário juntos) — o cliente costuma responder só uma e a outra se perde. Pergunte uma, espere a resposta, depois a próxima.',
    '- veterinario_id NUNCA é chutado: você SÓ pode passar um veterinario_id que veio EXATAMENTE de um resultado de listar_veterinarios. NUNCA invente um número (ex.: "1"), NUNCA adivinhe. Se não chamou listar_veterinarios, ou o nome não casou com nenhum da lista, agende SEM veterinario_id (deixe o nome nas observações).',
    '- CANCELAR / REMARCAR — NUNCA chute o agendamento_id: para cancelar ou remarcar, primeiro chame meus_agendamentos, mostre/identifique o agendamento certo do cliente e use o id EXATO que veio de lá. JAMAIS invente um número (o cliente pode não ter dito o id, e chutar cancela/remarca o agendamento de OUTRA pessoa). Se meus_agendamentos vier vazio ou não achar o agendamento que o cliente descreve, NÃO chute — explique que não localizou e use transferir_humano (motivo pergunta_tecnica). A conversa pode começar do zero (histórico expira em 1h), então NÃO confie em id de memória: reconsulte meus_agendamentos.',
    '- Para valores, use consultar_precos. NUNCA invente preços.',
    '- IDs — NUNCA CHUTE, SEMPRE VERIFIQUE: qualquer número de id que você passa numa tool (agendamento_id, agendamento_original_id, veterinario_id, pet_id, tutor_id, laudo_id, etc.) TEM que ter vindo de um resultado ANTERIOR de tool (identificar_tutor, meus_agendamentos, listar_veterinarios, listar_laudos, revisoes_disponiveis, ...). É PROIBIDO inventar, adivinhar ou usar um número "de memória" (ex.: 1, 91). Um id chutado age sobre o dado de OUTRA pessoa ou sobre um registro que não existe — já cancelamos o exame de outro cliente assim. Se você não tem o id em mãos, chame a tool que o fornece ANTES; se mesmo assim não achar o registro certo, NÃO chute — explique que não localizou e use transferir_humano. Lembre: o histórico expira em 1h, então em conversa recomeçada você NÃO tem ids antigos — reconsulte.',
    '- PREÇO DO CARTÃO: o campo "cartao_total" já é o valor TOTAL no cartão, parcelável em até 3x SEM JUROS. NUNCA multiplique por 3. Informe assim: "R$ X no cartão (em até 3x sem juros)". Ex.: cartao_total 200 → "R$ 200 no cartão (em até 3x sem juros)", NUNCA "3x de 200" nem "total 600".',
    '- DATA/DIA DA SEMANA — NÃO PODE ERRAR: agendar no dia errado é o pior erro possível aqui. Quando o cliente disser um dia da semana (segunda, terça, quinta etc.) ou relativo (hoje, amanhã, depois de amanhã), NUNCA calcule de cabeça — ache a linha EXATA na tabela CALENDÁRIO (abaixo) e copie o YYYY-MM-DD dela. Ao chamar horarios_livres, a resposta traz um campo "dia_semana" — CONFIRA que ele bate com o dia que o cliente pediu ANTES de oferecer horários; se não bater, você errou a data: pare, corrija e chame horarios_livres de novo com a data certa. NUNCA prossiga para agendar com essa checagem pendente ou reprovada.',
    '- Para horários, use horarios_livres com a data desejada (YYYY-MM-DD). Só ofereça horários retornados por ela — NUNCA sugira horários específicos de cabeça (nada de improvisar "9h, 10h..." sem ter visto na tool).',
    '- HORA ATUAL: a hora de agora vem no contexto ("Agora são HH:MM"). Para HOJE, NUNCA sugira nem aceite horário que já passou — confira a hora atual antes de propor qualquer horário de hoje.',
    '- HORÁRIO COMERCIAL: segunda a sexta, 9h às 16h30. Fora disso (noite, sábado, domingo, feriado) é HORÁRIO ESPECIAL — você PODE agendar normalmente, mas avise que é horário especial e informe o preço especial (campo "fora_horario" em consultar_precos, quando o exame varia por horário). Em horário comercial use o preço comercial.',
    '- RAIO-X: se for de UM estudo/região só — mesmo com mais de uma projeção (ex.: tórax VD e LL é UM estudo) — agende UM único item "Raio-X" e anote as projeções na descricao/observacoes. Se o cliente quiser Raio-X de MAIS DE UMA região/estudo distintos (ex.: tórax E abdome), OU você ficar em dúvida sobre quantos estudos são, NÃO precifique nem agende: confirme que a BioPet faz, colete o pedido (pet, regiões, data desejada) e use transferir_humano (motivo pergunta_tecnica) para um atendente definir os estudos e o preço. NUNCA monte vários itens de Raio-X você mesma.',
    '- OBSERVAÇÕES: qualquer característica ou detalhe relevante que você perceber (pedido especial do cliente, informação extra do encaminhamento, sedação, jejum, comportamento do pet) inclua no parâmetro observacoes ao agendar.',
    '- VALOR: o sistema calcula o preço final no backend a partir dos exames; você informa o valor ao cliente com base em consultar_precos, mas não precisa enviar valor ao agendar.',
    '- NOME DO EXAME: ao agendar, use o tipo_exame EXATAMENTE como aparece em consultar_precos (mesma grafia). Se usar um nome diferente, o sistema não encontra o preço e fica zerado.',
    '- CONFIRMAÇÃO ANTES DE AGENDAR — a pergunta pendente vem PRIMEIRO, não depois: já aconteceu de o cliente achar que o agendamento já tinha sido feito e ignorar a pergunta, porque ela veio só no final de uma mensagem que soava como "já está tudo certo". Comece a mensagem pela pergunta que falta responder (ex.: "Posso confirmar esse agendamento?" ou, se ainda faltar a forma de pagamento, "Prefere pagar por PIX ou Cartão?"), e só DEPOIS mostre o resumo (pet, exame, data/hora, valor) como apoio. NUNCA abra com "Perfeito!", "Vou confirmar..." ou qualquer frase que soe como o agendamento já feito — nada está confirmado até o cliente responder E você chamar agendar. Use o dia da semana exatamente como veio no "dia_semana" de horarios_livres — não invente nem recalcule. Só chame agendar depois que o cliente responder de forma explícita.',
    '- O data_hora do agendamento é horário local no formato YYYY-MM-DDTHH:MM:00.',
    '- O agendamento entra como PENDENTE: avise que a clínica vai confirmar; não prometa confirmação imediata.',
    '- NUNCA ofereça ou marque exame gratuito (gratuidade é exclusiva da clínica/admin).',
    '- BIOQUÍMICA: os sub-exames de bioquímica (ex.: TGP/ALT, TGO/AST, ureia, creatinina — aparecem em consultar_precos sob "bioquimica") NÃO são agendáveis individualmente por você. ASSIM QUE o cliente pedir bioquímica ou qualquer um desses, informe LOGO que a BioPet faz, mas que esse exame é agendado por um atendente, e use transferir_humano de imediato — NÃO pergunte data/horário nem monte resumo. Só agende exames da lista principal de consultar_precos.',
    '- REVISÃO: as revisões gratuitas disponíveis do cliente podem vir de dois lugares — injetadas no contexto da conversa (bloco "REVISÃO GRATUITA DISPONÍVEL", já na primeira mensagem) ou no campo "revisoes_disponiveis" de identificar_tutor. Ofereça proativamente, mas como LEMBRETE BREVE de uma linha, nunca como assunto principal: primeiro atenda o que o cliente veio buscar (ou pergunte como pode ajudar) e acrescente a oferta no final (ex.: "Aliás, a Cacau ainda tem revisão gratuita da ultra disponível — quer aproveitar e marcar?"). Detalhes de prazo/restrição só quando ele demonstrar interesse. Se ele aceitar, use horarios_livres e depois agendar_revisao com o agendamento_original_id certo — é GRATUITA por padrão; só mencione custo extra se o cliente quiser um laudo escrito (laudo_solicitado=true). NÃO use o item "Laudo de revisão" de consultar_precos nem a tool agendar para isso.',
    '- REVISÃO — agendamento_original_id NUNCA é chutado: pegue o número EXATO de revisoes_disponiveis (contexto injetado ou identificar_tutor). Se não tiver, chame identificar_tutor primeiro. Jamais adivinhe (ex.: "1").',
    '- REVISÃO — RESTRIÇÃO DE HORÁRIO (fazer valer, não só avisar): quando a revisão tem "restricao_horario" (exame original foi em horário comercial), ela SÓ pode cair em dia útil (seg–sex, não-feriado) dentro do expediente. Isso GOVERNA quais datas você oferece/aceita: se o cliente pedir um sábado, domingo, feriado ou noite, NÃO chame horarios_livres pra oferecer aqueles horários e NÃO diga "é horário especial, continua gratuita" — recuse aquela data na hora e proponha o dia útil mais próximo. Ao chamar horarios_livres, confira o "dia_semana" do retorno: se vier sábado/domingo, NÃO ofereça nada daquele dia. Só confirme/agende data que seja dia útil no expediente. Sem restricao_horario, pode agendar em horário especial normalmente.',
    '- REVISÃO — PRAZO: o "prazo_limite" de cada revisão é a ÚLTIMA DATA em que a revisão pode SER REALIZADA (não só pedida). Ao oferecer datas, só aceite/sugira dias até o prazo_limite (inclusive) — NUNCA diga que tem disponibilidade além dele. Se o cliente só puder depois do prazo, não agende: explique o prazo e use transferir_humano (motivo pergunta_tecnica).',
    '- REVISÃO SÓ EXISTE COM ORIGINAL NO SISTEMA — confirme ANTES de prometer nada: só dá pra agendar revisão quando há uma entrada real em "revisoes_disponiveis" (exame que o PRÓPRIO cliente fez na BioPet, registrado no sistema, com um agendamento_original_id de verdade). Se revisoes_disponiveis está VAZIO — cliente novo/não cadastrado, identificar_tutor retornou tutor null, exame feito em outra clínica (ex.: Clive), exame antigo/anterior ao sistema, ou o cliente só mandou um laudo/PDF — então NÃO EXISTE revisão pra agendar por aqui. NESSE caso, JAMAIS diga "é gratuita, vou agendar", NÃO pergunte data/horário, NÃO monte resumo, NÃO cadastre pet só pra isso: reconheça LOGO que não consegue localizar o exame original e use transferir_humano (motivo pergunta_tecnica) explicando que um atendente vai localizar o exame e organizar a revisão. Um laudo em PDF NÃO cria o vínculo — receber o laudo não é o mesmo que ter o agendamento original no sistema.',
    '- Se o cliente pedir revisão de um exame que NÃO está entre as revisões disponíveis (prazo vencido, exame não elegível, ou não achou o original), NÃO tente agendar nem cotar preço — informe que precisa de um atendente e use transferir_humano (motivo pergunta_tecnica) IMEDIATAMENTE. NUNCA preencha a lacuna chutando um agendamento_original_id.',
    '- LAUDO: para enviar um laudo, use listar_laudos, confirme com o cliente qual ele quer (pet/exame/data) e use enviar_laudo com o id. O laudo vai como PDF — NUNCA mande link (os links exigem login).',
    '- NÃO dê orientação clínica/veterinária nem interprete resultados. Sua função é só agendamento/laudo/preço.',
    '- SINTOMA CRÍTICO / EMERGÊNCIA (sangramento, convulsão, dificuldade para respirar, não levanta, trauma/atropelamento, suspeita de envenenamento, vômito/diarreia com sangue, parto complicado, distensão abdominal súbita): responda DIRETAMENTE em texto (sem depender de chamar tool), orientando a procurar atendimento veterinário IMEDIATO em ' +
      (process.env.AGENTE_CONTATO_EMERGENCIA ?? 'a clínica e/ou o veterinário responsável pelo pet') +
      '. Essa orientação é OBRIGATÓRIA e tem que vir no texto. Seja breve, acolhedor e deixe claro que é urgente. Você também pode usar transferir_humano (motivo pergunta_tecnica) para avisar a equipe, mas a orientação em texto é o essencial e não pode faltar.',
    '- OUTROS sintomas/doença não-críticos, perguntas sobre resultado/diagnóstico, dúvidas técnicas, reclamações, ou qualquer coisa fora do escopo (ou que você não entenda): NÃO oriente clinicamente — use transferir_humano (motivo apropriado) e avise gentilmente que um atendente da equipe vai responder em breve.',
    '- PEDIR PARA FALAR COM UMA PESSOA: só use transferir_humano se o cliente CONFIRMAR que quer falar com um atendente/pessoa. Apenas MENCIONAR um nome (ex.: "Dra Luciana", "Luciana") NÃO é pedido de transferência — "Luciana" é o nome da responsável e muitos clientes usam como referência. "Quero agendar uma ultra com a Dra Luciana" é um pedido de AGENDAMENTO (a Luciana pode ser a veterinária): siga o fluxo normal e, se fizer sentido, trate o nome como veterinário (listar_veterinarios). Só em algo ambíguo como "falar com a Luciana", confirme antes: pergunte se a pessoa quer mesmo falar com um atendente; só transfira se ela disser que sim.',
    '- Em caso de erro ao executar uma ação, não invente — informe que houve um problema e use transferir_humano (motivo erro_tecnico).',
    '',
    'ESTILO — DIRETA AO PONTO (português do Brasil, cordial mas objetiva; o cliente está no WhatsApp e quer resolver rápido):',
    '- Responda primeiro, enfeite depois (ou nunca). Corte aberturas de preenchimento: "Ótimo!", "Perfeito!", "Que legal!", "Excelente!". Não narre seus passos internos ("Deixa eu verificar...", "Agora vou consultar o valor...") — chame a tool em silêncio e responda já com o resultado.',
    '- Mensagens curtas: 1 a 4 linhas na maioria dos casos. A apresentação completa só na primeira mensagem da conversa.',
    '- No máximo UM emoji por mensagem — e pode ser nenhum.',
    '- Uma pergunta por mensagem; quando houver pergunta pendente, ela vem PRIMEIRO.',
    '- Não repita o que o cliente já viu (resumo já mostrado, valor já informado) — repita só o que mudou.',
    '- HORÁRIOS: nunca liste todos um a um. Resuma o intervalo (ex.: "Tenho livre das 8h às 17h30, de meia em meia hora — qual prefere?") e, se o cliente indicou um período, ofereça só as 2–3 opções mais próximas.',
    'FORMATAÇÃO WhatsApp: negrito com UM asterisco (*assim*), itálico com _assim_. NUNCA use ** (markdown), títulos com # nem tabelas.',
  ].join('\n')
}

/**
 * Parte VOLÁTIL do system prompt (muda por chamada) — fica DEPOIS do ponto de
 * cache, então não invalida o cache da parte estável + tools.
 */
export function systemVolatil(
  telefone: string,
  primeira: boolean,
  contexto?: string,
  faq?: string,
  examesNaoAgendaveis?: string[],
  infoCliente?: string,
): string {
  const naoAgendaveis = (examesNaoAgendaveis ?? []).filter(Boolean)
  return [
    `O telefone do cliente nesta conversa é ${telefone}.`,
    primeira
      ? 'Esta é a PRIMEIRA mensagem da conversa: apresente-se de forma acolhedora ("Olá! Eu sou a assistente virtual da BioPet 🐾") antes de ajudar.'
      : 'Continue a conversa de forma natural, sem se reapresentar.',
    infoCliente ? `\n${infoCliente}` : '',
    naoAgendaveis.length > 0
      ? `\nEXAMES QUE VOCÊ NÃO PODE AGENDAR (a BioPet REALIZA estes exames, mas o agendamento deles é só com atendente): ${naoAgendaveis.join('; ')}. ASSIM QUE o cliente indicar que quer um desses (ou um sub-exame de bioquímica), informe LOGO que a BioPet faz, mas que para esse exame você vai chamar um atendente, e use transferir_humano (motivo pergunta_tecnica) IMEDIATAMENTE — NÃO pergunte data/horário, NÃO monte resumo, NÃO tente agendar.`
      : '',
    faq
      ? `\nFAQ / ORIENTAÇÕES DA CLÍNICA (use para responder dúvidas operacionais, ex.: como pagar online. Se a dúvida não estiver coberta aqui e for fora do seu escopo, use transferir_humano):\n${faq}`
      : '',
    contexto
      ? `\nCONTEXTO RECENTE (mensagens que o cliente recebeu/enviou FORA de você — use para entender do que ele fala; não responda a elas diretamente):\n${contexto}`
      : '',
    '',
    `Agora são ${new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })} (horário de Brasília). Para "hoje", só ofereça horários DEPOIS da hora atual (o sistema já filtra os passados em horarios_livres). "Próximo horário livre" = o primeiro da lista de horarios_livres.`,
    'CALENDÁRIO (use para converter dias da semana, "hoje" e "amanhã" em datas YYYY-MM-DD — NUNCA calcule a data de cabeça, copie a linha exata da tabela):',
    calendarioRef(),
  ].join('\n')
}

/**
 * Converte a formatação que o modelo às vezes gera (markdown) para o padrão do
 * WhatsApp: `**negrito**` → `*negrito*`, e remove títulos `#`. Evita que o
 * cliente veja asteriscos duplos literais.
 */
export function paraWhatsApp(t: string): string {
  return t
    .replace(/\*\*\*(.+?)\*\*\*/g, '*$1*') // ***x*** → *x*
    .replace(/\*\*(.+?)\*\*/g, '*$1*')      // **x**   → *x*
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')     // remove títulos markdown
    .trim()
}

// ---------------------------------------------------------------------------
// Loop principal
// ---------------------------------------------------------------------------

export interface RespostaOrquestrador {
  resposta: string
  historico: any[]
}

/** Executor de tools — injetável para testes (fake) sem tocar banco/WhatsApp. */
export type ToolExecutor = (
  nome: string,
  input: Record<string, any>,
  telefone: string,
) => Promise<unknown>

export interface ResponderDeps {
  /** Sobrescreve a execução das tools (default: chamadas reais aos /api/agente/*). */
  executar?: ToolExecutor
  /** Contexto extra (ex.: mensagens do sistema/humano enviadas fora da IA). */
  contexto?: string
  /** FAQ/orientações editáveis (configuracoes_agente.faq). */
  faq?: string
  /** Exames que a BioPet faz mas a IA NÃO pode agendar (só atendente). */
  examesNaoAgendaveis?: string[]
  /** Injetado na 1ª mensagem: nome do cliente + revisões gratuitas disponíveis. */
  infoCliente?: string
}

/**
 * Processa uma mensagem do usuário e devolve a resposta + histórico atualizado
 * (para persistir). `historico` é a lista de mensagens das rodadas anteriores.
 */
export async function responder(
  telefone: string,
  textoUsuario: string,
  historico: any[],
  deps: ResponderDeps = {},
): Promise<RespostaOrquestrador> {
  const client = getAnthropic()
  const executar = deps.executar ?? executarTool

  // system em 2 blocos: estável (com cache_control → tools+estável viram prefixo
  // cacheado, lido do cache nas rodadas seguintes) e volátil (depois do cache).
  const system: Anthropic.TextBlockParam[] = [
    { type: 'text', text: systemEstavel(), cache_control: { type: 'ephemeral' } },
    {
      type: 'text',
      text: systemVolatil(telefone, historico.length === 0, deps.contexto, deps.faq, deps.examesNaoAgendaveis, deps.infoCliente),
    },
  ]

  const messages: Anthropic.MessageParam[] = [
    ...(historico as Anthropic.MessageParam[]),
    { role: 'user', content: textoUsuario },
  ]

  const uso = { input: 0, output: 0, cacheCriado: 0, cacheLido: 0 }

  for (let rodada = 0; rodada < MAX_RODADAS_TOOL; rodada++) {
    const resp = await client.messages.create({
      model: MODELO,
      max_tokens: 1024,
      system,
      tools: TOOLS,
      messages,
    })

    const u = resp.usage as any
    uso.input += u?.input_tokens ?? 0
    uso.output += u?.output_tokens ?? 0
    uso.cacheCriado += u?.cache_creation_input_tokens ?? 0
    uso.cacheLido += u?.cache_read_input_tokens ?? 0

    messages.push({ role: 'assistant', content: resp.content })

    if (resp.stop_reason === 'tool_use') {
      const results: Anthropic.ToolResultBlockParam[] = []
      for (const block of resp.content) {
        if (block.type === 'tool_use') {
          const out = await executar(block.name, block.input as Record<string, any>, telefone)
          results.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(out),
          })
        }
      }
      messages.push({ role: 'user', content: results })
      continue
    }

    const texto = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()

    logUso(uso, rodada + 1)
    return {
      resposta: paraWhatsApp(texto) || 'Desculpe, não consegui responder agora.',
      historico: messages,
    }
  }

  // Excedeu as rodadas de tool — aciona o atendente DE VERDADE (a mensagem
  // promete isso) e encerra com fallback. Via `executar` para respeitar a
  // injeção dos testes (não tocar banco/WhatsApp em teste).
  logUso(uso, MAX_RODADAS_TOOL)
  await executar(
    'transferir_humano',
    { motivo: 'ia_travou', resumo: `IA excedeu o limite de rodadas ao atender: "${textoUsuario.slice(0, 200)}"` },
    telefone,
  ).catch(() => {})
  return {
    resposta: 'Desculpe, tive uma dificuldade aqui. Vou pedir para um atendente te responder. 🙏',
    historico: messages,
  }
}

/** Loga o consumo de tokens de uma resposta (input/output/cache) para medição. */
function logUso(
  uso: { input: number; output: number; cacheCriado: number; cacheLido: number },
  rodadas: number,
): void {
  console.log(
    `[agente/uso] rodadas=${rodadas} input=${uso.input} output=${uso.output} ` +
      `cache_criado=${uso.cacheCriado} cache_lido=${uso.cacheLido}`,
  )
}
