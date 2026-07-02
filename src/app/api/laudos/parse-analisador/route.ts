import { NextRequest, NextResponse } from 'next/server'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { parseGasometriaPDF } from '@/lib/parse-gasometria-pdf'
import { generateBioquimicaPDF, type BioquimicaPDFData } from '@/lib/generate-bioquimica-pdf'

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

export async function POST(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const session = await parseSystemSession(cookie)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  let formData: FormData
  try { formData = await request.formData() } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })
  }

  const file = formData.get('pdf')
  if (!file || typeof file === 'string')
    return NextResponse.json({ error: 'Arquivo PDF não enviado.' }, { status: 400 })

  const buffer = Buffer.from(await (file as Blob).arrayBuffer())

  let gasData
  try {
    gasData = await parseGasometriaPDF(buffer)
  } catch (err) {
    console.error('[parse-analisador] parse error:', err)
    return NextResponse.json({ error: 'Não foi possível ler o PDF. Confirme que é um arquivo válido do analisador.' }, { status: 422 })
  }

  if (!gasData.exames.length)
    return NextResponse.json({ error: 'Nenhum resultado encontrado no PDF.' }, { status: 422 })

  const pdfData: BioquimicaPDFData = {
    nome_pet:   gasData.nome_pet   || 'Não identificado',
    especie:    capitalize(gasData.especie || ''),
    raca:       '',
    sexo:       '',
    idade:      gasData.idade,
    peso:       '',
    tutor:      gasData.tutor,
    telefone:   '',
    medico:     '',
    crmv:       '',
    clinica:    gasData.lab,
    material:   gasData.tipo_amostra || 'Sangue Venoso',
    data_laudo: gasData.data_teste,
    titulo:     'Gasometria e Eletrólitos',
    compact:    true,
    resultados: gasData.exames.map(e => ({
      codigo:    '',
      nome:      e.nome,
      valor:     e.valor,
      unidade:   e.unidade,
      metodo:    '',
      status:    e.status,
      valor_min: e.valor_min,
      valor_max: e.valor_max,
      grupo:     e.grupo || undefined,
    })),
  }

  let pdfBuffer: Buffer
  try {
    pdfBuffer = await generateBioquimicaPDF(pdfData)
  } catch (err) {
    console.error('[parse-analisador] generate error:', err)
    return NextResponse.json({ error: 'Erro ao gerar o PDF.' }, { status: 500 })
  }

  return NextResponse.json({
    pdfBase64: pdfBuffer.toString('base64'),
    pdfData,
    metadados: {
      nome_pet:     gasData.nome_pet,
      especie:      capitalize(gasData.especie || ''),
      tutor:        gasData.tutor,
      idade:        gasData.idade,
      tipo_amostra: gasData.tipo_amostra,
      data_teste:   gasData.data_teste,
      total_exames: gasData.exames.length,
    },
  })
}
