-- Migration: configuracoes_agente.faq — FAQ/orientações editáveis da IA.
-- Texto livre (como pagar online, PIX/cartão, validade do link, etc.) que a IA
-- usa como base de conhecimento para dúvidas operacionais, editável no painel
-- /admin/configuracoes/agente sem precisar de deploy.
-- Aplicar em DEV (teozyceggokmsrmuitnj) e depois PRD.

ALTER TABLE configuracoes_agente ADD COLUMN IF NOT EXISTS faq TEXT;
