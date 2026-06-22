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

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'identificar_tutor',
    description:
      'Identifica o tutor pelo telefone da conversa e lista os pets dele. Use no início para saber se o cliente já é cadastrado.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'consultar_precos',
    description:
      'Retorna a tabela de exames disponíveis com valores (PIX/cartão), duração e se varia por horário. Use para informar preço — NUNCA invente valores.',
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
      'Cria o agendamento. Só chame APÓS confirmação explícita do cliente (pet, exame, data/hora e valor). O agendamento entra como pendente para a clínica confirmar.',
    input_schema: {
      type: 'object',
      properties: {
        tutor_id: { type: 'number' },
        pet_id: { type: 'number' },
        tipo_exame: { type: 'string' },
        data_hora: { type: 'string', description: 'YYYY-MM-DDTHH:MM:00 (horário local)' },
        valor: { type: 'number' },
        duracao_minutos: { type: 'number' },
        forma_pagamento: { type: 'string', description: "'pix' ou 'cartao'" },
        veterinario_id: { type: 'number', description: 'Opcional — id do veterinário responsável (de listar_veterinarios)' },
      },
      required: ['tutor_id', 'tipo_exame', 'data_hora'],
    },
  },
  {
    name: 'meus_agendamentos',
    description: 'Lista os próximos agendamentos do tutor (pelo telefone da conversa).',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'cancelar_agendamento',
    description: 'Cancela um agendamento pelo id.',
    input_schema: {
      type: 'object',
      properties: {
        agendamento_id: { type: 'number' },
        motivo: { type: 'string' },
      },
      required: ['agendamento_id'],
    },
  },
  {
    name: 'remarcar_agendamento',
    description: 'Remarca um agendamento para nova data/hora.',
    input_schema: {
      type: 'object',
      properties: {
        agendamento_id: { type: 'number' },
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
    case 'meus_agendamentos':
      return chamarApi(`/api/agente/meus-agendamentos?telefone=${tel}`, 'GET')
    case 'cancelar_agendamento':
      return chamarApi(
        `/api/agente/cancelar?id=${Number(input.agendamento_id)}`,
        'PATCH',
        { motivo: input.motivo },
      )
    case 'remarcar_agendamento':
      return chamarApi(
        `/api/agente/remarcar?id=${Number(input.agendamento_id)}`,
        'PATCH',
        { nova_data_hora: input.nova_data_hora },
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

function systemPrompt(telefone: string, primeira: boolean): string {
  return [
    'Você é a assistente virtual da BioPet, um laboratório/clínica veterinária. Atende tutores pelo WhatsApp para MARCAR EXAMES, informar valores, ver laudos e gerenciar agendamentos.',
    `O telefone do cliente nesta conversa é ${telefone}.`,
    '',
    'CALENDÁRIO (use para converter dias da semana, "hoje" e "amanhã" em datas YYYY-MM-DD — NUNCA calcule a data de cabeça):',
    calendarioRef(),
    '',
    'REGRAS:',
    primeira
      ? '- Esta é a PRIMEIRA mensagem da conversa: apresente-se de forma acolhedora ("Olá! Eu sou a assistente virtual da BioPet 🐾") antes de ajudar.'
      : '- Continue a conversa de forma natural, sem se reapresentar.',
    '- No início, use identificar_tutor para saber se o cliente já é cadastrado e quais pets tem. Se já for cadastrado, chame-o pelo nome.',
    '- Se o tutor não existir, peça o nome e use cadastrar_tutor. Para marcar, é preciso um pet — se não houver, pergunte nome e espécie e use cadastrar_pet. Espécie deve ser uma de: Canina, Felina, Lagomorfo, Aves, Equina, Bovina, Ovina, Caprina (ex.: gato = Felina, cachorro/cão = Canina).',
    '- Você pode perguntar (opcional) se o cliente sabe qual veterinário vai acompanhar o exame. Se ele disser um nome, use listar_veterinarios e passe o veterinario_id correspondente ao agendar. Se não souber, siga sem veterinário — é opcional, não insista.',
    '- Para valores, use consultar_precos. NUNCA invente preços.',
    '- Para horários, use horarios_livres com a data desejada (YYYY-MM-DD). Só ofereça horários retornados por ela.',
    '- HORÁRIO COMERCIAL: segunda a sexta, 9h às 16h30. Fora disso (noite, sábado, domingo, feriado) é HORÁRIO ESPECIAL — você PODE agendar normalmente, mas avise que é horário especial e informe o preço especial (campo "fora_horario" em consultar_precos, quando o exame varia por horário). Em horário comercial use o preço comercial.',
    '- Antes de agendar, mostre um resumo (pet, exame, data/hora, valor) e peça confirmação explícita. Só chame agendar após o cliente confirmar.',
    '- O data_hora do agendamento é horário local no formato YYYY-MM-DDTHH:MM:00.',
    '- O agendamento entra como PENDENTE: avise que a clínica vai confirmar; não prometa confirmação imediata.',
    '- NUNCA ofereça ou marque exame gratuito (gratuidade é exclusiva da clínica/admin).',
    '- LAUDO: para enviar um laudo, use listar_laudos, confirme com o cliente qual ele quer (pet/exame/data) e use enviar_laudo com o id. O laudo vai como PDF — NUNCA mande link (os links exigem login).',
    '- NÃO dê orientação clínica/veterinária nem interprete resultados. Sua função é só agendamento/laudo/preço.',
    '- IMPORTANTE: se o cliente relatar QUALQUER sintoma, doença, emergência ou que o pet está doente/passando mal ("está vomitando", "não come", "machucou"), NÃO oriente e NÃO minimize — use transferir_humano (motivo pergunta_tecnica) imediatamente, pois pode ser urgente. O mesmo vale para perguntas sobre resultado/diagnóstico, dúvidas técnicas, reclamações, qualquer coisa fora do escopo, ou se você não entender. Sempre avise gentilmente que um atendente da equipe vai responder em breve.',
    '- Em caso de erro ao executar uma ação, não invente — informe que houve um problema e use transferir_humano (motivo erro_tecnico).',
    '',
    'ESTILO: cordial, acolhedora, clara e breve, em português do Brasil. Emojis com moderação. Faça uma pergunta por vez.',
    'FORMATAÇÃO WhatsApp: negrito com UM asterisco (*assim*), itálico com _assim_. NUNCA use ** (markdown), títulos com # nem tabelas.',
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
  const system = systemPrompt(telefone, historico.length === 0)

  const messages: Anthropic.MessageParam[] = [
    ...(historico as Anthropic.MessageParam[]),
    { role: 'user', content: textoUsuario },
  ]

  for (let rodada = 0; rodada < MAX_RODADAS_TOOL; rodada++) {
    const resp = await client.messages.create({
      model: MODELO,
      max_tokens: 1024,
      system,
      tools: TOOLS,
      messages,
    })

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

    return {
      resposta: paraWhatsApp(texto) || 'Desculpe, não consegui responder agora.',
      historico: messages,
    }
  }

  // Excedeu as rodadas de tool — encerra com fallback.
  return {
    resposta: 'Desculpe, tive uma dificuldade aqui. Vou pedir para um atendente te responder. 🙏',
    historico: messages,
  }
}
