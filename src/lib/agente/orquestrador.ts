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
      'Lista os horários livres em uma data. Só ofereça horários retornados por esta tool. Cada horário já vem com "especial" (true/false, calculado no backend a partir de início+duração) — use esse campo pra saber se é horário especial, não calcule de cabeça.',
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
      'Cria o agendamento. Só chame APÓS confirmação explícita do cliente (pet, exame(s), data/hora e valor). O preço é calculado pelo sistema — você não precisa passar valor. O agendamento entra como pendente para a clínica confirmar. NÃO chame para Raio-X — esse exame sempre é recusado automaticamente e precisa ir direto pra transferir_humano.',
    input_schema: {
      type: 'object',
      properties: {
        tutor_id: { type: 'number' },
        pet_id: { type: 'number', description: 'Id real vindo de cadastrar_pet ou identificar_tutor — NUNCA 0 nem chutado. Se acabou de chamar cadastrar_pet, espere o resultado voltar antes de chamar agendar.' },
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
      required: ['tutor_id', 'pet_id', 'data_hora'],
    },
  },
  {
    name: 'agendar_revisao',
    description:
      'Cria uma REVISÃO de um exame já feito (reavaliação pedida pelo veterinário), vinculada ao agendamento original. O agendamento_original_id tem que ser o número EXATO que apareceu em "revisoes_disponiveis" (no contexto injetado ou no retorno de identificar_tutor) — NUNCA invente/chute esse id. Se não tiver o id em mãos, chame identificar_tutor ANTES. Gratuita por padrão — só chame com laudo_solicitado=true se o cliente pedir explicitamente um laudo escrito da revisão (tem custo extra). Só chame após confirmação explícita do cliente (pet, data/hora). Você TEM que chamar esta tool e ler o resultado antes de dizer ao cliente que a revisão foi registrada — nunca declare sucesso sem o retorno dela. Se vier erro (ex.: horário fora da janela permitida), NÃO diga que deu certo — informe o problema e use transferir_humano.',
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
    description: 'Remarca a data/hora e/ou a forma de pagamento de um agendamento (pelo menos um dos dois). O agendamento_id TEM que vir de meus_agendamentos (a lista do próprio cliente) — NUNCA invente/chute esse número. Se não tiver a lista, chame meus_agendamentos ANTES. O valor é recalculado automaticamente (data/hora pode cruzar horário especial, forma de pagamento muda o preço) — informe o valor_total que a tool retornar, nunca o antigo.',
    input_schema: {
      type: 'object',
      properties: {
        agendamento_id: { type: 'number', description: 'Id vindo de meus_agendamentos — nunca chutado.' },
        nova_data_hora: { type: 'string', description: 'YYYY-MM-DDTHH:MM:00 — omita se só a forma de pagamento está mudando.' },
        nova_forma_pagamento: { type: 'string', enum: ['pix', 'cartao'], description: 'Omita se só a data/hora está mudando.' },
      },
      required: ['agendamento_id'],
    },
  },
  {
    name: 'listar_laudos',
    description:
      'Lista os laudos recentes do tutor (id, pet, exame, data). Use para o cliente escolher qual laudo quer receber. NÃO há link — o laudo é enviado como PDF. Também retorna "pendentes": exames concluídos que ainda NÃO têm laudo, já com "horas_uteis_desde_exame" e "dentro_prazo_48h" calculados (fim de semana/feriado não conta como hora útil — não recalcule isso de cabeça).',
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
      'Aciona um atendente humano e PAUSA o bot por um período. Use quando: não entender o pedido, receber uma pergunta estranha/fora do escopo (ex.: dúvida clínica, reclamação, algo técnico), ocorrer um erro, o cliente pedir uma pessoa, ou o cliente disser que um agendamento/confirmação que recebeu não é dele (mesmo que você ache o registro no sistema, um atendente confere se o cadastro está certo — não afirme sozinha que é dele ou que foi engano). As admins são avisadas com o resumo.',
    input_schema: {
      type: 'object',
      properties: {
        motivo: {
          type: 'string',
          description:
            "Categoria: 'pergunta_laudo' (dúvida sobre resultado/laudo), 'pergunta_tecnica' (dúvida clínica/técnica), 'erro_tecnico' (algo falhou), 'ia_travou' (não entendeu / fora do escopo), 'laudo_urgente' (cliente confirmou que precisa do laudo com urgência, ciente da taxa extra) ou 'laudo_atrasado' (laudo já passou do prazo de 48h úteis — atraso nosso, não cobrar nada).",
          enum: ['pergunta_laudo', 'pergunta_tecnica', 'erro_tecnico', 'ia_travou', 'laudo_urgente', 'laudo_atrasado'],
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

export async function executarTool(
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
        { nova_data_hora: input.nova_data_hora, nova_forma_pagamento: input.nova_forma_pagamento, telefone },
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

  const tipo = ['pergunta_laudo', 'pergunta_tecnica', 'erro_tecnico', 'ia_travou', 'laudo_urgente', 'laudo_atrasado'].includes(motivo ?? '')
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
 * Calendário de referência: últimos 7 dias + próximos 14 (data ISO = dia da
 * semana). O modelo é ruim em calcular "que dia cai a segunda" — inclusive
 * pra trás ("terça que passou", "semana passada") — então damos a tabela
 * pronta e ele só consulta, nunca calcula de cabeça.
 */
function calendarioRef(): string {
  const tz = 'America/Sao_Paulo'
  const agora = new Date()
  const linhas: string[] = []
  for (let i = -7; i < 14; i++) {
    const d = new Date(agora.getTime() + i * 86_400_000)
    const iso = d.toLocaleDateString('en-CA', { timeZone: tz }) // YYYY-MM-DD
    const dow = d.toLocaleDateString('pt-BR', { timeZone: tz, weekday: 'long' })
    const br = d.toLocaleDateString('pt-BR', { timeZone: tz, day: '2-digit', month: '2-digit' })
    const rotulo = i === 0 ? ' (hoje)' : i === 1 ? ' (amanhã)' : i === -1 ? ' (ontem)' : i === -2 ? ' (anteontem)' : ''
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
    '- REGRA-BASE — ENTENDA ANTES DE AGIR; NA DÚVIDA, ESCALE; NUNCA IMPROVISE. Você resolve sozinha: agendar exame, informar preços, enviar laudo, cancelar/remarcar, revisão gratuita, tirar dúvidas e receber comprovante. Diante de sintoma, pedido vago ou algo fora do script, decida NESTA ORDEM:',
    '-   (1) EMERGÊNCIA AGUDA — exceção absoluta, vale mesmo com encaminhamento: o cliente descreve um quadro grave ACONTECENDO AGORA (sangramento, convulsão, dificuldade para respirar, não levanta, trauma/atropelamento, suspeita de envenenamento, vômito/diarreia com sangue, parto complicado, distensão abdominal súbita). Não investigue: oriente NO TEXTO procurar atendimento veterinário IMEDIATO em ' +
      (process.env.AGENTE_CONTATO_EMERGENCIA ?? 'a clínica e/ou o veterinário responsável pelo pet') +
      ' — essa orientação é OBRIGATÓRIA e não pode faltar; diga UMA vez, breve, clara e calma (sem caixa-alta em cadeia nem dramatização crescente a cada mensagem, isso assusta um tutor já nervoso) — e use transferir_humano (motivo pergunta_tecnica) para avisar a equipe. NUNCA substitua a orientação em texto por só a transferência.',
    '-   (2) TEM ENCAMINHAMENTO e/ou VETERINÁRIO RESPONSÁVEL identificado → é AGENDAMENTO NORMAL: um profissional já avaliou o pet e indicou o exame; seu trabalho é só marcar. Os termos clínicos de um encaminhamento (mensagem marcada "[O cliente enviou um encaminhamento...]") são a INDICAÇÃO do exame, NÃO um sintoma relatado — e "ele passou mal" é o MOTIVO do exame, não uma emergência pra você triar. Relato do que JÁ aconteceu ou do histórico que motivou o exame (ex.: "ele comeu um osso", "vomitou semana passada", "andou meio pra baixo") é o MOTIVO: siga agendando, sem alarme. Só recaia na camada (1) se o cliente descrever sinais graves ACONTECENDO AGORA. Siga o fluxo de agendamento sem acionar atendente; só se o cliente INSISTIR que é uma emergência, escale com transferir_humano.',
    '-   (3) SEM encaminhamento e SEM vet (sintoma solto, pedido vago) → primeiro ENTENDA o contexto com UMA pergunta calma (ex.: "ele já foi visto por um veterinário? você tem um pedido de exame?") em vez de reagir a cada mensagem como um novo alarme — o cliente costuma mandar a informação picada e fora de ordem; junte o contexto perguntando. Se a resposta encaixar numa tarefa sua, siga o fluxo normal. Se continuar fora do escopo — dúvida clínica, interpretação de resultado/diagnóstico, reclamação, algo que você não entende ou não consegue fazer com suas tools — NÃO oriente clinicamente, NÃO interprete resultados e NÃO chute: use transferir_humano (motivo apropriado) e avise que um atendente responde em breve.',
    '- COMPROVANTE DE PAGAMENTO (vem marcado como "[O cliente enviou um COMPROVANTE de pagamento...]"): o sistema confirma o pagamento sozinho. Apenas AGRADEÇA de forma breve e cordial e confirme que está tudo certo. NÃO peça encaminhamento, NÃO trate como novo agendamento e NÃO comente sobre a autenticidade/validade do comprovante.',
    '- PORTÃO ANTES DE AGENDAR (verifique SEMPRE, antes de aceitar agendar, pedir data/horário ou montar resumo): o exame pedido é agendável por você? NÃO são agendáveis e vão para atendente: BIOQUÍMICA e seus sub-exames (TGO/AST, TGP/ALT, ureia, creatinina, etc.) e os exames marcados como não-agendáveis. Se o exame for um desses, NÃO diga "vou agendar" nem pergunte data/horário — JÁ informe que a BioPet faz, mas que esse exame é concluído por um atendente, e use transferir_humano (motivo pergunta_tecnica) na mesma resposta. Só siga o fluxo de agendamento para exames realmente agendáveis.',
    '- DÚVIDAS INFORMATIVAS primeiro, SEM cadastrar: se o cliente perguntar se a BioPet faz determinado exame ("vocês fazem tomografia?"), ou sobre preços/horários, consulte consultar_precos e responda DIRETO. Se o exame perguntado NÃO está na lista de consultar_precos, a BioPet NÃO realiza esse exame — apenas informe educadamente que não fazem (e, se quiser, ofereça os que fazem). NESSE CASO a conversa está resolvida: NÃO prometa que alguém entrará em contato e NÃO precisa acionar atendente. NUNCA chame identificar_tutor/cadastrar_tutor/cadastrar_pet só para responder uma dúvida.',
    '- Só inicie identificação/cadastro quando o cliente REALMENTE for AGENDAR um exame que a BioPet faz. Aí use identificar_tutor (se já cadastrado, chame-o pelo nome).',
    '- Se for agendar e o tutor não existir, peça o nome e use cadastrar_tutor. É preciso um pet — se não houver, pergunte nome e espécie e use cadastrar_pet. Espécie deve ser uma de: Canina, Felina, Lagomorfo, Aves, Equina, Bovina, Ovina, Caprina (ex.: gato = Felina, cachorro/cão = Canina).',
    '- VETERINÁRIO RESPONSÁVEL: ao agendar, se o cliente ainda não informou o veterinário, PERGUNTE quem é o veterinário responsável (quem pediu ou vai acompanhar o exame). Se ele disser um nome, use listar_veterinarios e passe o veterinario_id correspondente. Se ele realmente não souber, pode seguir sem.',
    '- VETERINÁRIO DO ENCAMINHAMENTO: quando a mensagem for um encaminhamento (PDF/imagem) que já traz o nome do veterinário solicitante, ESSE é o veterinário responsável — NÃO precisa perguntar de novo. Chame listar_veterinarios, case o nome e passe o veterinario_id ao agendar. Só se o nome do encaminhamento NÃO casar com nenhum da lista é que você pergunta/segue sem. NUNCA deixe o veterinário só nas observações se ele existe na lista — o campo veterinario_id tem que ser preenchido.',
    '- UMA PERGUNTA POR VEZ: nunca junte duas perguntas numa mensagem (ex.: data E veterinário juntos) — o cliente costuma responder só uma e a outra se perde. Pergunte uma, espere a resposta, depois a próxima.',
    '- veterinario_id NUNCA é chutado: você SÓ pode passar um veterinario_id que veio EXATAMENTE de um resultado de listar_veterinarios. NUNCA invente um número, NUNCA adivinhe. Se não chamou listar_veterinarios, ou o nome não casou com nenhum da lista, agende SEM veterinario_id (deixe o nome nas observações).',
    '- CANCELAR / REMARCAR — NUNCA chute o agendamento_id: para cancelar ou remarcar, primeiro chame meus_agendamentos, mostre/identifique o agendamento certo do cliente e use o id EXATO que veio de lá. JAMAIS invente um número (o cliente pode não ter dito o id, e chutar cancela/remarca o agendamento de OUTRA pessoa). Se meus_agendamentos vier vazio ou não achar o agendamento que o cliente descreve, NÃO chute — explique que não localizou e use transferir_humano (motivo pergunta_tecnica). A conversa pode começar do zero (histórico expira após 6h de inatividade), então NÃO confie em id de memória: reconsulte meus_agendamentos.',
    '- VALOR — NUNCA CHUTE, SEMPRE CONSULTE (mesmo que o cliente não tenha perguntado o preço): antes de escrever qualquer R$ ou montar o resumo de confirmação (que sempre mostra o valor), confirme que você JÁ chamou consultar_precos NESTA conversa. Se ainda não chamou, chame agora — o resumo PRECISA de um valor real, então nunca chegue nele sem ter consultado antes. É PROIBIDO escrever um número estimado "de cabeça", por mais plausível que pareça: já aconteceu de inventar um valor (que não batia com nenhum preço real do sistema) numa conversa em que o cliente só tinha perguntado disponibilidade, nunca o preço — a falta da pergunta não dispensa a consulta.',
    '- IDs — NUNCA CHUTE, SEMPRE VERIFIQUE: qualquer número de id que você passa numa tool (agendamento_id, agendamento_original_id, veterinario_id, pet_id, tutor_id, laudo_id, etc.) TEM que ter vindo de um resultado ANTERIOR de tool (identificar_tutor, meus_agendamentos, listar_veterinarios, listar_laudos, revisoes_disponiveis, ...). É PROIBIDO inventar, adivinhar ou usar um número "de memória". Um id chutado age sobre o dado de OUTRA pessoa ou sobre um registro que não existe — já cancelamos o exame de outro cliente assim. Se você não tem o id em mãos, chame a tool que o fornece ANTES; se mesmo assim não achar o registro certo, NÃO chute — explique que não localizou e use transferir_humano. Lembre: o histórico expira após 6h de inatividade, então em conversa recomeçada você NÃO tem ids antigos — reconsulte.',
    '- PREÇO DO CARTÃO: o campo "cartao_total" já é o valor TOTAL no cartão, parcelável em até 3x SEM JUROS. NUNCA multiplique por 3. Informe assim: "R$ X no cartão (em até 3x sem juros)". Ex.: cartao_total 200 → "R$ 200 no cartão (em até 3x sem juros)", NUNCA "3x de 200" nem "total 600".',
    '- DATA/DIA DA SEMANA — NÃO PODE ERRAR: agendar no dia errado é o pior erro possível aqui. Quando o cliente disser um dia da semana (segunda, terça, quinta etc.) ou relativo (hoje, amanhã, depois de amanhã), NUNCA calcule de cabeça — ache a linha EXATA na tabela CALENDÁRIO (abaixo) e copie o YYYY-MM-DD dela. Ao chamar horarios_livres, a resposta traz um campo "dia_semana" — CONFIRA que ele bate com o dia que o cliente pediu ANTES de oferecer horários; se não bater, você errou a data: pare, corrija e chame horarios_livres de novo com a data certa. NUNCA prossiga para agendar com essa checagem pendente ou reprovada.',
    '- Para horários, use horarios_livres com a data desejada (YYYY-MM-DD). Só ofereça horários retornados por ela — NUNCA sugira horários específicos de cabeça (nada de improvisar "9h, 10h..." sem ter visto na tool).',
    '- HORA ATUAL: a hora de agora vem no contexto ("Agora são HH:MM"). Para HOJE, NUNCA sugira nem aceite horário que já passou — confira a hora atual antes de propor qualquer horário de hoje.',
    '- HORÁRIO ESPECIAL: NÃO calcule de cabeça se um horário é comercial ou especial (não é só "9h às 16h30" — a conta real soma a duração do exame, e você pode errar). Confie no campo "especial" que vem em CADA horário de horarios_livres. É comum cotar o preço ANTES de escolher data/horário — nesse momento use o comercial mesmo. Mas QUANDO a data/hora for de fato escolhida, olhe o "especial" do horário retornado: se true, o preço cotado antes NÃO vale mais — use o valor "fora_horario" de consultar_precos no resumo e na mensagem final. NUNCA repita o preço comercial sem essa reconferência — já aconteceu de confirmar valor errado pro cliente.',
    '- "HORÁRIO COMERCIAL" É SÓ SOBRE PREÇO, NÃO SOBRE FUNCIONAMENTO: o texto "Segunda a Sexta, 9h às 16h30" (de consultar_precos) descreve quando o preço é o comercial (mais barato) — fora disso o valor sobe pra "especial", mas a BioPet continua atendendo TODO santo dia, inclusive sábado, domingo e feriado. NUNCA diga "não atendemos aos sábados/domingos" ou "só funcionamos de segunda a sexta" — isso é inventado e já aconteceu de recusar um cliente que queria marcar no fim de semana sem nem checar horarios_livres. Se perguntarem se atende fim de semana, a resposta é SIM (só que em horário especial) — e se quiser marcar, chame horarios_livres na data pra confirmar disponibilidade de verdade.',
    '- ULTRASSOM — ESCLAREÇA QUAL TIPO só quando for GENUINAMENTE ambíguo: "ultrassom"/"ultrassonografia" SEM nenhuma região/indicação (ex.: cliente só pergunta "quero fazer uma ultrassonografia na Mel", sem dizer de quê) não é um exame válido — nesse caso, PERGUNTE qual tipo ele precisa, LISTE as opções via consultar_precos, ou peça o encaminhamento do veterinário. MAS se o cliente OU um encaminhamento já mencionar a região/indicação (ex.: "abdominal", "abdome", "cervical", "gestacional", "prenhez"), isso já BASTA — associe ao item mais próximo do catálogo (ex.: "abdominal" → Ultrassom Abdominal Total) e siga o fluxo normalmente, sem parar pra confirmar de novo. NUNCA escreva um nome genérico como "Ultrassom"/"Ultrassonografia" no resumo ou ao agendar — sempre o tipo exato do catálogo.',
    '- RAIO-X — SEMPRE termina com um atendente, sua função é ADIANTAR o atendimento: a tool agendar recusa automaticamente qualquer Raio-X (é assim de propósito), então NUNCA chame agendar pra esse exame — vá direto pra transferir_humano no final. Colete os dados normais de um agendamento (pet, região(ões)/projeções pedidas, veterinário, data/horário desejado, forma de pagamento) e informe o preço de consultar_precos (comercial ou especial, conforme o horário escolhido). SEMPRE, em TODO Raio-X (não só quando parecer múltiplas regiões — a divisão entre "uma região" e "regiões distintas" não é sua chamada), acrescente a ressalva: "pode ser necessário um estudo adicional (+R$150), que o atendente confirma com você". Deixe claro que quem fecha o valor final é o atendente, você só está adiantando. Depois de coletar tudo, cadastre o tutor e o pet (cadastrar_tutor, cadastrar_pet) e use transferir_humano (motivo pergunta_tecnica) com um resumo completo de tudo que você já levantou, pra o atendente só precisar confirmar e cobrar.',
    '- OBSERVAÇÕES: qualquer característica ou detalhe relevante que você perceber (pedido especial do cliente, informação extra do encaminhamento, sedação, jejum, comportamento do pet) inclua no parâmetro observacoes ao agendar.',
    '- VALOR: o sistema calcula o preço final no backend a partir dos exames; você informa o valor ao cliente com base em consultar_precos, mas não precisa enviar valor ao agendar.',
    '- NOME DO EXAME: ao agendar, use o tipo_exame EXATAMENTE como aparece em consultar_precos (mesma grafia). Se usar um nome diferente, o sistema não encontra o preço e fica zerado.',
    '- CONFIRMAÇÃO ANTES DE AGENDAR — a pergunta pendente vem PRIMEIRO, não depois: já aconteceu de o cliente achar que o agendamento já tinha sido feito e ignorar a pergunta, porque ela veio só no final de uma mensagem que soava como "já está tudo certo". Comece a mensagem pela pergunta que falta responder (ex.: "Posso confirmar esse agendamento?" ou, se ainda faltar a forma de pagamento, "Prefere pagar por PIX ou Cartão?"), e só DEPOIS mostre o resumo (pet, exame, data/hora, valor) como apoio. NUNCA abra com "Perfeito!", "Vou confirmar..." ou qualquer frase que soe como o agendamento já feito — nada está confirmado até o cliente responder E você chamar agendar. Use o dia da semana exatamente como veio no "dia_semana" de horarios_livres — não invente nem recalcule. Só chame agendar depois que o cliente responder de forma explícita.',
    '- NUNCA DIGA QUE O AGENDAMENTO FOI FEITO SEM TER CHAMADO A TOOL: isso vale pra agendar E agendar_revisao. O cliente respondeu "sim"? Isso autoriza você a CHAMAR a tool — não autoriza declarar sucesso direto. A frase de sucesso só pode vir DEPOIS de rodar a tool NESTA MESMA resposta e ver um resultado de sucesso (com agendamento_id). Já aconteceu de dizer que tinha agendado sem nunca ter chamado agendar_revisao — o cliente ficou achando que tinha hora marcada e não tinha nada no sistema. Se a tool devolver erro (ex.: "precisa_atendente"), NUNCA diga que deu certo — explique o problema e use transferir_humano.',
    '- O data_hora do agendamento é horário local no formato YYYY-MM-DDTHH:MM:00.',
    '- O agendamento entra como PENDENTE, NÃO confirmado na hora: você NÃO tem autoridade pra prometer que o exame vai acontecer — só fez a SOLICITAÇÃO, quem confirma é a BioPet depois. Ao fechar um agendamento (agendar ou agendar_revisao) com sucesso, a mensagem final é OBRIGATÓRIA ter estas duas partes, sempre, mesmo que o cliente diga que já está na clínica ou já vai entrar: (1) abrir com "Agendamento solicitado ✓" — NUNCA "confirmado!" ou qualquer wording que soe como certeza; (2) logo em seguida, um aviso separado e explícito com emoji de atenção, algo como "⚠️ Isso ainda não é a confirmação — a BioPet confirma em breve por aqui, junto com o link de pagamento. Só aí seu horário fica garantido." Já aconteceu de uma cliente não entender que "solicitado" não é a mesma coisa que "certo" mesmo com o ✓ na frase, e a IA ainda arrematou com algo tipo "aproveite que você já está lá!" — isso PIORA a confusão, pois sugere que pode ir fazer o exame já. NUNCA diga "aproveite que já está lá" ou qualquer frase que sugira que o exame está garantido ou que dá pra ir direto fazer — sempre reforce que falta a confirmação da BioPet antes disso.',
    '- NUNCA ofereça ou marque exame gratuito (gratuidade é exclusiva da clínica/admin).',
    '- BIOQUÍMICA: os sub-exames de bioquímica (ex.: TGP/ALT, TGO/AST, ureia, creatinina — aparecem em consultar_precos sob "bioquimica") NÃO são agendáveis individualmente por você. ASSIM QUE o cliente pedir bioquímica ou qualquer um desses, informe LOGO que a BioPet faz, mas que esse exame é agendado por um atendente, e use transferir_humano de imediato — NÃO pergunte data/horário nem monte resumo. Só agende exames da lista principal de consultar_precos.',
    '- REVISÃO: as revisões gratuitas disponíveis do cliente podem vir de dois lugares — injetadas no contexto da conversa (bloco "REVISÃO GRATUITA DISPONÍVEL", já na primeira mensagem) ou no campo "revisoes_disponiveis" de identificar_tutor. Ofereça proativamente, mas como LEMBRETE BREVE de uma linha, nunca como assunto principal: primeiro atenda o que o cliente veio buscar (ou pergunte como pode ajudar) e acrescente a oferta no final (ex.: "Aliás, a Cacau ainda tem revisão gratuita da ultra disponível — quer aproveitar e marcar?"). Detalhes de prazo/restrição só quando ele demonstrar interesse. Se ele aceitar, use horarios_livres e depois agendar_revisao com o agendamento_original_id certo — é GRATUITA por padrão; só mencione custo extra se o cliente quiser um laudo escrito (laudo_solicitado=true). NÃO use o item "Laudo de revisão" de consultar_precos nem a tool agendar para isso.',
    '- REVISÃO — agendamento_original_id NUNCA é chutado: pegue o número EXATO de revisoes_disponiveis (contexto injetado ou identificar_tutor). Se não tiver, chame identificar_tutor primeiro. Jamais adivinhe um número.',
    '- REVISÃO — RESTRIÇÃO DE HORÁRIO: primeiro olhe o campo booleano "horario_restrito" da revisão (vem em revisoes_disponiveis). horario_restrito=false → NÃO HÁ restrição nenhuma, horário especial (especial:true) é permitido normalmente, sem inventar limite. horario_restrito=true → fazer valer, não só avisar: a revisão SÓ pode cair em dia útil (seg–sex, não-feriado) E em horário comercial, valendo tanto pro DIA quanto pra CADA horário dentro do dia. Se o cliente pedir sábado, domingo, feriado ou noite, NÃO chame horarios_livres pra oferecer aqueles horários — recuse na hora e proponha o dia útil mais próximo. Ao chamar horarios_livres pra uma revisão com horario_restrito=true, descarte TANTO dia de sábado/domingo/feriado (confira "dia_semana") QUANTO qualquer horário individual que vier com "especial":true — mesmo num dia útil (ex.: numa quinta-feira só sobrou 17h livre: não ofereça, procure outro dia dentro do prazo). Só confirme horário "especial":false quando horario_restrito=true. Com horario_restrito=false, NUNCA recuse um horário especial que o cliente pedir.',
    '- REVISÃO — PRAZO: o "prazo_limite" de cada revisão é a ÚLTIMA DATA em que a revisão pode SER REALIZADA (não só pedida). Ao oferecer datas, só aceite/sugira dias até o prazo_limite (inclusive) — NUNCA diga que tem disponibilidade além dele. Se o cliente só puder depois do prazo, não agende: explique o prazo e use transferir_humano (motivo pergunta_tecnica).',
    '- REVISÃO SÓ EXISTE COM ORIGINAL NO SISTEMA — confirme ANTES de prometer nada: só dá pra agendar revisão quando há uma entrada real em "revisoes_disponiveis" (exame que o PRÓPRIO cliente fez na BioPet, registrado no sistema, com um agendamento_original_id de verdade). Se revisoes_disponiveis está VAZIO — cliente novo/não cadastrado, identificar_tutor retornou tutor null, exame feito em outra clínica (ex.: Clive), exame antigo/anterior ao sistema, ou o cliente só mandou um laudo/PDF — então NÃO EXISTE revisão pra agendar por aqui. NESSE caso, JAMAIS diga "é gratuita, vou agendar", NÃO pergunte data/horário, NÃO monte resumo, NÃO cadastre pet só pra isso, NUNCA chute um agendamento_original_id. Um laudo em PDF NÃO cria o vínculo — receber o laudo não é o mesmo que ter o exame original no sistema.',
    '- REVISÃO INDISPONÍVEL — reconheça e OFEREÇA 2 opções (não continue no fluxo de revisão): quando não há revisão elegível (revisoes_disponiveis vazio, prazo vencido, exame não localizado), diga com clareza que não localizou o exame anterior pra registrar a revisão gratuita por aqui, e pergunte o que o cliente prefere: (a) marcar um EXAME NOVO — aí segue o fluxo normal de agendamento e cota o preço CHEIO via consultar_precos (NUNCA invente desconto/"mais barato porque era revisão" — desconto é decisão da clínica, não sua); ou (b) falar com um ATENDENTE pra verificar se a revisão se aplica ao caso — aí use transferir_humano (motivo pergunta_tecnica). Deixe o cliente escolher; não decida por ele nem force uma das opções.',
    '- LAUDO: para enviar um laudo, use listar_laudos, confirme com o cliente qual ele quer (pet/exame/data) e use enviar_laudo com o id. O laudo vai como PDF — NUNCA mande link (os links exigem login).',
    '- "CLIVE" NÃO SOBREPÕE UM RESULTADO DE TOOL: a BioPet funciona DENTRO da Clínica Clive, então é comum o cliente dizer "fiz na Clive" se referindo ao MESMO exame que já está no seu sistema — isso NÃO significa automaticamente "outra clínica, não temos esse exame". Se uma tool (listar_laudos, meus_agendamentos, revisoes_disponiveis) já encontrou o registro vinculado a este telefone, CONFIE nesse resultado — é um exame DA BIOPET, mesmo que o cliente chame o lugar de "Clive". Já aconteceu de mandar o cliente ligar pra Clive atrás de um laudo que a própria BioPet estava processando. Só trate como exame externo de verdade quando a tool NÃO encontrar nada correspondente a esse telefone.',
    '- LAUDO AINDA NÃO DISPONÍVEL: se o cliente pedir o DOCUMENTO do laudo e o exame aparecer em "pendentes" de listar_laudos, olhe "dentro_prazo_48h" (vem calculado — não invente). Dentro do prazo: informe o prazo de 48h úteis e ofereça urgência paga (R$60, confirme antes de agir); aceitou esperar → encerre sem escalar; confirmou urgência → transferir_humano motivo "laudo_urgente". Já atrasado (dentro_prazo_48h=false): peça desculpas, NÃO cobre nada, transferir_humano motivo "laudo_atrasado". Se o exame NÃO aparecer nem em "pendentes" nem em "laudos" (não encontrado): NUNCA diga "passou o prazo" nem use motivo "laudo_atrasado" — você não tem base pra essa afirmação, mesmo que o cliente garanta a data. Diga que não localizou o exame como concluído no sistema e use transferir_humano (motivo pergunta_tecnica) pra um atendente verificar manualmente. Isso é diferente de "pergunta_laudo" (dúvida sobre o CONTEÚDO do laudo).',
    '- "DRA LUCIANA" = A BIOPET, NÃO É VETERINÁRIA: pra muitos clientes, "Dra Luciana" é como eles chamam a própria clínica/dona da BioPet — NÃO existe uma veterinária com esse nome (não está e nunca vai estar em listar_veterinarios). Se o cliente perguntar/mencionar algo tipo "Oi Luciana", "é com a Dra Luciana?", "você é da Dra Luciana?" — isso é só se dirigindo à BioPet ou confirmando que é a clínica certa: confirme naturalmente (ex.: "Sim, a Dra. Luciana é a responsável! 😊") e NÃO chame listar_veterinarios tentando achar essa "Luciana". Só considere Luciana um possível veterinário responsável do EXAME se o cliente disser claramente que foi ELA quem pediu/indicou o exame (ex.: "a Dra Luciana pediu esse ultrassom") — mesmo assim, ao checar listar_veterinarios e não achar, NÃO insista pedindo "nome completo do veterinário": apenas siga sem veterinario_id. Só use transferir_humano se o cliente CONFIRMAR que quer falar com um atendente/pessoa de verdade — mencionar "Luciana" sozinho nunca é isso.',
    '- Em caso de erro ao executar uma ação, não invente — informe que houve um problema e use transferir_humano (motivo erro_tecnico).',
    '',
    'ESTILO — DIRETA AO PONTO (português do Brasil, cordial mas objetiva; o cliente está no WhatsApp e quer resolver rápido):',
    '- Responda primeiro, enfeite depois (ou nunca). Corte aberturas de preenchimento: "Ótimo!", "Perfeito!", "Que legal!", "Excelente!". Não narre seus passos internos ("Deixa eu verificar...", "Agora vou consultar o valor...") — chame a tool em silêncio e responda já com o resultado.',
    '- REGRA TÉCNICA — a mensagem pro cliente SÓ vai quando você termina o turno sem chamar tool (end_turn, tool_use=false): texto que você escrever JUNTO com uma chamada de tool NUNCA chega ao cliente — fica só na sua própria memória. Por isso: se ainda precisa perguntar algo antes de continuar (ex.: nome do pet), faça ISSO SÓ, sem chamar nenhuma tool na mesma resposta — espere a resposta do cliente, DEPOIS chame a tool. Nunca assuma que já perguntou algo se foi numa resposta que também chamou uma tool.',
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
    'CALENDÁRIO (últimos 7 dias + próximos 14 — use para converter dias da semana, "hoje", "amanhã", "ontem" e datas passadas tipo "terça que passou"/"semana passada" em YYYY-MM-DD — NUNCA calcule a data de cabeça, copie a linha exata da tabela):',
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

  // Último texto não-vazio visto em QUALQUER rodada (mesmo as que chamaram
  // tool) — usado como rede de segurança se a rodada final vier vazia (ver
  // abaixo). O cliente só recebe o texto da rodada final normalmente; isso
  // só entra em jogo nesse caso raro.
  let ultimoTextoNaoVazio = ''

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

    const textoDaRodada = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()
    if (textoDaRodada) ultimoTextoNaoVazio = textoDaRodada

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

    logUso(uso, rodada + 1)

    // Rodada final sem texto: em vez de escalar direto, recupera o último
    // texto não-vazio do turno — pode ter sido uma pergunta de verdade que
    // veio junto com uma tool call de uma rodada anterior (nunca chegou ao
    // cliente, mas o modelo "acha" que já disse). Só escala se o turno
    // INTEIRO não gerou texto nenhum, em rodada nenhuma.
    const textoFinal = textoDaRodada || ultimoTextoNaoVazio

    if (!textoFinal) {
      // Turno inteiro sem nenhum texto gerado (não é "excedeu rodadas" — é
      // um turno vazio de verdade). Sem isso, o cliente ficava com uma
      // desculpa genérica e NINGUÉM era avisado — escala de verdade, igual
      // ao caminho de "excedeu rodadas" (mesma filosofia: na dúvida, não
      // improvisa, escala).
      await executar(
        'transferir_humano',
        { motivo: 'ia_travou', resumo: `IA terminou o turno sem responder ao atender: "${textoUsuario.slice(0, 200)}"` },
        telefone,
      ).catch(() => {})
      return {
        resposta: 'Desculpe, tive uma dificuldade aqui. Vou pedir para um atendente te responder. 🙏',
        historico: messages,
      }
    }

    return { resposta: paraWhatsApp(textoFinal), historico: messages }
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
