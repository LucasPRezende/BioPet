-- Migration v46: Pagamento de comissões com valor livre (extrato por pessoa)
--
-- Substitui a baixa "tudo ou nada" (comissao_paga item a item) por um extrato:
--
--   saldo = saldo_inicial + comissões geradas desde a data de corte − pagamentos
--
-- Cada pessoa tem UM saldo. Quando um veterinário também é usuário do sistema
-- (faz laudo), veterinarios.system_user_id aponta para o usuário e a extração
-- soma no mesmo saldo do laudo. Sem vínculo, a pessoa fica separada.
--
-- Pagamento errado não é apagado: é estornado (estornado_em), o histórico fica.
-- Pagar a mais é permitido (saldo negativo = adiantamento).
--
-- Data de corte: 01/10/2026. O que estava a pagar ANTES do corte entra no
-- saldo inicial; o que já foi baixado pelo botão antigo DEPOIS do corte entra
-- como pagamento "legado", para o saldo não nascer inflado.
--
-- Roda uma vez. Idempotente: pode ser reexecutada sem duplicar nada.

-- ── 1. Vínculo veterinário ↔ usuário ─────────────────────────────────────────
ALTER TABLE veterinarios
  ADD COLUMN IF NOT EXISTS system_user_id INTEGER REFERENCES system_users(id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_veterinarios_system_user
  ON veterinarios(system_user_id) WHERE system_user_id IS NOT NULL;

-- Único vínculo conhecido: Lucas Orgal (vet responsável que também faz laudo).
-- Só vincula se houver exatamente 1 vet e 1 usuário com esse nome.
DO $$
DECLARE
  v_vets  INTEGER;
  v_users INTEGER;
BEGIN
  SELECT count(*) INTO v_vets  FROM veterinarios WHERE nome ILIKE '%lucas%orgal%';
  SELECT count(*) INTO v_users FROM system_users WHERE nome ILIKE '%lucas%orgal%';

  IF v_vets = 1 AND v_users = 1 THEN
    UPDATE veterinarios
       SET system_user_id = (SELECT id FROM system_users WHERE nome ILIKE '%lucas%orgal%')
     WHERE nome ILIKE '%lucas%orgal%'
       AND system_user_id IS NULL;
  ELSE
    RAISE NOTICE 'Vinculo Lucas Orgal NAO feito: % vet(s) e % usuario(s) com esse nome. Vincular manualmente.', v_vets, v_users;
  END IF;
END $$;

-- ── 2. Pagamentos ────────────────────────────────────────────────────────────
-- pessoa_tipo = 'usuario'     → pessoa_id é system_users.id (inclui vets vinculados)
-- pessoa_tipo = 'veterinario' → pessoa_id é veterinarios.id (vet sem usuário)
CREATE TABLE IF NOT EXISTS pagamentos_comissao (
  id               SERIAL PRIMARY KEY,
  pessoa_tipo      TEXT          NOT NULL CHECK (pessoa_tipo IN ('usuario', 'veterinario')),
  pessoa_id        INTEGER       NOT NULL,
  valor            NUMERIC(10,2) NOT NULL CHECK (valor > 0),
  pago_em          DATE          NOT NULL DEFAULT CURRENT_DATE,
  forma            TEXT,
  observacao       TEXT,
  criado_por       INTEGER       REFERENCES system_users(id),
  criado_em        TIMESTAMP     NOT NULL DEFAULT NOW(),
  estornado_em     TIMESTAMP,
  estornado_por    INTEGER       REFERENCES system_users(id),
  estornado_motivo TEXT,
  CONSTRAINT chk_estorno_motivo CHECK (estornado_em IS NULL OR estornado_motivo IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_pagamentos_comissao_pessoa
  ON pagamentos_comissao(pessoa_tipo, pessoa_id, pago_em);

-- ── 3. Saldo inicial (a pagar antes do corte) ────────────────────────────────
CREATE TABLE IF NOT EXISTS saldo_inicial_comissao (
  id          SERIAL PRIMARY KEY,
  pessoa_tipo TEXT          NOT NULL CHECK (pessoa_tipo IN ('usuario', 'veterinario')),
  pessoa_id   INTEGER       NOT NULL,
  valor       NUMERIC(10,2) NOT NULL,
  data_corte  DATE          NOT NULL,
  criado_em   TIMESTAMP     NOT NULL DEFAULT NOW(),
  UNIQUE (pessoa_tipo, pessoa_id)
);

-- Acesso é 100% service role server-side; RLS ligado sem policy (como as demais).
ALTER TABLE pagamentos_comissao      ENABLE ROW LEVEL SECURITY;
ALTER TABLE saldo_inicial_comissao   ENABLE ROW LEVEL SECURITY;

-- ── 4. Carga inicial ─────────────────────────────────────────────────────────
-- Comissões por pessoa, já na chave final (vet vinculado cai no 'usuario').
-- Laudo: só quem recebe comissão. Extração: só com vet atribuído.
-- (CTE em vez de tabela temporária: tabela temp não aceita RLS e o editor
--  do Supabase reclama de tabela sem RLS.)

-- 4a. A pagar antes do corte → saldo inicial
INSERT INTO saldo_inicial_comissao (pessoa_tipo, pessoa_id, valor, data_corte)
WITH comissoes AS (
  SELECT 'usuario'::TEXT AS pessoa_tipo, l.system_user_id AS pessoa_id,
         l.valor_comissao AS valor, l.criado_em::DATE AS data_ref,
         l.comissao_paga, l.comissao_paga_em::DATE AS pago_em
    FROM laudos l
    JOIN system_users su ON su.id = l.system_user_id
   WHERE su.recebe_comissao IS DISTINCT FROM FALSE
     AND COALESCE(l.valor_comissao, 0) > 0
  UNION ALL
  SELECT CASE WHEN v.system_user_id IS NOT NULL THEN 'usuario' ELSE 'veterinario' END,
         COALESCE(v.system_user_id, v.id),
         a.comissao_extracao, a.data_hora::DATE, a.comissao_paga, a.comissao_paga_em::DATE
    FROM agendamentos a
    JOIN veterinarios v ON v.id = a.vet_extracao_id
   WHERE COALESCE(a.comissao_extracao, 0) > 0
)
SELECT pessoa_tipo, pessoa_id, SUM(valor), DATE '2026-10-01'
  FROM comissoes
 WHERE data_ref < DATE '2026-10-01'
   AND comissao_paga = FALSE
 GROUP BY pessoa_tipo, pessoa_id
ON CONFLICT (pessoa_tipo, pessoa_id) DO NOTHING;

-- 4b. Já baixado pelo botão antigo, mas gerado a partir do corte → pagamento legado
INSERT INTO pagamentos_comissao (pessoa_tipo, pessoa_id, valor, pago_em, forma, observacao)
WITH comissoes AS (
  SELECT 'usuario'::TEXT AS pessoa_tipo, l.system_user_id AS pessoa_id,
         l.valor_comissao AS valor, l.criado_em::DATE AS data_ref,
         l.comissao_paga, l.comissao_paga_em::DATE AS pago_em
    FROM laudos l
    JOIN system_users su ON su.id = l.system_user_id
   WHERE su.recebe_comissao IS DISTINCT FROM FALSE
     AND COALESCE(l.valor_comissao, 0) > 0
  UNION ALL
  SELECT CASE WHEN v.system_user_id IS NOT NULL THEN 'usuario' ELSE 'veterinario' END,
         COALESCE(v.system_user_id, v.id),
         a.comissao_extracao, a.data_hora::DATE, a.comissao_paga, a.comissao_paga_em::DATE
    FROM agendamentos a
    JOIN veterinarios v ON v.id = a.vet_extracao_id
   WHERE COALESCE(a.comissao_extracao, 0) > 0
)
SELECT m.pessoa_tipo, m.pessoa_id, SUM(m.valor),
       COALESCE(MAX(m.pago_em), CURRENT_DATE),
       'legado', 'Baixa feita antes do novo controle de pagamentos'
  FROM comissoes m
 WHERE m.data_ref >= DATE '2026-10-01'
   AND m.comissao_paga = TRUE
   AND NOT EXISTS (
     SELECT 1 FROM pagamentos_comissao p
      WHERE p.pessoa_tipo = m.pessoa_tipo AND p.pessoa_id = m.pessoa_id AND p.forma = 'legado'
   )
 GROUP BY m.pessoa_tipo, m.pessoa_id;

-- ── 5. Conferência (só leitura) ──────────────────────────────────────────────
-- Saldo inicial por pessoa: confira antes de ligar a tela nova.
SELECT s.pessoa_tipo,
       s.pessoa_id,
       COALESCE(su.nome, v.nome) AS nome,
       s.valor                   AS saldo_inicial,
       s.data_corte
  FROM saldo_inicial_comissao s
  LEFT JOIN system_users su ON s.pessoa_tipo = 'usuario'     AND su.id = s.pessoa_id
  LEFT JOIN veterinarios v  ON s.pessoa_tipo = 'veterinario' AND v.id  = s.pessoa_id
 ORDER BY s.valor DESC;
