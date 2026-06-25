-- Migration: configuracoes_agente.exames_nao_agendaveis — exames que a BioPet
-- realiza mas a IA NÃO pode agendar (ex.: bioquímica, ainda não funcional pelo
-- bot). Nesses casos a IA informa que a BioPet faz o exame, mas que o
-- agendamento é com um atendente (aciona transferir_humano).
-- Lista de nomes (tipo_exame), editável no painel /admin/configuracoes/agente.
-- Aplicar em DEV (teozyceggokmsrmuitnj) e depois PRD.

ALTER TABLE configuracoes_agente
  ADD COLUMN IF NOT EXISTS exames_nao_agendaveis JSONB NOT NULL DEFAULT '[]'::jsonb;
