-- Migration v29: desconto por exame no agendamento
-- O desconto é em R$, aplicado por exame, apenas por admin.
-- Semântica: agendamento_exames.valor passa a ser o valor LÍQUIDO (preço - desconto);
-- agendamento_exames.desconto guarda o desconto aplicado (para exibição/rastreio).
-- agendamentos.valor continua sendo a soma dos valores líquidos.
-- Registros existentes ficam com desconto 0 (valor inalterado).

ALTER TABLE agendamento_exames
  ADD COLUMN IF NOT EXISTS desconto NUMERIC(10,2) NOT NULL DEFAULT 0;
