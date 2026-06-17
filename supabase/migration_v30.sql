-- Migration v30: confirmação de pagamento das comissões de laudo
-- Cada laudo passa a registrar se sua comissão foi paga (marcação por lote:
-- pessoa + período faz UPDATE em massa nos laudos do intervalo).
-- Extrações e repasses de clínica já têm sua própria confirmação.

ALTER TABLE laudos
  ADD COLUMN IF NOT EXISTS comissao_paga    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS comissao_paga_em TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_laudos_comissao_paga ON laudos(comissao_paga);
