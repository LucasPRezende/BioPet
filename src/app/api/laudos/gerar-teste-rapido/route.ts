import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { generateTesteRapidoPDF, type TesteRapidoPDFData } from '@/lib/generate-teste-rapido-pdf'
import { savePdf, deletePdf } from '@/lib/pdf-storage'
import { jaTemLaudo } from '@/lib/laudo-duplicado'
import { baixarConsumoLaudo } from '@/lib/estoque'

export async function POST(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const session = await parseSystemSession(cookie)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  let body: {
    pdfData:        TesteRapidoPDFData
    tutor:          string
    telefone:       string
    sexo:           string
    raca:           string
    medico_responsavel: string
    data_laudo:     string
    veterinario_id: number | null
    tutor_id:       number | null
    pet_id:         number | null
    agendamento_id: number | null
    preco_exame:    number | null
    comissao:       number | null
    testes_ids?:    number[]        // testes rápidos do laudo — dão baixa no estoque
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const { pdfData, tutor, telefone, sexo, raca, medico_responsavel, data_laudo,
          veterinario_id, tutor_id, pet_id, agendamento_id, preco_exame, comissao } = body
  const testesIds = Array.isArray(body.testes_ids)
    ? body.testes_ids.map(Number).filter(n => Number.isInteger(n) && n > 0)
    : []

  if (!pdfData?.nome_pet || !pdfData?.especie || !tutor || !telefone) {
    return NextResponse.json({ error: 'Campos obrigatórios ausentes.' }, { status: 400 })
  }
  if (!pdfData.resultados?.length) {
    return NextResponse.json({ error: 'Nenhum resultado informado.' }, { status: 400 })
  }

  // Evita laudo duplicado para o mesmo agendamento + tipo de exame
  if (agendamento_id && await jaTemLaudo(agendamento_id, 'Teste Rápido')) {
    return NextResponse.json({ error: 'Este agendamento já possui um laudo de Teste Rápido.' }, { status: 409 })
  }

  try {
    const pdfBuffer    = await generateTesteRapidoPDF(pdfData)
    const token        = uuidv4()
    const filename     = `${token}.pdf`
    const originalName = `laudo_teste_rapido_${pdfData.nome_pet.replace(/\s+/g, '_')}.pdf`

    await savePdf(filename, pdfBuffer)

    const { data, error } = await supabase
      .from('laudos')
      .insert({
        nome_pet:           pdfData.nome_pet,
        especie:            pdfData.especie,
        tutor,
        telefone,
        token,
        filename,
        original_name:      originalName,
        tipo:               'gerado',
        sexo,
        raca,
        medico_responsavel,
        idade:              pdfData.idade,
        data_laudo,
        texto:              JSON.stringify(pdfData.resultados),
        veterinario_id,
        tipo_exame:         'Teste Rápido',
        system_user_id:     session.userId,
        agendamento_id,
        tutor_id,
        pet_id,
        preco_exame:        preco_exame ?? null,
        custo_exame:        null,
        valor_comissao:     comissao ?? null,
      })
      .select('*, veterinarios(nome), system_users(nome)')
      .single()

    if (error) {
      await deletePdf(filename)
      throw new Error(error.message)
    }

    // Baixa de estoque + custo do laudo. Nunca derruba a emissão: o laudo já
    // está salvo, então uma falha aqui só fica registrada no log.
    try {
      data.custo_exame = await baixarConsumoLaudo(data.id, testesIds, session.userId)
    } catch (err) {
      console.error(`[gerar-teste-rapido] falha na baixa de estoque do laudo ${data.id}:`, err)
    }

    // Conclui o agendamento quando todos os laudos foram emitidos
    if (agendamento_id) {
      const [{ data: totalLaudos }, { data: totalExames }] = await Promise.all([
        supabase.from('laudos').select('id').eq('agendamento_id', agendamento_id),
        supabase.from('agendamento_exames').select('id').eq('agendamento_id', agendamento_id),
      ])
      const laudosTotal = totalLaudos?.length ?? 0
      const examesTotal = Math.max(1, totalExames?.length ?? 0)
      if (laudosTotal >= examesTotal) {
        await supabase.from('agendamentos').update({ status: 'concluído' }).eq('id', agendamento_id)
      }
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    console.error('[gerar-teste-rapido] erro:', err)
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    return NextResponse.json({ error: `Falha ao gerar o PDF: ${msg}` }, { status: 500 })
  }
}
