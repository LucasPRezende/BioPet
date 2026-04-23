-- Migration v11: Mercado Pago + multi-exames + campos clínicos

ALTER TABLE agendamentos
  ADD COLUMN IF NOT EXISTS sedacao_necessaria    BOOLEAN  DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pet_internado         BOOLEAN  DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pagamento_responsavel TEXT     DEFAULT 'tutor',
  ADD COLUMN IF NOT EXISTS status_pagamento      TEXT     DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS mp_preference_id      TEXT,
  ADD COLUMN IF NOT EXISTS mp_payment_id         TEXT,
  ADD COLUMN IF NOT EXISTS mp_init_point         TEXT,
  ADD COLUMN IF NOT EXISTS pago_em               TIMESTAMP;

-- status_pagamento: 'pendente' | 'a_receber' | 'pago' | 'pago_clinica'
-- pagamento_responsavel: 'tutor' | 'clinica'

CREATE TABLE IF NOT EXISTS agendamento_exames (
  id             SERIAL PRIMARY KEY,
  agendamento_id INTEGER REFERENCES agendamentos(id) ON DELETE CASCADE,
  tipo_exame     TEXT    NOT NULL,
  duracao_minutos INTEGER NOT NULL,
  valor          NUMERIC(10,2) NOT NULL,
  horario_especial BOOLEAN DEFAULT FALSE
);
