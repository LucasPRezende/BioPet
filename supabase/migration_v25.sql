-- Migration v25: flag para laudos sem agendamento justificados
--
-- Laudos gerados fora de um agendamento (ex: recuperação de dados, laudo avulso)
-- podem ser marcados como agendamento_dispensado = true pelo admin.
-- O alerta do dashboard ignora esses laudos.

ALTER TABLE laudos ADD COLUMN IF NOT EXISTS agendamento_dispensado BOOLEAN DEFAULT FALSE;
