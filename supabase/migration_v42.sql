-- Migration v42: Labs Parceiros — Fase 5 (Estoque de insumos)
--
-- Fecha o custo real do envio: custo_lab + frete + insumos (tubo, isopor,
-- gelo, etiqueta). Versão enxuta -- sem lote, validade, fornecedor ou ordem
-- de compra (tubo e isopor não vencem, gelo é reutilizável). Ver
-- LABS_PARCEIROS.md seção "Estoque de insumos e custo real do envio".
--
-- insumos.cor_tubo liga um insumo tipo='tubo' ao cor_tubo NORMALIZADO dos
-- itens do pedido (mesma normalização de lab-tubos.ts normalizarCorTubo) --
-- é assim que a baixa automática sabe qual insumo debitar quando um tubo
-- físico é consolidado.
--
-- caixa_preset.kit_json é um array [{insumo_id, quantidade}, ...] -- o que
-- baixa do estoque quando aquele preset de caixa é usado num envio.

CREATE TABLE IF NOT EXISTS insumos (
  id             SERIAL PRIMARY KEY,
  nome           TEXT NOT NULL,
  tipo           TEXT NOT NULL,               -- 'tubo' | 'caixa' | 'outro'
  cor_tubo       TEXT,                        -- só p/ tipo='tubo' (cor_tubo normalizado)
  unidade        TEXT NOT NULL DEFAULT 'un',
  custo_unitario NUMERIC(10,2) NOT NULL DEFAULT 0,   -- último custo (rollup de custo real)
  estoque_atual  NUMERIC(12,2) NOT NULL DEFAULT 0,   -- saldo mantido junto com insumo_movimento
  estoque_minimo NUMERIC(12,2) NOT NULL DEFAULT 0,   -- gatilho de alerta de reposição
  ativo          BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS insumo_movimento (
  id             SERIAL PRIMARY KEY,
  insumo_id      INTEGER NOT NULL REFERENCES insumos(id),
  tipo           TEXT NOT NULL,               -- 'entrada' | 'saida' | 'ajuste'
  quantidade     NUMERIC(12,2) NOT NULL,      -- entrada/saida: sempre positiva; ajuste: delta com sinal
  custo_unitario NUMERIC(10,2),               -- gravado na entrada (compra)
  pedido_id      INTEGER REFERENCES pedido_lab(id),  -- quando a saída vem de um pedido
  motivo         TEXT,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS caixa_preset (
  id             SERIAL PRIMARY KEY,
  nome           TEXT NOT NULL UNIQUE,        -- 'P' | 'M' | 'G'
  altura_cm      NUMERIC(6,2) NOT NULL,
  largura_cm     NUMERIC(6,2) NOT NULL,
  comprimento_cm NUMERIC(6,2) NOT NULL,
  peso_kg        NUMERIC(6,2) NOT NULL,
  kit_json       JSONB,                       -- [{"insumo_id": 1, "quantidade": 1}, ...]
  ativo          BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS insumo_movimento_insumo_idx ON insumo_movimento (insumo_id);
CREATE INDEX IF NOT EXISTS insumo_movimento_pedido_idx ON insumo_movimento (pedido_id);

-- Preset "M" com as mesmas dimensões que a Fase 4 já usava fixo (chute de
-- mercado, sem medida real ainda) -- passa a vir do banco em vez de hardcode,
-- então dá pra ajustar sem deploy assim que tiver a medida certa.
INSERT INTO caixa_preset (nome, altura_cm, largura_cm, comprimento_cm, peso_kg, kit_json)
VALUES ('M', 20, 20, 20, 1.5, '[]'::jsonb)
ON CONFLICT (nome) DO NOTHING;

-- Mesmo padrão do resto do sistema: acesso 100% service-role server-side.
-- RLS ligado sem policy é intencional (ver project_supabase_rls).
ALTER TABLE insumos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE insumo_movimento ENABLE ROW LEVEL SECURITY;
ALTER TABLE caixa_preset     ENABLE ROW LEVEL SECURITY;
