/**
 * lab-frete.ts — orquestra a Fase 4 (frete) por pedido: busca origem/destino,
 * cota, compra e persiste em pedido_lab_envio. A API do Melhor Envio em si
 * fica isolada em melhor-envio.ts (cliente puro) — este módulo é quem sabe
 * sobre pedido_lab/pedido_lab_item/lab_laboratorios.
 */
import { supabase } from './supabase'
import {
  type Endereco, type OpcaoFrete, enderecoOrigemBioPet,
  cotarFrete, adicionarAoCarrinho, comprarFretes, gerarEtiquetas, rastrearEnvios,
  baixarEtiquetaPdfBytes, redimensionarParaEtiqueta10x15,
} from './melhor-envio'
import { salvarEtiquetaFrete, lerEtiquetaFrete } from './etiqueta-frete-storage'
import { caixaPresetPadrao, baixarKitCaixa } from './lab-estoque'

async function enderecoLab(laboratorioId: number): Promise<{ nome: string; endereco: Endereco }> {
  const { data, error } = await supabase
    .from('lab_laboratorios').select('nome, endereco_json').eq('id', laboratorioId).single()
  if (error || !data) throw new Error('Laboratório não encontrado.')
  if (!data.endereco_json) throw new Error(`Endereço do laboratório "${data.nome}" não cadastrado — preencha em /admin/labs.`)
  return { nome: data.nome, endereco: data.endereco_json as Endereco }
}

interface LabDoPedido {
  laboratorio_id: number
  nome:           string
  valorItens:     number
}

async function labsDoPedido(pedidoId: number): Promise<LabDoPedido[]> {
  const { data, error } = await supabase
    .from('pedido_lab_item')
    .select('laboratorio_id, preco_snapshot, lab_laboratorios(nome)')
    .eq('pedido_id', pedidoId)
  if (error) throw new Error(error.message)

  const porLab = new Map<number, LabDoPedido>()
  for (const item of data ?? []) {
    const labJoin = Array.isArray(item.lab_laboratorios) ? item.lab_laboratorios[0] : item.lab_laboratorios
    const nome = (labJoin as { nome?: string } | null)?.nome ?? '?'
    const atual = porLab.get(item.laboratorio_id) ?? { laboratorio_id: item.laboratorio_id, nome, valorItens: 0 }
    atual.valorItens += item.preco_snapshot ?? 0
    porLab.set(item.laboratorio_id, atual)
  }
  return Array.from(porLab.values())
}

export interface CotacaoPorLab {
  laboratorio_id: number
  nome:           string
  opcoes:         OpcaoFrete[]
  erro?:          string
}

/** Cota o frete de cada lab presente no pedido (origem BioPet -> destino lab). */
export async function cotarFretePedido(pedidoId: number): Promise<CotacaoPorLab[]> {
  const labs = await labsDoPedido(pedidoId)
  if (labs.length === 0) throw new Error('Pedido sem itens.')

  const origem = await enderecoOrigemBioPet()
  const caixa  = await caixaPresetPadrao()
  if (!caixa) throw new Error('Nenhum preset de caixa cadastrado — configure em /admin/estoque.')
  const resultado: CotacaoPorLab[] = []

  for (const lab of labs) {
    try {
      const { endereco: destino } = await enderecoLab(lab.laboratorio_id)
      const opcoes = await cotarFrete(origem, destino, caixa.pacote, lab.valorItens)
      resultado.push({ laboratorio_id: lab.laboratorio_id, nome: lab.nome, opcoes })
    } catch (e) {
      resultado.push({
        laboratorio_id: lab.laboratorio_id, nome: lab.nome, opcoes: [],
        erro: e instanceof Error ? e.message : 'Erro ao cotar.',
      })
    }
  }
  return resultado
}

/**
 * Compra o frete pra um lab do pedido: recota (nunca confia em preço vindo do
 * front) -> carrinho -> checkout -> dispara a geração da etiqueta -> persiste
 * em pedido_lab_envio. NÃO espera a etiqueta terminar de gerar aqui — no
 * sandbox esse passo é assíncrono e a demora variou de ~3s a mais de 1min nos
 * testes, tempo demais pra travar a compra. O PDF em si é buscado sob
 * demanda em obterEtiquetaFrete, na hora que alguém abrir o link.
 * Se depois de comprar todos os labs do pedido tiverem envio e o pedido
 * estiver "coletado", avança pra "enviado".
 */
