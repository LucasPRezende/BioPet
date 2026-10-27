import 'server-only'
import { GoogleGenerativeAI, SchemaType, type ResponseSchema } from '@google/generative-ai'
import { getGeminiKey } from '@/lib/agente/midia'
import { itensParaValores } from '@/lib/urinalise'

// Leitura da foto do analisador de urina URIT UC-32B.
//
// A máquina não exporta arquivo. A equipe fotografa a TELA (resultado com
// ✓/! ao lado de cada sigla, sem unidade; a 14G não cabe numa tela e precisa
// de duas fotos) ou a IMPRESSÃO térmica (sigla + valor + unidade, com "*" nos
// alterados). O Gemini só transcreve sigla e valor como estão; a interpretação
// (Neg = 0, "<=1"...) é feita em lib/urinalise.ts e a tela mostra tudo para
// conferir antes de emitir.

const MODELO = process.env.URINA_GEMINI_MODELO ?? 'gemini-2.5-pro'

export interface UrinaFotoLida {
  numero_amostra: string
  data:           string    // YYYY-MM-DD ou ''
  /** Valores por código do catálogo (LEU, KET, ..., ACR), como escritos na máquina. */
  valores:        Record<string, string>
  /** Siglas lidas que não são do catálogo (para avisar). */
  desconhecidos:  string[]
}

const str = { type: SchemaType.STRING } as const

const SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    numero_amostra: str,
    data:           str,
    itens: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: { sigla: str, valor: str },
        required: ['sigla', 'valor'],
      },
    },
  },
  required: ['itens'],
}

const INSTRUCAO = `As imagens são fotos do resultado de um analisador de fita de urina (URIT UC-32B):
ou a TELA do aparelho, ou a IMPRESSÃO em papel térmico. Pode haver mais de uma foto da mesma amostra
(a tela rola: a primeira mostra parte dos parâmetros e a segunda o resto).

Siglas possíveis: LEU, KET, NIT, URO, BIL, GLU, PRO, SG, pH, BLD, Vc, MA, Ca, CR, ACR.

Extraia, sem inventar nada que não esteja nas imagens:
- numero_amostra: o número após "No." (ex.: "0014", "000015"); "" se não aparecer.
- data: a data do resultado (ao lado do número da amostra, formato AAAA-MM-DD). NÃO use o relógio
  do topo da tela. "" se não aparecer.
- itens: cada parâmetro com a sigla exatamente como escrita (sem o "*" de marcação e sem o ícone
  ✓/! da tela) e o valor exatamente como escrito, incluindo sinais como "<=" ou "<" e palavras como
  "Neg", "Pos", "Normal". Pode copiar a unidade se estiver impressa (ex.: "0.5 mg/dL").
  Use ponto como separador decimal, como no aparelho. Se o mesmo parâmetro aparecer em duas fotos,
  coloque uma vez só.
Não interprete nem corrija valores. Se um valor estiver ilegível, devolva "".`

function dataISO(s: string): string {
  const m = /(\d{4})\D+(\d{1,2})\D+(\d{1,2})/.exec(s ?? '')
  if (!m) return ''
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
}

export async function lerFotosUrina(fotos: { dados: Buffer; mimeType: string }[]): Promise<UrinaFotoLida> {
  const key = await getGeminiKey()
  if (!key) throw new Error('Gemini não configurado (GEMINI_API_KEY / ai_gemini_key).')

  const model = new GoogleGenerativeAI(key).getGenerativeModel({
    model: MODELO,
    generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0 },
  })

  const result = await model.generateContent([
    ...fotos.map(f => ({ inlineData: { mimeType: f.mimeType, data: f.dados.toString('base64') } })),
    { text: INSTRUCAO },
  ])

  let bruto: { numero_amostra?: unknown; data?: unknown; itens?: unknown }
  try {
    bruto = JSON.parse(result.response.text())
  } catch {
    throw new Error('A leitura da foto não devolveu um JSON válido.')
  }

  return {
    numero_amostra: String(bruto.numero_amostra ?? '').trim(),
    data:           dataISO(String(bruto.data ?? '')),
    ...itensParaValores(Array.isArray(bruto.itens) ? bruto.itens : []),
  }
}
