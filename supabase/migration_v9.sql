-- Migration v9: tipo_evento e agendamento_id em notificacoes

ALTER TABLE notificacoes
  ADD COLUMN IF NOT EXISTS tipo_evento    TEXT,
  ADD COLUMN IF NOT EXISTS agendamento_id INTEGER REFERENCES agendamentos(id);

-- tipo_evento: 'ia_travou' | 'pergunta_laudo' | 'pergunta_tecnica' | 'erro_tecnico'
--              'agendamento' | 'remarcacao' | 'cancelamento'
-- NULL = notificações antigas (tratadas como 'requer atenção')
