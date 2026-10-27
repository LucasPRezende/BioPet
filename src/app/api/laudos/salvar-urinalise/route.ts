import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { gerarLaudoUrinalise, type UrinaliseEntrada } from '@/lib/generate-urinalise-pdf'
import { savePdf, deletePdf } from '@/lib/pdf-storage'
import { jaTemLaudo } from '@/lib/laudo-duplicado'
import { baixarConsumoLaudo, consumoExame } from '@/lib/estoque'
import { fitaDoExame, validarUrinalise, type TipoFita } from '@/lib/urinalise'

/**
 * Nome do exame como está cadastrado ("Urinálise (14 parâmetros)"...). A agenda,
 * o bloqueio de laudo duplicado, a comissão e o estoque comparam tipo_exame por
 * igualdade exata. Vem do exame do agendamento com o mesmo tipo de fita; sem
 * agendamento, do cadastro em Preços.
 */
async function resolverTipoExame(agendamentoId: number | null, fita: TipoFita): Promise<string> {
  if (agendamentoId) {
    const { data } = await supabase
      .from('agendamento_exames')
      .select('tipo_exame')
      .eq('agendamento_id', agendamentoId)
    const achado = (data ?? []).find(r => fitaDoExame(r.tipo_exame) === fita)
    if (achado) return achado.tipo_exame
  }
  const { data } = await supabase.from('comissoes_exame').select('tipo_exame')
  const achado = (data ?? []).find(r => fitaDoExame(r.tipo_exame) === fita)
  return achado?.tipo_exame ?? `Urinálise (${fita} parâmetros)`
}

async function getFinanceiro(tipoExame: string) {
  const { data } = await supabase
    .from('comissoes_exame')
    .select('preco_pix_comercial, comissao_laudo')
    .eq('tipo_exame', tipoExame)
    .maybeSingle()
  return {
    preco_exame:    data?.preco_pix_comercial ?? null,
    valor_comissao: data?.comissao_laudo ?? null, // só a comissão de quem fez o laudo
  }
}

export async function POST(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!cookie) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const session = await parseSystemSession(cookie)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  let body: {
    laudo:          UrinaliseEntrada
    veterinario_id: number | null
    tutor_id:       number | null
    pet_id:         number | null
    agendamento_id: number | null
  }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const { veterinario_id, tutor_id, pet_id, agendamento_id } = body
  const laudo: UrinaliseEntrada | undefined = body.laudo && {
    ...body.laudo,
    fisico:      body.laudo.fisico ?? {},
    sedimento:   body.laudo.sedimento ?? {},
    observacoes: body.laudo.observacoes ?? '',
  }
  const invalido = validarUrinalise(laudo ?? {})
  if (!laudo || invalido) return NextResponse.json({ error: invalido || 'Campos obrigatórios ausentes.' }, { status: 400 })

  const tipoExame = await resolverTipoExame(agendamento_id, laudo.fita)

  if (agendamento_id && await jaTemLaudo(agendamento_id, tipoExame)) {
    return NextResponse.json({ error: `Já existe um laudo de ${tipoExame} para este agendamento.` }, { status: 409 })
  }

  try {
    const { pdf, referencias } = await gerarLaudoUrinalise({ ...laudo, titulo: laudo.titulo || 'Urinálise' })
    const token        = uuidv4()
    const filename     = `${token}.pdf`
    const originalName = `urinalise_${laudo.nome_pet.replace(/\s+/g, '_')}.pdf`

    await savePdf(filename, pdf)

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
          fita:        laudo.fita,
          valores:     laudo.valores,
          fisico:      laudo.fisico,
          sedimento:   laudo.sedimento,
          referencias,
          observacoes: laudo.observacoes,
        }),
        veterinario_id,
        tipo_exame:         tipoExame,
        system_user_id:     session.userId,
        agendamento_id,
        tutor_id,
        pet_id,
        custo_exame:        null,
        ...await getFinanceiro(tipoExame),
      })
      .select('*, veterinarios(nome), system_users(nome)')
      .single()

    if (error) {
      await deletePdf(filename)
      throw new Error(error.message)
    }

    // Baixa da fita + custo do laudo. Nunca derruba a emissão: o laudo já está
    // salvo, então uma falha aqui só fica registrada no log.
    try {
      data.custo_exame = await baixarConsumoLaudo(data.id, await consumoExame(tipoExame), session.userId)
    } catch (err) {
      console.error(`[salvar-urinalise] falha na baixa de estoque do laudo ${data.id}:`, err)
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
    console.error('[salvar-urinalise] erro:', err)
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    return NextResponse.json({ error: `Falha ao salvar o laudo: ${msg}` }, { status: 500 })
  }
}
