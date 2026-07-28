-- Migration v36: registra quem confirmou o pagamento manualmente
--
-- Hoje "Marcar pago" só vira status_pagamento = 'pago'/'pago_clinica', sem guardar
-- quem confirmou nem quando (pago_em já existe, mas só era preenchido pelo webhook
-- do Mercado Pago). Passa a preencher os dois também na confirmação manual pelo admin.

ALTER TABLE agendamentos
  ADD COLUMN IF NOT EXISTS pagamento_confirmado_por INTEGER REFERENCES system_users(id);
