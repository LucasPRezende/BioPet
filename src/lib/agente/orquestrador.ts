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
    description: 'Lista os laudos recentes do tutor (pelo telefone da conversa).',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'transferir_humano',
    description:
      'Transfere o atendimento para um humano quando não conseguir resolver ou o cliente pedir. O bot deixa de responder por um período.',
    input_schema: {
      type: 'object',
      properties: { motivo: { type: 'string' } },
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
    case 'transferir_humano':
      return transferirHumano(telefone)
    default:
      return { erro: true, mensagem: `tool desconhecida: ${nome}` }
  }
}

/** Marca o tutor em atendimento humano por `tempo_retorno_ia_horas` (config). */
async function transferirHumano(telefone: string): Promise<unknown> {
  const telNorm = normalizarTelefone(telefone)
  const digits = telefone.replace(/\D/g, '')

  const { data: cfg } = await supabase
    .from('configuracoes_agente')
    .select('tempo_retorno_ia_horas')
    .order('id')
    .limit(1)
    .maybeSingle()
  const horas = Number(cfg?.tempo_retorno_ia_horas ?? 2)
  const ate = new Date(Date.now() + horas * 3_600_000).toISOString()

  const { error } = await supabase
    .from('tutores')
    .update({ atendimento_humano: true, atendimento_humano_ate: ate })
    .or(`telefone.eq.${telNorm},telefone.eq.${digits}`)

  if (error) return { erro: true, mensagem: error.message }
  return { sucesso: true, retorno_em_horas: horas }
}

// ---------------------------------------------------------------------------
// Prompt do sistema
// ---------------------------------------------------------------------------

function systemPrompt(telefone: string, hoje: string): string {
  return [
    'Você é o assistente virtual da BioPet, um laboratório/clínica veterinária. Atende tutores pelo WhatsApp para MARCAR EXAMES, informar valores, ver laudos e gerenciar agendamentos.',
    `O telefone do cliente nesta conversa é ${telefone}. Hoje é ${hoje} (horário de Brasília).`,
    '',
    'REGRAS:',
    '- No início, use identificar_tutor para saber se o cliente já é cadastrado e quais pets tem.',
    '- Se o tutor não existir, peça o nome e use cadastrar_tutor. Para marcar, é preciso um pet — se não houver, pergunte nome e espécie e use cadastrar_pet.',
    '- Para valores, use consultar_precos. NUNCA invente preços.',
    '- Para horários, use horarios_livres com a data desejada (YYYY-MM-DD). Só ofereça horários retornados por ela. Funcionamento: segunda a sexta, 9h às 16h30.',
    '- Antes de agendar, mostre um resumo (pet, exame, data/hora, valor) e peça confirmação explícita. Só chame agendar após o cliente confirmar.',
    '- O data_hora do agendamento é horário local no formato YYYY-MM-DDTHH:MM:00.',
    '- O agendamento entra como PENDENTE: avise que a clínica vai confirmar; não prometa confirmação imediata.',
    '- NUNCA ofereça ou marque exame gratuito (gratuidade é exclusiva da clínica/admin).',
    '- NÃO dê orientação clínica/veterinária. Apenas agendamento e informações operacionais.',
    '- Se não entender ou o cliente pedir atendente, use transferir_humano e avise que alguém da equipe vai responder.',
    '',
    'ESTILO: cordial, claro e breve, em português do Brasil. Emojis com moderação. Faça uma pergunta por vez.',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Loop principal
// ---------------------------------------------------------------------------

export interface RespostaOrquestrador {
  resposta: string
  historico: any[]
}

/**
 * Processa uma mensagem do usuário e devolve a resposta + histórico atualizado
 * (para persistir). `historico` é a lista de mensagens das rodadas anteriores.
 */
export async function responder(
  telefone: string,
  textoUsuario: string,
  historico: any[],
): Promise<RespostaOrquestrador> {
  const client = getAnthropic()
  const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const system = systemPrompt(telefone, hoje)

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
          const out = await executarTool(block.name, block.input as Record<string, any>, telefone)
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

    return { resposta: texto || 'Desculpe, não consegui responder agora.', historico: messages }
  }

  // Excedeu as rodadas de tool — encerra com fallback.
  return {
    resposta: 'Desculpe, tive uma dificuldade aqui. Vou pedir para um atendente te responder. 🙏',
    historico: messages,
  }
}
