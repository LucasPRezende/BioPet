-- Migration v28: descrição por estudo em agendamento_exames
-- Permite identificar cada estudo de Raio-X individualmente para emissão de laudos separados.

ALTER TABLE agendamento_exames ADD COLUMN IF NOT EXISTS descricao TEXT;
