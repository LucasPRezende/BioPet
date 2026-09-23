import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyAgentOrSystemSession } from '@/lib/agent-auth'

export const dynamic = 'force-dynamic'

// Tabela de preços: lida pelo agente (chave) e pela tela de admin (sessão).
// Já foi aberta à internet — não é informação para ficar pública.
export async function GET(request: NextRequest) {
  if (!(await verifyAgentOrSystemSession(request))) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const [{ data, error }, { data: bioData }] = await Promise.all([
    supabase
      .from('comissoes_exame')
      .select('tipo_exame, preco_pix_comercial, preco_cartao_comercial, preco_pix_fora_horario, preco_cartao_fora_horario, varia_por_horario, duracao_minutos, observacao')
      .order('tipo_exame'),
    supabase
      .from('bioquimica_exames')
      .select('nome, codigo, preco_pix, preco_cartao')
      .eq('ativo', true)
      .order('ordem', { ascending: true }),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const exames = (data ?? []).map(e => {
    if (e.varia_por_horario) {
      return {
        tipo:               e.tipo_exame,
        varia_por_horario:  true,
        horario_comercial: {
          pix:       e.preco_pix_comercial,
          cartao_total: e.preco_cartao_comercial,
        },
        fora_horario: {
          pix:          e.preco_pix_fora_horario,
          cartao_total: e.preco_cartao_fora_horario,
        },
        duracao_minutos: e.duracao_minutos,
        observacao:      e.observacao,
      }
    }
    return {
      tipo:              e.tipo_exame,
      varia_por_horario: false,
      pix:               e.preco_pix_comercial,
      cartao_total:      e.preco_cartao_comercial,
      duracao_minutos:   e.duracao_minutos,
      observacao:        e.observacao,
    }
  })

  return NextResponse.json({
    horario_comercial: 'Segunda a Sexta, 9h às 16h30',
    nota_horario_comercial: 'O limite de 16h30 é quando o exame precisa estar FINALIZADO, não é um horário seguro pra começar — um exame que começa às 16h30 pode terminar depois disso e já não ser comercial. NÃO calcule de cabeça: confie sempre no campo "especial" de cada horário de horarios_livres.',
    nota_cartao: 'cartao_total é o valor TOTAL no cartão (parcelável em até 3x sem juros) — NÃO multiplicar por 3.',
    exames,
    bioquimica: {
      descricao: 'Valores por exame individual — preço fixo independente do horário',
      exames: (bioData ?? []).map(e => ({
        nome:         e.nome,
        codigo:       e.codigo,
        pix:          e.preco_pix,
        cartao_total: e.preco_cartao,
      })),
    },
  })
}
