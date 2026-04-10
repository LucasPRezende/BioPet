import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// Rota pública — sem autenticação
export async function GET() {
  const { data, error } = await supabase
    .from('comissoes_exame')
    .select('tipo_exame, preco_exame, preco_pix_comercial, preco_cartao_comercial, preco_pix_fora_horario, preco_cartao_fora_horario, varia_por_horario, duracao_minutos, observacao')
    .order('tipo_exame')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const exames = (data ?? []).map(e => {
    if (e.varia_por_horario) {
      return {
        tipo:               e.tipo_exame,
        varia_por_horario:  true,
        horario_comercial: {
          pix:       e.preco_pix_comercial,
          cartao_3x: e.preco_cartao_comercial,
        },
        fora_horario: {
          pix:       e.preco_pix_fora_horario,
          cartao_3x: e.preco_cartao_fora_horario,
        },
        duracao_minutos: e.duracao_minutos,
        observacao:      e.observacao,
      }
    }
    return {
      tipo:              e.tipo_exame,
      varia_por_horario: false,
      pix:               e.preco_exame ?? e.preco_pix_comercial,
      cartao_3x:         e.preco_cartao_comercial,
      duracao_minutos:   e.duracao_minutos,
      observacao:        e.observacao,
    }
  })

  return NextResponse.json({
    horario_comercial: 'Segunda a Sexta, 9h às 16h30',
    exames,
  })
}
