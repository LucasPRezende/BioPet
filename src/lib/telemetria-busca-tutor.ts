/**
 * Telemetria TEMPORÁRIA da busca de tutor pela clínica.
 *
 * Serve para responder, com dado real em vez de palpite, duas perguntas antes
 * de decidir se a busca por nome passa a ser escopada por clínica:
 *
 *   1. Como as atendentes realmente buscam — por nome ou por telefone/CPF?
 *   2. Das buscas por nome, quantos resultados a regra de escopo esconderia?
 *
 * NÃO altera o que a rota devolve. Roda solta (sem await no caminho da
 * resposta) e engole qualquer erro: telemetria nunca pode derrubar a busca.
 *
 * PRIVACIDADE: só sai o FORMATO da busca — nunca o termo digitado, nunca
 * nome, telefone, CPF ou pet. Os ids de tutor não são logados.
 *
 * Para ler no servidor:  pm2 logs | grep busca-tutor-telemetria
 * REMOVER depois que a decisão for tomada.
 */
import { supabase } from '@/lib/supabase'

const PREFIXO = '[busca-tutor-telemetria]'

export type RamoBusca = 'nome' | 'telefone'

export interface FormatoDaBusca {
  clinicaId: number
  ramo:      RamoBusca
  /** Nº de palavras do termo — distingue "ana" de "ana paula souza". */
  palavras:  number
  /** Nº de caracteres do termo. Não o termo. */
  tamanho:   number
  /** Nº de dígitos do termo. */
  digitos:   number
  /** Quantos tutores a busca devolveu. */
  resultados: number
}

function logar(evento: object): void {
  try {
    console.log(PREFIXO, JSON.stringify({ em: new Date().toISOString(), ...evento }))
  } catch {
    /* telemetria nunca quebra a rota */
  }
}

/** Mede o formato de qualquer busca (nome ou telefone). */
export function registrarBusca(f: FormatoDaBusca): void {
  logar(f)
}

/**
 * Só para o ramo de nome: mede quantos dos tutores devolvidos a regra de
 * escopo por clínica NÃO devolveria. `escondidos: 0` significa que a correção
 * seria invisível para aquela busca.
 *
 * Dispare SEM await — o retorno é ignorado de propósito.
 */
export async function medirEscopoDoNome(
  f: FormatoDaBusca,
  idsDevolvidos: number[],
): Promise<void> {
  try {
    if (idsDevolvidos.length === 0) {
      logar({ ...f, escondidos: 0, visiveis: 0 })
      return
    }

    // Os três caminhos de vínculo tutor↔clínica (ver a correção em
    // fix/buscar-tutor-escopo-clinica): clinica_id, comissao_clinica_id e o
    // vet do encaminhamento.
    const { data: vets } = await supabase
      .from('veterinarios')
      .select('id')
      .eq('clinica_id', f.clinicaId)

    const vetIds = (vets ?? []).map(v => v.id).filter(id => Number.isInteger(id))

    const condicoes = [
      `clinica_id.eq.${f.clinicaId}`,
      `comissao_clinica_id.eq.${f.clinicaId}`,
    ]
    if (vetIds.length > 0) condicoes.push(`veterinario_id.in.(${vetIds.join(',')})`)

    const { data: vinculos } = await supabase
      .from('agendamentos')
      .select('tutor_id')
      .in('tutor_id', idsDevolvidos)
      .or(condicoes.join(','))

    const visiveis = new Set((vinculos ?? []).map(v => v.tutor_id))
    const escondidos = idsDevolvidos.filter(id => !visiveis.has(id)).length

    logar({ ...f, visiveis: visiveis.size, escondidos })
  } catch (e) {
    logar({ ...f, erro: e instanceof Error ? e.message : 'desconhecido' })
  }
}
