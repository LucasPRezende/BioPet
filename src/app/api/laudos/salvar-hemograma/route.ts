import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { gerarLaudoHemograma, type HemogramaEntrada } from '@/lib/generate-hemograma-pdf'
import { savePdf, deletePdf } from '@/lib/pdf-storage'
import { jaTemLaudo } from '@/lib/laudo-duplicado'

const TIPO_EXAME = 'Hemograma'

async function getComissao() {
  const { data } = await supabase
    .from('comissoes_exame')
    .select('preco_pix_comercial, custo_exame, valor_comissao')
    .eq('tipo_exame', TIPO_EXAME)
    .maybeSingle()
  return {
    preco_exame:    data?.preco_pix_comercial ?? null,
    custo_exame:    data?.custo_exame    ?? null,
    valor_comissao: data?.valor_comissao ?? null,
  }
}

export async function POST(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const session = await parseSystemSession(cookie)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  let body: {
    laudo:          HemogramaEntrada
    veterinario_id: number | null
    tutor_id:       number | null
    pet_id:         number | null
    agendamento_id: number | null
  }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const { laudo, veterinario_id, tutor_id, pet_id, agendamento_id } = body

  if (!laudo?.nome_pet || !laudo?.especie) {
    return NextResponse.json({ error: 'Campos obrigatórios ausentes.' }, { status: 400 })
  }
  if (!laudo.valores || !Object.keys(laudo.valores).length) {
    return NextResponse.json({ error: 'Nenhum resultado informado.' }, { status: 400 })
  }

  if (agendamento_id && await jaTemLaudo(agendamento_id, TIPO_EXAME)) {
    return NextResponse.json({ error: 'Já existe um laudo de Hemograma para este agendamento.' }, { status: 409 })
  }

  try {
    const { pdf, referencias } = await gerarLaudoHemograma(laudo)
    const token        = uuidv4()
    const filename     = `${token}.pdf`
    const originalName = `hemograma_${laudo.nome_pet.replace(/\s+/g, '_')}.pdf`

    await savePdf(filename, pdf)

    const financeiro = await getComissao()

    const { data, error } = await supabase
      .from('laudos')
      .insert({
        nome_pet:           laudo.nome_pet,
        especie:            laudo.especie,
        tutor:              laudo.tutor,
        telefone:           laudo.telefone || '',
        token,
        filename,
        original_name:      originalName,
        tipo:               'gerado',
        sexo:               laudo.sexo,
        raca:               laudo.raca,
        medico_responsavel: laudo.medico,
        idade:              laudo.idade,
        data_laudo:         laudo.data_laudo,
        // Snapshot do que foi emitido (valores + referências usadas)
        texto:              JSON.stringify({
          valores:      laudo.valores,
          referencias,
          faixa_etaria: laudo.faixa_etaria,
          observacoes:  laudo.observacoes,
        }),
        veterinario_id,
        tipo_exame:         TIPO_EXAME,
        system_user_id:     session.userId,
        agendamento_id,
        tutor_id,
        pet_id,
        ...financeiro,
      })
      .select('*, veterinarios(nome), system_users(nome)')
      .single()

    if (error) {
      await deletePdf(filename)
      throw new Error(error.message)
    }

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
    console.error('[salvar-hemograma] erro:', err)
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    return NextResponse.json({ error: `Falha ao salvar o laudo: ${msg}` }, { status: 500 })
  }
}
