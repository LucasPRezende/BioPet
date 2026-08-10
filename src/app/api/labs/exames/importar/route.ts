import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { parseSystemSession, SESSION_COOKIE_NAME } from '@/lib/system-auth'
import { lerAba, diffCatalogo, payloadDaLinha, type LabExameDb, type LinhaPlanilha } from '@/lib/lab-excel'

export const dynamic = 'force-dynamic'

// Importa o catálogo a partir de um Excel editado pela equipe.
//
// FormData: arquivo (xlsx) + confirmar ('1' aplica; ausente = só preview).
// Cada aba é casada com um laboratório pelo nome ('TECSA' → Tecsa etc.).
// Linhas novas são inseridas, existentes atualizadas (só as colunas presentes
// na planilha); linhas do banco que não estão na planilha são apenas
// reportadas — desativar/apagar é decisão manual na tela.
export async function POST(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  const session = cookie ? await parseSystemSession(cookie) : null
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Envie o arquivo como multipart/form-data.' }, { status: 400 })
  }
  const arquivo = form.get('arquivo')
  const confirmar = form.get('confirmar') === '1'
  if (!(arquivo instanceof File)) {
    return NextResponse.json({ error: 'Campo "arquivo" (xlsx) é obrigatório.' }, { status: 400 })
  }

  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(Buffer.from(await arquivo.arrayBuffer()), { type: 'buffer' })
  } catch {
    return NextResponse.json({ error: 'Não consegui ler o arquivo — é um .xlsx válido?' }, { status: 400 })
  }

  const [labsRes, examesRes] = await Promise.all([
    supabase.from('lab_laboratorios').select('id, nome'),
    supabase.from('lab_exames').select('*').limit(5000),
  ])
  if (labsRes.error) return NextResponse.json({ error: labsRes.error.message }, { status: 500 })
  if (examesRes.error) return NextResponse.json({ error: examesRes.error.message }, { status: 500 })
  const labs: { id: number; nome: string }[] = labsRes.data
  const existentes: LabExameDb[] = examesRes.data

  // Casa cada aba com um laboratório pelo nome.
  const erros: string[] = []
  const porLab: { lab: string; laboratorio_id: number; linhas: LinhaPlanilha[] }[] = []
  for (const nomeAba of wb.SheetNames) {
    const lab = labs.find(l =>
      nomeAba.toLowerCase().includes(l.nome.toLowerCase()) ||
      l.nome.toLowerCase().includes(nomeAba.toLowerCase()))
    if (!lab) {
      erros.push(`Aba "${nomeAba}" não corresponde a nenhum laboratório cadastrado — ignorada.`)
      continue
    }
    porLab.push({ lab: lab.nome, laboratorio_id: lab.id, linhas: lerAba(wb.Sheets[nomeAba], erros, nomeAba) })
  }
  if (porLab.length === 0) {
    return NextResponse.json({ error: 'Nenhuma aba reconhecida (esperado: TECSA, HORMONALLE...).' }, { status: 400 })
  }

  const diff = diffCatalogo(porLab, existentes, erros)

  const resumo = {
    novos: diff.novos.length,
    atualizados: diff.atualizados.length,
    iguais: diff.iguais,
    ausentes_no_excel: diff.ausentes.length,
    erros: diff.erros,
    // amostras para o preview na tela
    amostra_novos: diff.novos.slice(0, 15).map(n => `${n.lab}: ${n.linha.codigo ?? ''} ${n.linha.nome}`.trim()),
    amostra_atualizados: diff.atualizados.slice(0, 15).map(a =>
      `${a.lab}: ${a.linha.codigo ?? ''} ${a.linha.nome} (${a.mudancas.join(', ')})`.trim()),
    amostra_ausentes: diff.ausentes.slice(0, 15).map(a => `${a.lab}: ${a.codigo ?? ''} ${a.nome}`.trim()),
  }

  if (!confirmar) return NextResponse.json({ preview: true, ...resumo })

  // ── Aplica ──
  const falhas: string[] = []
  for (const { lab, id, linha } of diff.atualizados) {
    const labId = porLab.find(p => p.lab === lab)!.laboratorio_id
    const { error } = await supabase.from('lab_exames').update(payloadDaLinha(linha, labId)).eq('id', id)
    if (error) falhas.push(`Atualizar #${id} (${linha.nome}): ${error.message}`)
  }
  if (diff.novos.length) {
    const inserts = diff.novos.map(n =>
      payloadDaLinha(n.linha, porLab.find(p => p.lab === n.lab)!.laboratorio_id))
    for (let i = 0; i < inserts.length; i += 200) {
      const { error } = await supabase.from('lab_exames').insert(inserts.slice(i, i + 200))
      if (error) falhas.push(`Inserir lote: ${error.message}`)
    }
  }

  if (falhas.length) return NextResponse.json({ error: falhas.join('; '), ...resumo }, { status: 500 })
  return NextResponse.json({ aplicado: true, ...resumo })
}
