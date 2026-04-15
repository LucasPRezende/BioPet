import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'
import { parseClinicaSession, CLINICA_COOKIE_NAME } from '@/lib/clinica-auth'

export async function GET() {
  const token = (await cookies()).get(CLINICA_COOKIE_NAME)?.value
  if (!token) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  const session = await parseClinicaSession(token)
  if (!session) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })

  // Exames permitidos para esta clínica
  const { data: perms, error } = await supabase
    .from('clinica_exames_permitidos')
    .select('tipo_exame')
    .eq('clinica_id', session.clinicaId)
    .order('tipo_exame')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const tipos = (perms ?? []).map(p => p.tipo_exame)

  // Duração de cada exame a partir de comissoes_exame
  const { data: comissoes } = await supabase
    .from('comissoes_exame')
    .select('tipo_exame, duracao_minutos')
    .in('tipo_exame', tipos.length > 0 ? tipos : ['__nenhum__'])

  const exames = tipos.map(tipo => ({
    tipo_exame:      tipo,
    duracao_minutos: (comissoes ?? []).find(c => c.tipo_exame === tipo)?.duracao_minutos ?? 30,
  }))

  return NextResponse.json({ exames })
}
