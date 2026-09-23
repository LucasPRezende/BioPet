-- Migration v42: Labs Parceiros — Fase 5 (caixas de envio)
--
-- ATUALIZADA em 23/09/2026: o estoque de insumos desta fase (tabelas insumos /
-- insumo_movimento) foi substituído pelo módulo único de consumíveis
-- (migrations v44/v45, lotes com custo PEPS). Tubo, isopor, gelo e etiqueta
-- agora são consumíveis; a conversão do que já existia no dev está na v46.
-- Aqui fica só o preset de caixa.
--
-- caixa_preset.kit_json é um array [{consumivel_id, quantidade}, ...] -- o que
-- baixa do estoque quando aquele preset de caixa é usado num envio.

CREATE TABLE IF NOT EXISTS caixa_preset (
  id             SERIAL PRIMARY KEY,
  nome           TEXT NOT NULL UNIQUE,        -- 'P' | 'M' | 'G'
  altura_cm      NUMERIC(6,2) NOT NULL,
  largura_cm     NUMERIC(6,2) NOT NULL,
  comprimento_cm NUMERIC(6,2) NOT NULL,
  peso_kg        NUMERIC(6,2) NOT NULL,
  kit_json       JSONB,                       -- [{"consumivel_id": 1, "quantidade": 1}, ...]
  ativo          BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- Preset "M" com as mesmas dimensões que a Fase 4 já usava fixo (chute de
-- mercado, sem medida real ainda) -- passa a vir do banco em vez de hardcode,
-- então dá pra ajustar sem deploy assim que tiver a medida certa.
INSERT INTO caixa_preset (nome, altura_cm, largura_cm, comprimento_cm, peso_kg, kit_json)
VALUES ('M', 20, 20, 20, 1.5, '[]'::jsonb)
ON CONFLICT (nome) DO NOTHING;

-- Mesmo padrão do resto do sistema: acesso 100% service-role server-side.
-- RLS ligado sem policy é intencional (ver project_supabase_rls).
ALTER TABLE caixa_preset     ENABLE ROW LEVEL SECURITY;
