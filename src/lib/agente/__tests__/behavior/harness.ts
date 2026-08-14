/**
 * Harness dos testes comportamentais do agente.
 *
 * Roda o orquestrador REAL (Claude de verdade, para pegar regressões de prompt),
 * mas com as tools MOCKADAS — nenhum acesso a banco, WhatsApp ou endpoints. O
 * fake retorna dados canônicos e registra todas as chamadas de tool, para
 * podermos afirmar QUAL ação o modelo tomou.
 */
import { responder, type ToolExecutor } from '@/lib/agente/orquestrador'

const TELEFONE = '5524999999999'

export interface ToolCall {
  nome: string
  input: Record<string, any>
}

/** Dados canônicos devolvidos pelas tools fake. */
const PRECOS = {
  horario_comercial: 'Segunda a Sexta, 9h às 16h30',
  nota_horario_comercial:
    'O limite de 16h30 é quando o exame precisa estar FINALIZADO, não é um horário seguro pra começar — ' +
    'um exame que começa às 16h30 pode terminar depois disso e já não ser comercial. NÃO calcule de cabeça: ' +
    'confie sempre no campo "especial" de cada horário de horarios_livres.',
  nota_cartao: 'cartao_total é o valor TOTAL no cartão (parcelável em até 3x sem juros) — NÃO multiplicar por 3.',
  exames: [
    {
      tipo: 'Ultrassom Abdominal',
      varia_por_horario: true,
      horario_comercial: { pix: 180, cartao_total: 200 },
      fora_horario: { pix: 240, cartao_total: 260 },
      duracao_minutos: 30,
    },
  ],
  bioquimica: { exames: [] },
}

/**
 * Slots fixos que cobrem a borda real do horário comercial (9h–16h30): um exame
 * de 30min que começa às 16h30 termina às 17h — passa do limite, então "especial"
 * tem que vir true mesmo o horário de INÍCIO batendo exatamente no limite. Mesma
 * forma da API real (ver src/app/api/agente/horarios-livres/route.ts).
 */
const HORARIOS_LIVRES = [
  { hora: '09:00', especial: false },
  { hora: '09:30', especial: false },
  { hora: '15:00', especial: false },
  { hora: '15:30', especial: false },
  { hora: '16:00', especial: false },
  { hora: '16:30', especial: true },
  { hora: '17:00', especial: true },
  { hora: '17:30', especial: true },
]

const CONTEXTO = {
  tutor: { id: 1, nome: 'Maria', telefone: TELEFONE, atendimento_humano: false },
  pets: [{ id: 7, nome: 'Rex', especie: 'Canina', raca: 'SRD' }],
  pets_falecidos: [],
}

const LAUDOS = {
  tem_laudo: true,
  laudos: [
    { id: 55, pet: 'Rex', tipo_exame: 'Ultrassom Abdominal', data: '10/06/2026', tem_arquivo: true },
  ],
}

function fakeResultado(nome: string, input: Record<string, any>): unknown {
  switch (nome) {
    case 'identificar_tutor':   return CONTEXTO
    case 'consultar_precos':    return PRECOS
    case 'listar_veterinarios': return { veterinarios: [{ id: 3, nome: 'Dra. Ana' }] }
    case 'horarios_livres':
      return {
        data: input.data,
        dia_semana: 'segunda-feira',
        duracao_minutos: input.duracao ?? 30,
        expediente: { inicio: '08:00', fim: '18:00' },
        total_livres: HORARIOS_LIVRES.length,
        horarios_livres: HORARIOS_LIVRES,
      }
    case 'cadastrar_tutor':     return { id: 1, nome: input.nome, telefone: TELEFONE }
    case 'cadastrar_pet':       return { id: 8, nome: input.nome, especie: input.especie }
    case 'agendar':             return { agendamento_id: 123 }
    case 'meus_agendamentos':   return { agendamentos: [] }
    case 'cancelar_agendamento':return { sucesso: true }
    case 'remarcar_agendamento':return { sucesso: true }
    case 'listar_laudos':       return LAUDOS
    case 'enviar_laudo':        return { enviado: true }
    case 'transferir_humano':   return { sucesso: true, retorno_em_horas: 2 }
    default:                    return { erro: true, mensagem: `tool desconhecida: ${nome}` }
  }
}

export interface Conversa {
  /** Envia uma mensagem do usuário e processa a resposta do bot. */
  enviar: (texto: string) => Promise<void>
  /** Todas as tools chamadas até agora. */
  calls: ToolCall[]
  /** Nomes das tools chamadas. */
  nomes: () => string[]
  /** Todo o texto que o bot respondeu, concatenado (minúsculo). */
  textos: () => string
  /** Custo acumulado em USD (quando o responder reporta uso; default 0). */
  custoUSD: () => number
  /** Diálogo turno a turno (cliente / bot + tools chamadas naquele turno). */
  dialogo: () => { de: 'cliente' | 'bot'; texto: string; tools?: string[] }[]
}

/**
 * Responder injetável: por padrão usa o orquestrador de produção (Claude). Pode
 * receber um responder alternativo (ex.: OpenRouter) que opcionalmente devolve
 * `uso.custoUSD` para a comparação de custo.
 */
export type ResponderFn = (
  telefone: string,
  texto: string,
  historico: any[],
  deps: { executar: ToolExecutor },
) => Promise<{ resposta: string; historico: any[]; uso?: { custoUSD?: number } }>

/** Cria uma conversa stateful com tools fake que registram as chamadas. */
export function novaConversa(responderFn: ResponderFn = responder): Conversa {
  const calls: ToolCall[] = []
  const respostas: string[] = []
  const dialogo: { de: 'cliente' | 'bot'; texto: string; tools?: string[] }[] = []
  let historico: any[] = []
  let custo = 0

  const executar: ToolExecutor = async (nome, input) => {
    calls.push({ nome, input })
    return fakeResultado(nome, input)
  }

  return {
    calls,
    nomes: () => calls.map((c) => c.nome),
    textos: () => respostas.join('\n').toLowerCase(),
    custoUSD: () => custo,
    dialogo: () => dialogo,
    enviar: async (texto: string) => {
      const antes = calls.length
      dialogo.push({ de: 'cliente', texto })
      const r = await responderFn(TELEFONE, texto, historico, { executar })
      historico = r.historico
      respostas.push(r.resposta)
      custo += r.uso?.custoUSD ?? 0
      dialogo.push({ de: 'bot', texto: r.resposta, tools: calls.slice(antes).map((c) => c.nome) })
      if (process.env.DEBUG_AGENTE) {
        console.log(`\n>>> USER: ${texto}\n<<< BOT: ${r.resposta}\n--- tools: ${calls.map((c) => c.nome).join(', ')}`)
      }
    },
  }
}
