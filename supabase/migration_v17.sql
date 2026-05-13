-- Migration v17: Permissões por tipo de exame para system_users
-- Estrutura: { "laudos_exames": ["Raio-X", "Ultrassom"] }
-- Vazio {} = comportamento padrão (usuário vê só próprios agendamentos)
-- laudos_exames preenchido = vê todos os agendamentos com aqueles tipos

ALTER TABLE system_users ADD COLUMN IF NOT EXISTS permissoes JSONB DEFAULT '{}';
