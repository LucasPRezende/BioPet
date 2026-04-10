import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'
import { parseSystemSession } from '@/lib/system-auth'
import {
  hashPassword,
  gerarSenhaTemporaria,
  gerarTokenConvite,
} from '@/lib/clinica-auth'
import { sendClinicaInvite } from '@/lib/evolution'

async function requireAdmin() {
  const cookie = (await cookies()).get('sys_session')?.value
  if (!cookie) return null
  const session = await parseSystemSession(cookie)
  if (!session || session.role !== 'admin') return null
  return session
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  const { id } = await params
  const clinicaId = parseInt(id)
  if (isNaN(clinicaId)) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })

  const body = await request.json()
  const { nome, email, telefone, endereco, ativo, vet_ids, resetar_senha } = body

  const updates: Record<string, unknown> = {}
  if (nome     !== undefined) updates.nome     = nome.trim()
  if (email    !== undefined) updates.email    = email.toLowerCase().trim()
  if (telefone !== undefined) updates.telefone = telefone.trim()
  if (endereco !== undefined) updates.endereco = endereco.trim()
  if (ativo    !== undefined) updates.ativo    = ativo

  let novaSenha: string | undefined
  let novoToken: string | undefined

  if (resetar_senha) {
    novaSenha        = gerarSenhaTemporaria()
    novoToken        = gerarTokenConvite()
    updates.senha_hash     = await hashPassword(novaSenha)
    updates.token_convite  = novoToken
    updates.convite_aceito = false
  }

  const { data: clinica, error } = await supabase
    .from('clinicas')
    .update(updates)
    .eq('id', clinicaId)
    .select('id, nome, email, telefone, endereco, convite_aceito, ativo')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Atualiza vínculos de vets (zera todos e redefine)
  if (Array.isArray(vet_ids)) {
    // Remove clínica de todos vets que tinham essa clínica
    await supabase
      .from('veterinarios')
      .update({ clinica_id: null })
      .eq('clinica_id', clinicaId)

    // Vincula os selecionados
    if (vet_ids.length > 0) {
      await supabase
        .from('veterinarios')
        .update({ clinica_id: clinicaId })
        .in('id', vet_ids)
    }
  }

  // Reenvia convite se resetou senha
  if (resetar_senha && novaSenha && novoToken && clinica.telefone) {
    await sendClinicaInvite(clinica.telefone, clinica.nome, novoToken, novaSenha)
  }

  return NextResponse.json({ success: true, clinica })
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Rota POST /:id → reenviar convite
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  const { id } = await params
  const clinicaId = parseInt(id)
  if (isNaN(clinicaId)) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })

  const novaSenha = gerarSenhaTemporaria()
  const novoToken = gerarTokenConvite()
  const senhaHash = await hashPassword(novaSenha)

  const { data: clinica, error } = await supabase
    .from('clinicas')
    .update({ senha_hash: senhaHash, token_convite: novoToken, convite_aceito: false })
    .eq('id', clinicaId)
    .select('nome, telefone, email')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (clinica.telefone) {
    await sendClinicaInvite(clinica.telefone, clinica.nome, novoToken, novaSenha)
  }

  return NextResponse.json({ success: true })
}
