/**
 * Processamento de mídia recebida no WhatsApp (Gemini multimodal).
 *
 * - Áudio: muitos tutores só mandam voz — transcrevemos para texto e tratamos
 *   como uma mensagem normal. Flash basta (transcrição é pouco sensível ao modelo).
 * - Imagem: o tutor manda o ENCAMINHAMENTO por foto (muitas vezes manuscrito) —
 *   extraímos os exames solicitados e dados úteis. Pro erra menos em OCR de foto
 *   torta/manuscrita; por isso o default da imagem é mais forte que o do áudio.
 *
 * A chave do Gemini vem de `GEMINI_API_KEY` (env) ou da config `ai_gemini_key`
 * em `system_config` (mesma usada pelo ai-review).
 */
import { GoogleGenerativeAI } from '@google/generative-ai'
import { supabase } from '@/lib/supabase'

const MODELO_AUDIO  = process.env.AGENTE_GEMINI_MODELO_AUDIO  ?? 'gemini-2.5-flash'
const MODELO_IMAGEM = process.env.AGENTE_GEMINI_MODELO_IMAGEM ?? 'gemini-2.5-pro'

async function getGeminiKey(): Promise<string> {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim()
  const { data } = await supabase
    .from('system_config')
    .select('value')
    .eq('key', 'ai_gemini_key')
    .maybeSingle()
  return data?.value?.trim() ?? ''
}

/** Transcreve um áudio (base64) para texto em português. */
export async function transcreverAudio(base64: string, mimetype: string): Promise<string> {
  const key = await getGeminiKey()
  if (!key) throw new Error('Gemini não configurado (GEMINI_API_KEY / ai_gemini_key).')

  const genAI = new GoogleGenerativeAI(key)
  const model = genAI.getGenerativeModel({ model: MODELO_AUDIO })

  const result = await model.generateContent([
    { inlineData: { mimeType: mimetype || 'audio/ogg', data: base64 } },
    {
      text:
        'Transcreva este áudio em português do Brasil, exatamente o que foi dito, ' +
        'sem comentários nem formatação extra. Se não houver fala, responda apenas: (sem fala).',
    },
  ])
  return result.response.text().trim()
}

/**
 * Lê uma imagem (base64) de encaminhamento/documento veterinário e devolve um
 * resumo objetivo do conteúdo útil para agendamento.
 */
export async function lerImagemEncaminhamento(
  base64: string,
  mimetype: string,
  legenda?: string,
): Promise<string> {
  const key = await getGeminiKey()
  if (!key) throw new Error('Gemini não configurado (GEMINI_API_KEY / ai_gemini_key).')

  const genAI = new GoogleGenerativeAI(key)
  const model = genAI.getGenerativeModel({ model: MODELO_IMAGEM })

  const instrucao =
    'Este arquivo (imagem ou PDF) foi enviado por um tutor pelo WhatsApp e provavelmente é um ENCAMINHAMENTO ' +
    'veterinário (pode ser manuscrito). Extraia, em português e de forma objetiva: ' +
    '1) exame(s)/procedimento(s) solicitado(s); 2) nome do pet, se houver; ' +
    '3) espécie, se houver; 4) veterinário solicitante, se houver; 5) qualquer observação relevante. ' +
    'Se a imagem não for um encaminhamento (ex.: foto do pet), descreva brevemente o que é. ' +
    'Não invente dados que não estão na imagem.' +
    (legenda ? `\n\nLegenda enviada pelo tutor: "${legenda}"` : '')

  const result = await model.generateContent([
    { inlineData: { mimeType: mimetype || 'image/jpeg', data: base64 } },
    { text: instrucao },
  ])
  return result.response.text().trim()
}
