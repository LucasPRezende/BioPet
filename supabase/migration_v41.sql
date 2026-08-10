-- Migration v41: Labs Parceiros — Fase 4 (Frete via Melhor Envio)
--
-- pedido_lab_envio: a remessa por laboratório (frete/etiqueta de postagem).
-- Um pedido pode ter itens de labs diferentes -- o frete é cotado/comprado
-- por lab, então o envio fica por (pedido_id, laboratorio_id), não no
-- cabeçalho do pedido. Ver LABS_PARCEIROS.md seção "Frete via Melhor Envio".
--
-- Repasse do frete -- decidido: absorvido pela BioPet, não repassado ao
-- solicitante. valor_frete fica registrado só pra custo real, não entra em
-- pedido_lab.valor_total.
--
-- Tokens OAuth do Melhor Envio NÃO ficam aqui -- reaproveitam a tabela
-- genérica system_config (chave/valor), já existente desde a v18.

CREATE TABLE IF NOT EXISTS pedido_lab_envio (
  id              SERIAL PRIMARY KEY,
  pedido_id       INTEGER NOT NULL REFERENCES pedido_lab(id) ON DELETE CASCADE,
  laboratorio_id  INTEGER NOT NULL REFERENCES lab_laboratorios(id),
  melhor_envio_id TEXT,             -- id do envio na API
  transportadora  TEXT,
  valor_frete     NUMERIC(10,2),    -- custo, absorvido pela BioPet (não repassado)
  etiqueta_url    TEXT,             -- PDF da etiqueta de postagem
  codigo_rastreio TEXT,
  status_envio    TEXT NOT NULL DEFAULT 'cotado',  -- cotado|comprado|postado|entregue|cancelado
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pedido_id, laboratorio_id)
);

CREATE INDEX IF NOT EXISTS pedido_lab_envio_pedido_idx ON pedido_lab_envio (pedido_id);

-- Mesmo padrão do resto do sistema: acesso 100% service-role server-side.
-- RLS ligado sem policy é intencional (ver project_supabase_rls).
ALTER TABLE pedido_lab_envio ENABLE ROW LEVEL SECURITY;
