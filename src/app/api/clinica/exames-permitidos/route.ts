import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'
import { parseClinicaSession, CLINICA_COOKIE_NAME } from '@/lib/clinica-auth'

export async function GET() {
  const token = (await cookies()).get(CLINICA_COOKIE_NAME)?.value
  if (!token) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  const session = await parseClinicaSession(token)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  const { data: perms, error } = await supabase
    .from('clinica_exames_permitidos')
    .select('tipo_exame')
    .eq('clinica_id', session.clinicaId)
    .order('tipo_exame')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const tipos = (perms ?? []).map(p => p.tipo_exame)

  const { data: comissoes } = await supabase
    .from('comissoes_exame')
    .select(
      'tipo_exame, duracao_minutos, varia_por_horario, preco_exame, ' +
      'preco_pix_comercial, preco_cartao_comercial, ' +
      'preco_pix_fora_horario, preco_cartao_fora_horario'
    )
    .in('tipo_exame', tipos.length > 0 ? tipos : ['__nenhum__'])

  const exames = tipos.map(tipo => {
    const c = (comissoes ?? []).find(x => x.tipo_exame === tipo)
    const varia = c?.varia_por_horario ?? false
    return {
      tipo_exame:           tipo,
      duracao_minutos:      c?.duracao_minutos          ?? 30,
      varia_por_horario:    varia,
      valor_pix:            varia ? (c?.preco_pix_comercial    ?? null) : (c?.preco_exame ?? null),
      valor_cartao:         varia ? (c?.preco_cartao_comercial ?? null) : (c?.preco_exame ?? null),
      valor_especial_pix:   varia ? (c?.preco_pix_fora_horario    ?? null) : null,
      valor_especial_cartao:varia ? (c?.preco_cartao_fora_horario ?? null) : null,
    }
  })

  return NextResponse.json({ exames })
}
