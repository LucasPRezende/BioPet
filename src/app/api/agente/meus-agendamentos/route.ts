import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyAgentKey } from '@/lib/agent-auth'

const DIAS = [
  'domingo', 'segunda-feira', 'terça-feira', 'quarta-feira',
  'quinta-feira', 'sexta-feira', 'sábado',
]

function formatDataHora(isoStr: string): string {
  const [datePart, timePart = '00:00'] = isoStr.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute]     = timePart.split(':').map(Number)
  const d = new Date(year, month - 1, day, hour, minute)
  const dd = String(day).padStart(2, '0')
  const mm = String(month).padStart(2, '0')
  const hh = String(hour).padStart(2, '0')
  const minStr = minute > 0 ? `:${String(minute).padStart(2, '0')}` : ''
  return `${DIAS[d.getDay()]}, ${dd}/${mm} às ${hh}h${minStr}`
}

export async function GET(request: NextRequest) {
  if (!verifyAgentKey(request)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const telefone = request.nextUrl.searchParams.get('telefone')
  if (!telefone) {
    return NextResponse.json({ error: 'Parâmetro "telefone" é obrigatório.' }, { status: 400 })
  }

  // Normaliza telefone
  const digits  = telefone.replace(/\D/g, '')
  const telNorm = digits.startsWith('55') ? digits : `55${digits}`

  // Busca tutor pelo telefone
  const { data: tutor } = await supabase
    .from('tutores')
    .select('id')
    .or(`telefone.eq.${telNorm},telefone.eq.${digits}`)
    .limit(1)
    .single()

  if (!tutor) {
    return NextResponse.json({ agendamentos: [] })
  }

  // Busca agendamentos futuros com status ativo
  const agora = new Date().toISOString()
  const { data: rows, error } = await supabase
    .from('agendamentos')
    .select('id, tipo_exame, data_hora, status, valor, forma_pagamento, pets(nome)')
    .eq('tutor_id', tutor.id)
    .in('status', ['agendado', 'em atendimento'])
    .gt('data_hora', agora)
    .order('data_hora')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const agendamentos = (rows ?? []).map((ag) => ({
    id:              ag.id,
    pet_nome:        Array.isArray(ag.pets) ? (ag.pets[0]?.nome ?? null) : (ag.pets as { nome: string } | null)?.nome ?? null,
    tipo_exame:      ag.tipo_exame,
    data_hora:       ag.data_hora,
    data_formatada:  formatDataHora(ag.data_hora),
    status:          ag.status,
    valor:           ag.valor,
    forma_pagamento: ag.forma_pagamento,
  }))

  return NextResponse.json({ agendamentos })
}