export async function comprarFretePedido(pedidoId: number, laboratorioId: number, serviceId: number): Promise<void> {
  const origem = await enderecoOrigemBioPet()
  const { nome: nomeLab, endereco: destino } = await enderecoLab(laboratorioId)
  const labs = await labsDoPedido(pedidoId)
  const lab  = labs.find(l => l.laboratorio_id === laboratorioId)
  if (!lab) throw new Error('Este laboratório não tem itens neste pedido.')

  const caixa = await caixaPresetPadrao()
  if (!caixa) throw new Error('Nenhum preset de caixa cadastrado — configure em /admin/estoque.')

  const opcoes   = await cotarFrete(origem, destino, caixa.pacote, lab.valorItens)
  const escolhida = opcoes.find(o => o.id === serviceId)
  if (!escolhida) throw new Error('Opção de frete não encontrada — cote novamente.')
  const preco = Number(escolhida.custom_price ?? escolhida.price ?? 0)

  const item = await adicionarAoCarrinho({
    serviceId, origem, destino, pacote: caixa.pacote,
    valorSegurado: lab.valorItens, nomeProduto: `Pedido Lab #${pedidoId} - ${nomeLab}`,
  })

  await comprarFretes([item.id])
  await gerarEtiquetas([item.id])
  const etiquetaUrl = `${process.env.NEXT_PUBLIC_URL}/api/labs/pedidos/${pedidoId}/frete/${laboratorioId}/etiqueta`

  const { error } = await supabase.from('pedido_lab_envio').upsert({
    pedido_id:       pedidoId,
    laboratorio_id:  laboratorioId,
    melhor_envio_id: item.id,
    transportadora:  escolhida.name,
    valor_frete:     preco,
    etiqueta_url:    etiquetaUrl,
    status_envio:    'comprado',
  }, { onConflict: 'pedido_id,laboratorio_id' })
  if (error) throw new Error(`Falha ao salvar envio: ${error.message}`)

  // Baixa o kit de insumos da caixa usada (isopor, gelo, etiqueta...). Não
  // bloqueia a compra se o kit estiver vazio/mal configurado.
  try {
    await baixarKitCaixa(caixa.id, pedidoId)
  } catch (e) {
    console.error('[lab-frete] falha ao baixar kit de insumos:', e instanceof Error ? e.message : e)
  }

  // Avança o pedido pra "enviado" quando todos os labs tiverem envio comprado.
  const { data: envios } = await supabase.from('pedido_lab_envio').select('laboratorio_id').eq('pedido_id', pedidoId)
  const labsComEnvio = new Set((envios ?? []).map(e => e.laboratorio_id))
  const todosComEnvio = labs.every(l => labsComEnvio.has(l.laboratorio_id))
  if (todosComEnvio) {
    const { data: pedido } = await supabase.from('pedido_lab').select('status').eq('id', pedidoId).single()
    if (pedido?.status === 'coletado') {
      await supabase.from('pedido_lab').update({ status: 'enviado' }).eq('id', pedidoId)
    }
  }
}

/**
 * Busca o PDF da etiqueta pra servir — usa o arquivo já processado se existir
 * (storage local); senão checa se a Melhor Envio já terminou de gerar
 * (generated_at) e, se sim, baixa/reformata/guarda na hora. Retorna null se
 * ainda não estiver pronta (o chamador decide a mensagem — "ainda gerando,
 * tente novamente em instantes").
 */
export async function obterEtiquetaFrete(pedidoId: number, laboratorioId: number): Promise<Buffer | null> {
  const existente = await lerEtiquetaFrete(pedidoId, laboratorioId)
  if (existente) return existente

  const { data: envio } = await supabase
    .from('pedido_lab_envio')
    .select('melhor_envio_id')
    .eq('pedido_id', pedidoId).eq('laboratorio_id', laboratorioId)
    .maybeSingle()
  if (!envio?.melhor_envio_id) return null

  const status = await rastrearEnvios([envio.melhor_envio_id])
  if (!status[envio.melhor_envio_id]?.generated_at) return null

  const pdfOriginal = await baixarEtiquetaPdfBytes(envio.melhor_envio_id)
  const pdfRedimensionado = await redimensionarParaEtiqueta10x15(pdfOriginal)
  await salvarEtiquetaFrete(pedidoId, laboratorioId, pdfRedimensionado)
  return pdfRedimensionado
}
