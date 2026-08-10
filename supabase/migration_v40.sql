-- Migration v40: Labs Parceiros — Fase 2 (Pedidos)
--
-- Cria o pedido de encaminhamento a laboratório parceiro e seus itens, com
-- snapshot de preço (mesmo racional de agendamento_exames/agendamento_bioquimica)
-- conforme LABS_PARCEIROS.md e LABS_PARCEIROS_FASE2.md.
--
-- Máquina de estados do campo status:
--   rascunho -> confirmado -> coleta_agendada -> coletado -> enviado -> concluido
--   cancelado alcançável de qualquer estado antes de concluido
-- Fase 2 constrói até coleta_agendada/coletado. enviado/concluido ficam no
-- vocabulário para as fases seguintes (frete, resultado), sem transição ainda.
--
-- NÃO inclui pedido_lab_envio (frete, fase 4) nem lab_exame_interno_map
-- (De-Para, fase final) de propósito — fora do escopo da Fase 2.

CREATE TABLE IF NOT EXISTS pedido_lab (
  id               SERIAL PRIMARY KEY,
  tutor_id         INTEGER NOT NULL REFERENCES tutores(id),
  pet_id           INTEGER NOT NULL REFERENCES pets(id),
  origem           TEXT NOT NULL,          -- 'vet' | 'clinica' | 'admin'
  tipo_cobranca    TEXT NOT NULL,          -- 'parceiro' | 'cliente' (derivado da origem, mas gravado)
  clinica_id       INTEGER REFERENCES clinicas(id),
  vet_id           INTEGER REFERENCES veterinarios(id),
  agendamento_id   INTEGER REFERENCES agendamentos(id),   -- compromisso de coleta
  status           TEXT NOT NULL DEFAULT 'rascunho',
  valor_total      NUMERIC(10,2),
  status_pagamento TEXT NOT NULL DEFAULT 'pendente',      -- pendente|a_receber|pago|pago_clinica
  observacoes      TEXT,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pedido_lab_item (
  id                 SERIAL PRIMARY KEY,
  pedido_id          INTEGER NOT NULL REFERENCES pedido_lab(id) ON DELETE CASCADE,
  lab_exame_id       INTEGER NOT NULL REFERENCES lab_exames(id),
  laboratorio_id     INTEGER NOT NULL REFERENCES lab_laboratorios(id),  -- desnormalizado p/ agrupar remessa
  codigo             TEXT,      -- snapshot
  nome               TEXT NOT NULL,  -- snapshot
  cor_tubo           TEXT,      -- snapshot (drive da consolidação de tubos)
  material_tipo      TEXT,      -- snapshot
  material_volume_ml NUMERIC(6,2),
  custo_snapshot     NUMERIC(10,2),
  preco_snapshot     NUMERIC(10,2)   -- o que foi efetivamente cobrado (cliente ou parceiro)
);

CREATE INDEX IF NOT EXISTS pedido_lab_status_idx     ON pedido_lab (status);
CREATE INDEX IF NOT EXISTS pedido_lab_tutor_idx      ON pedido_lab (tutor_id);
CREATE INDEX IF NOT EXISTS pedido_lab_item_pedido_idx ON pedido_lab_item (pedido_id);
CREATE INDEX IF NOT EXISTS pedido_lab_item_lab_idx    ON pedido_lab_item (laboratorio_id);

-- Mesmo padrão do resto do sistema: acesso 100% service-role server-side.
-- RLS ligado sem policy é intencional (ver project_supabase_rls).
ALTER TABLE pedido_lab      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedido_lab_item ENABLE ROW LEVEL SECURITY;
