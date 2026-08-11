-- Migration v43: Comissão de teste rápido também quando a BioPet recebe direto
--
-- Hoje `agendamentos.clinica_id` tem duplo sentido: (a) clínica que originou o
-- agendamento (self-service) e (b) clínica que cobrou do tutor e deve repasse
-- à BioPet (pagamento_responsavel='clinica'). Quando a BioPet recebe direto do
-- tutor (pagamento_responsavel='tutor'), não há como registrar que uma clínica
-- parceira ainda assim coletou o material e tem direito à comissão do teste
-- rápido — a BioPet passa a dever essa comissão à clínica (é um "a pagar",
-- o inverso do repasse, que é um "a receber").
--
-- `comissao_clinica_id` guarda essa clínica separadamente de `clinica_id`
-- para não interferir na lógica de repasse existente. O valor da comissão em
-- si não é duplicado aqui — é somado a partir de
-- agendamento_testes_rapidos.comissao (e agendamento_bioquimica.comissao)
-- na hora de montar o relatório.

ALTER TABLE agendamentos
  ADD COLUMN IF NOT EXISTS comissao_clinica_id          INTEGER REFERENCES clinicas(id),
  ADD COLUMN IF NOT EXISTS comissao_clinica_confirmada  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS comissao_clinica_em          TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_agendamentos_comissao_clinica
  ON agendamentos(comissao_clinica_id)
  WHERE comissao_clinica_id IS NOT NULL;
