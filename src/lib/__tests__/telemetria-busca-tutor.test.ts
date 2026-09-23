import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * A telemetria vai para produção, então precisa de duas garantias:
 *   1. a conta de "escondidos" tem que estar certa — é o número que vai
 *      decidir se a busca por nome passa a ser escopada por clínica;
 *   2. ela não pode vazar dado pessoal nem derrubar a rota.
 */

// Vet 7 é da clínica 1. Tutores 10 e 40 têm vínculo com ela; 99 não tem.
const VETERINARIOS = [
  { id: 7, clinica_id: 1 },
  { id: 8, clinica_id: 2 },
]

const AGENDAMENTOS = [
  { tutor_id: 10, clinica_id: 1,    comissao_clinica_id: null, veterinario_id: null },
  { tutor_id: 40, clinica_id: null, comissao_clinica_id: null, veterinario_id: 7    },
  { tutor_id: 99, clinica_id: null, comissao_clinica_id: null, veterinario_id: 8    },
]

let falharBanco = false

function criarQuery(tabela: string) {
  const filtros: { tipo: string; col?: string; val?: unknown; expr?: string }[] = []
  const executar = () => {
    if (falharBanco) throw new Error('banco fora do ar')
    const base = tabela === 'veterinarios' ? VETERINARIOS : AGENDAMENTOS
    const linhas = (base as Record<string, unknown>[]).filter(row =>
      filtros.every(f => {
        if (f.tipo === 'eq') return row[f.col!] === f.val
        if (f.tipo === 'in') return (f.val as unknown[]).includes(row[f.col!])
        // or: "clinica_id.eq.1,comissao_clinica_id.eq.1,veterinario_id.in.(7)"
        return f.expr!.split(/,(?![^(]*\))/).some(parte => {
          const [col, op, ...resto] = parte.split('.')
          const valor = resto.join('.')
          if (op === 'eq') return String(row[col] ?? '') === valor
          return valor.replace(/^\(|\)$/g, '').split(',').includes(String(row[col] ?? ''))
        })
      }),
    )
    return { data: linhas }
  }
  const q = {
    select() { return q },
    eq(col: string, val: unknown) { filtros.push({ tipo: 'eq', col, val }); return q },
    in(col: string, val: unknown[]) { filtros.push({ tipo: 'in', col, val }); return q },
    or(expr: string) { filtros.push({ tipo: 'or', expr }); return q },
    then: (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) =>
      Promise.resolve().then(executar).then(ok, falha),
  }
  return q
}

vi.mock('@/lib/supabase', () => ({ supabase: { from: (t: string) => criarQuery(t) } }))

import { registrarBusca, medirEscopoDoNome, type FormatoDaBusca } from '../telemetria-busca-tutor'

const BASE: FormatoDaBusca = {
  clinicaId: 1, ramo: 'nome', palavras: 1, tamanho: 3, digitos: 0, resultados: 0,
}

let logado: string[] = []

beforeEach(() => {
  falharBanco = false
  logado = []
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logado.push(args.map(String).join(' '))
  })
})
afterEach(() => vi.restoreAllMocks())

const ultimoEvento = () => JSON.parse(logado.at(-1)!.replace('[busca-tutor-telemetria] ', ''))

describe('telemetria da busca de tutor', () => {
  it('conta corretamente quantos a regra de escopo esconderia', async () => {
    // 10 (clinica_id) e 40 (vet da clínica) são visíveis; 99 não.
    await medirEscopoDoNome({ ...BASE, resultados: 3 }, [10, 40, 99])
    expect(ultimoEvento()).toMatchObject({ visiveis: 2, escondidos: 1 })
  })

  it('marca escondidos=0 quando a busca não achou nada', async () => {
    await medirEscopoDoNome(BASE, [])
    expect(ultimoEvento()).toMatchObject({ escondidos: 0, visiveis: 0 })
  })

  it('reporta escondidos=todos quando nenhum tutor é da clínica', async () => {
    await medirEscopoDoNome({ ...BASE, clinicaId: 2, resultados: 1 }, [10, 40])
    expect(ultimoEvento()).toMatchObject({ visiveis: 0, escondidos: 2 })
  })

  it('nunca lança, mesmo com o banco fora do ar', async () => {
    falharBanco = true
    await expect(medirEscopoDoNome({ ...BASE, resultados: 1 }, [10])).resolves.toBeUndefined()
    expect(ultimoEvento()).toHaveProperty('erro')
  })

  it('não loga o termo buscado nem dado pessoal', async () => {
    await medirEscopoDoNome({ ...BASE, resultados: 1 }, [10])
    registrarBusca({ ...BASE, ramo: 'telefone', digitos: 11 })

    const permitidas = [
      'em', 'clinicaId', 'ramo', 'palavras', 'tamanho', 'digitos',
      'resultados', 'visiveis', 'escondidos', 'erro',
    ]
    for (const linha of logado) {
      const evento = JSON.parse(linha.replace('[busca-tutor-telemetria] ', ''))
      expect(Object.keys(evento).every(k => permitidas.includes(k))).toBe(true)
      // Nenhum id de tutor sai no log.
      expect(JSON.stringify(evento)).not.toContain('"10"')
    }
  })
})
