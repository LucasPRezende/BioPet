-- Migration v22: Dashboard refactor — campos de controle de laudo e repasse de clínica

-- Permite marcar agendamentos onde laudo foi dispensado (gratuitos, casos pontuais)
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS laudo_dispensado   BOOLEAN    DEFAULT FALSE;

-- Rastrear repasse de valores de clínica para BioPet (operação em lote)
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS repasse_confirmado BOOLEAN    DEFAULT FALSE;
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS repasse_em         TIMESTAMPTZ;

-- Índice para acelerar consultas de alertas de laudo pendente
CREATE INDEX IF NOT EXISTS idx_agendamentos_laudo_dispensado ON agendamentos(laudo_dispensado) WHERE laudo_dispensado = FALSE;
CREATE INDEX IF NOT EXISTS idx_agendamentos_repasse ON agendamentos(clinica_id, repasse_confirmado) WHERE clinica_id IS NOT NULL;
