-- Migration v19: Comissões de extração para hemogasimetria

ALTER TABLE agendamentos
  ADD COLUMN IF NOT EXISTS vet_extracao_id   INTEGER REFERENCES veterinarios(id),
  ADD COLUMN IF NOT EXISTS comissao_extracao NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS comissao_paga     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS comissao_paga_em  TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_agendamentos_vet_extracao ON agendamentos(vet_extracao_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_comissao_paga ON agendamentos(comissao_paga);
