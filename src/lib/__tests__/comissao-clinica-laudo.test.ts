import { describe, it, expect } from 'vitest'
import { comissaoClinicaDoLaudo, type AgendamentoComissaoClinica } from '../comissao-exame'

// Dashboard › Por tipo de exame: comissão de clínica de cada laudo.
// Repasse (clínica cobrou do tutor) sai da receita; devida (BioPet recebeu
// direto) é custo. Mesmas condições do relatório de clínicas.

const ag = (o: Partial<AgendamentoComissaoClinica>): AgendamentoComissaoClinica => ({
  pagamento_responsavel: 'tutor', comissao_clinica_id: null, status_pagamento: 'pago', forma_pagamento: 'pix',
  agendamento_exames: [], agendamento_bioquimica: [], agendamento_testes_rapidos: [], agendamento_pcr: [], ...o,
})

describe('comissaoClinicaDoLaudo', () => {
  it('PCR cobrado pela clínica: repasse, soma os PCRs do agendamento', () => {
    const a = ag({ pagamento_responsavel: 'clinica', status_pagamento: 'pago_clinica', agendamento_pcr: [{ comissao: 100 }, { comissao: 50 }] })
    expect(comissaoClinicaDoLaudo('PCR', a)).toEqual({ valor: 150, caso: 'repasse' })
  })

  it('repasse conta mesmo antes da clínica pagar a BioPet', () => {
    const a = ag({ pagamento_responsavel: 'clinica', status_pagamento: 'pendente', agendamento_pcr: [{ comissao: 80 }] })
    expect(comissaoClinicaDoLaudo('PCR', a)).toEqual({ valor: 80, caso: 'repasse' })
  })

  it('BioPet recebeu direto e já foi pago: comissão devida', () => {
    const a = ag({ comissao_clinica_id: 7, agendamento_testes_rapidos: [{ comissao: 40 }] })
    expect(comissaoClinicaDoLaudo('Teste Rápido', a)).toEqual({ valor: 40, caso: 'devida' })
  })

  it('BioPet ainda não recebeu: não deve nada', () => {
    const a = ag({ comissao_clinica_id: 7, status_pagamento: 'pendente', agendamento_pcr: [{ comissao: 80 }] })
    expect(comissaoClinicaDoLaudo('PCR', a)).toBeNull()
  })

  it('sem clínica envolvida: nada', () => {
    expect(comissaoClinicaDoLaudo('PCR', ag({ agendamento_pcr: [{ comissao: 80 }] }))).toBeNull()
  })

  it('gratuito nunca tem comissão de clínica', () => {
    expect(comissaoClinicaDoLaudo('PCR', ag({ pagamento_responsavel: 'clinica', forma_pagamento: 'gratuito', agendamento_pcr: [{ comissao: 80 }] }))).toBeNull()
    expect(comissaoClinicaDoLaudo('PCR', ag({ comissao_clinica_id: 7, forma_pagamento: 'gratuito', agendamento_pcr: [{ comissao: 80 }] }))).toBeNull()
  })

  it('laudo avulso (sem agendamento): nada', () => {
    expect(comissaoClinicaDoLaudo('PCR', null)).toBeNull()
  })

  it('Bioquímica soma os sub-exames', () => {
    const a = ag({ pagamento_responsavel: 'clinica', agendamento_bioquimica: [{ comissao: 10 }, { comissao: 15 }] })
    expect(comissaoClinicaDoLaudo('Bioquímica', a)?.valor).toBe(25)
  })

  it('exame comum: só as linhas do próprio tipo, uma por laudo', () => {
    const a = ag({ pagamento_responsavel: 'clinica', agendamento_exames: [
      { tipo_exame: 'Raio-X', comissao_clinica: 30 }, { tipo_exame: 'Raio-X', comissao_clinica: 30 },
      { tipo_exame: 'Hemograma', comissao_clinica: 20 },
    ] })
    expect(comissaoClinicaDoLaudo('Raio-X', a)?.valor).toBe(30)
    expect(comissaoClinicaDoLaudo('Hemograma', a)?.valor).toBe(20)
    expect(comissaoClinicaDoLaudo('Ultrassom', a)).toBeNull()
  })

  it('comissão zero não aparece', () => {
    expect(comissaoClinicaDoLaudo('PCR', ag({ pagamento_responsavel: 'clinica', agendamento_pcr: [{ comissao: 0 }] }))).toBeNull()
  })
})
