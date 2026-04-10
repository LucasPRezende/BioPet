-- ============================================================
-- BioPet — Migration v2: Snapshot financeiro + preço/custo
-- Execute no SQL Editor do Supabase APÓS a migration v1
-- ============================================================

-- 1. Adicionar preço e custo na tabela de comissões
ALTER TABLE comissoes_exame ADD COLUMN IF NOT EXISTS preco_exame  NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE comissoes_exame ADD COLUMN IF NOT EXISTS custo_exame  NUMERIC(10,2) NOT NULL DEFAULT 0;

-- 2. Snapshot financeiro nos laudos (preserva histórico ao mudar valores)
ALTER TABLE laudos ADD COLUMN IF NOT EXISTS valor_comissao NUMERIC(10,2);
ALTER TABLE laudos ADD COLUMN IF NOT EXISTS preco_exame    NUMERIC(10,2);
ALTER TABLE laudos ADD COLUMN IF NOT EXISTS custo_exame    NUMERIC(10,2);
