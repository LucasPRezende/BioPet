-- Migration v10: Sistema de agendamento por clínicas parceiras

-- Exames permitidos por clínica (BioPet define quais cada clínica pode agendar)
CREATE TABLE IF NOT EXISTS clinica_exames_permitidos (
  id         SERIAL PRIMARY KEY,
  clinica_id INTEGER REFERENCES clinicas(id) ON DELETE CASCADE,
  tipo_exame TEXT NOT NULL,
  criado_em  TIMESTAMP DEFAULT NOW(),
  UNIQUE(clinica_id, tipo_exame)
);

-- Adiciona origem e clinica_id nos agendamentos
ALTER TABLE agendamentos
  ADD COLUMN IF NOT EXISTS origem     TEXT DEFAULT 'agente',
  ADD COLUMN IF NOT EXISTS clinica_id INTEGER REFERENCES clinicas(id);

-- Valores de origem: 'agente' | 'clinica' | 'manual'
-- Agendamentos pela clínica iniciam com status 'pendente'
