import 'server-only'
import { GoogleGenerativeAI, SchemaType, type ResponseSchema } from '@google/generative-ai'
import { getGeminiKey } from '@/lib/agente/midia'
import { parseCt } from '@/lib/pcr-resultado'

// Leitura do "Relatório do Teste de PCR em Tempo Real" exportado pelo
// equipamento (Bioguard).
//
// O PDF não tem texto: a página inteira é uma imagem, e a fonte do equipamento
// sai corrompida (o, n, O e N viram símbolos — "Leishma⊣hia", "CA–I–A").
// pdf-parse não extrai nada, e OCR comum erra essas letras. Por isso a leitura
// é feita pelo Gemini (visão), que reconstrói as palavras.
//
// O Gemini devolve só os DADOS BRUTOS (alvo + Ct + cabeçalho). O resultado
// (positivo/negativo) é calculado no código a partir do Ct
// (lib/pcr-resultado.ts), e a tela mostra tudo para conferência antes de emitir.
//
// A idade fica de fora de propósito: no relatório de teste ela saiu sem dígito
// nenhum e o modelo inventou "5 anos". Vem do cadastro do pet.

const MODELO = process.env.PCR_GEMINI_MODELO ?? 'gemini-2.5-pro'

export interface PcrAlvoLido {
  nome: string
  ct:   number | null
}

export interface PcrRelatorioLido {
  tutor:          string
  pet:            string
  especie:        string
  raca:           string
  sexo:           string
  amostra:        string
  data_teste:     string   // YYYY-MM-DD ou ''
  data_relatorio: string   // YYYY-MM-DD ou ''
  alvos:          PcrAlvoLido[]
}

const str = { type: SchemaType.STRING } as const

const SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    tutor:          str,
    pet:            str,
    especie:        str,
    raca:           str,
    sexo:           str,
    amostra:        str,
    data_teste:     str,
    data_relatorio: str,
    alvos: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          nome: str,
          ct:   { type: SchemaType.STRING },
        },
        required: ['nome', 'ct'],
      },
    },
  },
  required: ['tutor', 'pet', 'especie', 'amostra', 'data_teste', 'alvos'],
}

const INSTRUCAO = `Este PDF é o "Relatório do Teste de PCR em Tempo Real" de um equipamento veterinário (Bioguard).
A página é uma imagem. A FONTE DO EQUIPAMENTO É CORROMPIDA: as letras "o", "n", "O" e "N" aparecem
como símbolos estranhos (ex.: "Leishma⊣hia" = "Leishmania", "CA–I–A" = "CANINA", "Fêmea", "Tut⊣r" = "Tutor").
Reconstrua as palavras em português usando o contexto. Os DÍGITOS não são afetados.

Extraia, sem inventar nada que não esteja no relatório:
- tutor, pet (nome do pet), especie, raca, sexo (como escrito; "" se ilegível ou ausente)
- amostra (campo "Amostra", ex.: "Sangue total")
- data_teste: a data do cabeçalho do paciente (campo "Data", no formato AAAA MM DD) → "AAAA-MM-DD"
- data_relatorio: a data ao lado de "Veterinário", no rodapé → "AAAA-MM-DD"
- alvos: CADA linha da tabela "Teste / Valor Ct / Resultado", na ordem.
  nome = nome do patógeno/teste reconstruído (ex.: "Leishmania spp").
  ct = o número da coluna "Valor Ct" exatamente como impresso (ex.: "0", "23.41"). Se vazio, "".
NÃO copie a tabela de referência (as faixas "Ct = 0", "10 < Ct ≤ 20"...) como alvo.
NÃO interprete o resultado: só o nome e o Ct.`

function dataISO(s: string): string {
  const m = /(\d{4})\D+(\d{1,2})\D+(\d{1,2})/.exec(s ?? '')
  if (!m) return ''
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
}

function titulo(s: string): string {
  const t = (s ?? '').trim()
  // O equipamento imprime tudo em maiúsculas; deixa legível no formulário.
  if (t && t === t.toUpperCase()) {
    return t.toLowerCase().replace(/(^|\s)(\S)/g, (_, sp, l) => sp + l.toUpperCase())
  }
  return t
}

export async function lerRelatorioPcr(pdf: Buffer, mimeType = 'application/pdf'): Promise<PcrRelatorioLido> {
  const key = await getGeminiKey()
  if (!key) throw new Error('Gemini não configurado (GEMINI_API_KEY / ai_gemini_key).')

  const model = new GoogleGenerativeAI(key).getGenerativeModel({
    model: MODELO,
    generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0 },
  })

  const result = await model.generateContent([
    { inlineData: { mimeType, data: pdf.toString('base64') } },
    { text: INSTRUCAO },
  ])

  let bruto: Record<string, unknown>
  try {
    bruto = JSON.parse(result.response.text())
  } catch {
    throw new Error('A leitura do PDF não devolveu um JSON válido.')
  }

  const s = (k: string) => String(bruto[k] ?? '').trim()
  const alvos = (Array.isArray(bruto.alvos) ? bruto.alvos : [])
    .map((a: { nome?: unknown; ct?: unknown }) => ({
      nome: String(a?.nome ?? '').trim(),
      ct:   parseCt(String(a?.ct ?? '')),
    }))
    .filter(a => a.nome)

  return {
    tutor:          titulo(s('tutor')),
    pet:            titulo(s('pet')),
    especie:        titulo(s('especie')),
    raca:           titulo(s('raca')),
    sexo:           titulo(s('sexo')),
    amostra:        titulo(s('amostra')),
    data_teste:     dataISO(s('data_teste')),
    data_relatorio: dataISO(s('data_relatorio')),
    alvos,
  }
}
