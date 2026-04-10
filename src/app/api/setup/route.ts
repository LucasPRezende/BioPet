// Endpoint de seed único — cria os admins iniciais se a tabela estiver vazia.
// Acesse /api/setup UMA VEZ após rodar a migration SQL.
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { hashPassword } from '@/lib/vet-auth'

export async function GET() {
  // Verifica se já existem usuários
  const { data: existing, error: checkError } = await supabase
    .from('system_users')
    .select('id')
    .limit(1)

  if (checkError) {
    return NextResponse.json(
      { error: 'Erro ao verificar tabela. Execute a migration SQL primeiro.' },
      { status: 500 },
    )
  }

  if (existing && existing.length > 0) {
    return NextResponse.json(
      { message: 'Setup já realizado. Usuários já existem.' },
      { status: 200 },
    )
  }

  const andrezaHash = await hashPassword('andreza123')
  const lucianaHash = await hashPassword('luciana123')

  const { error: insertError } = await supabase.from('system_users').insert([
    {
      nome: 'Andreza Moreira de Souza',
      email: 'andreza@biopet.com',
      senha_hash: andrezaHash,
      role: 'admin',
      ativo: true,
      primeira_senha: true,
    },
    {
      nome: 'Luciana Pereira de Brites',
      email: 'luciana@biopet.com',
      senha_hash: lucianaHash,
      role: 'admin',
      ativo: true,
      primeira_senha: true,
    },
  ])

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    message: 'Usuários criados com sucesso!',
    usuarios: [
      { email: 'andreza@biopet.com', senha_temporaria: 'andreza123' },
      { email: 'luciana@biopet.com', senha_temporaria: 'luciana123' },
    ],
    aviso: 'Troca de senha obrigatória no primeiro login.',
  })
}
