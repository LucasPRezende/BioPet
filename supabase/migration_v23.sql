-- Migration v23: adicionar atualizado_em em veterinarios

ALTER TABLE veterinarios ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ;
