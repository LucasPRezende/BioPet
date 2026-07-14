-- Migration v31: Testes Rápidos + comissão da clínica coletora
--
-- Espelha a estrutura de Bioquímica (migration_v12): um "exame guarda-chuva"
-- (Teste Rápido) com N sub-itens configuráveis, cada um com preço próprio.
-- Diferença: o resultado é qualitativo (Positivo/Negativo/etc.), não numérico.
--
-- Além disso, introduz a COMISSÃO DA CLÍNICA COLETORA (`comissao`): quanto a
-- clínica que coletou o material retém do valor do exame. Ex.: exame R$250,
-- clínica repassa R$150 → comissão da clínica = R$100. Adicionada tanto em
-- testes rápidos quanto em bioquímica (bioquímica ainda não usada, mas fica pronta).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Catálogo de sub-testes rápidos (configurável em /admin/comissoes)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS testes_rapidos (
  id                SERIAL PRIMARY KEY,
  nome              TEXT          NOT NULL,          -- ex: "Combo FIV / FeLV"
  descricao         TEXT,                            -- subtítulo do laudo, ex: "Anticorpos FIV + Antígeno FeLV"
  material_padrao   TEXT,                            -- ex: "Soro", "Fezes", "Swab conjuntival"
  metodo_padrao     TEXT,                            -- ex: "Imunocromatografia (SNAP, Idexx)"
  observacao_padrao TEXT,                            -- texto de rodapé incluído no laudo quando este teste é usado
  preco_pix         NUMERIC(10,2) NOT NULL DEFAULT 0,
  preco_cartao      NUMERIC(10,2) NOT NULL DEFAULT 0,
  comissao          NUMERIC(10,2) NOT NULL DEFAULT 0, -- comissão da clínica coletora (repasse retido pela clínica)
  ativo             BOOLEAN       DEFAULT TRUE,
  ordem             INTEGER       DEFAULT 0,
  criado_em         TIMESTAMP     DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Vínculo dos sub-testes ao agendamento (snapshot de preço + comissão)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agendamento_testes_rapidos (
  id                SERIAL PRIMARY KEY,
  agendamento_id    INTEGER REFERENCES agendamentos(id) ON DELETE CASCADE,
  teste_rapido_id   INTEGER REFERENCES testes_rapidos(id),
  valor_pix         NUMERIC(10,2) NOT NULL,
  valor_cartao      NUMERIC(10,2) NOT NULL,
  comissao          NUMERIC(10,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_agendamento_testes_rapidos_agendamento
  ON agendamento_testes_rapidos(agendamento_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Comissão da clínica coletora também na Bioquímica (paridade)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE bioquimica_exames
  ADD COLUMN IF NOT EXISTS comissao NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE agendamento_bioquimica
  ADD COLUMN IF NOT EXISTS comissao NUMERIC(10,2) NOT NULL DEFAULT 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. "Teste Rápido" como tipo de exame agendável (preço 0 — vem dos sub-testes)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO comissoes_exame (tipo_exame, preco_pix_comercial, custo_exame, valor_comissao, varia_por_horario, duracao_minutos, observacao)
VALUES ('Teste Rápido', 0, 0, 0, false, 15, 'Preço individual por teste — configurar em Preços › Teste Rápido')
ON CONFLICT (tipo_exame) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Seed com os testes da lista atual (preços/comissão zerados — preencher no painel)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO testes_rapidos (nome, descricao, material_padrao, metodo_padrao, observacao_padrao, ordem) VALUES
  ('Combo FIV / FeLV', 'Anticorpos FIV + Antígeno FeLV',                              'Soro',              'Imunocromatografia',            NULL, 1),
  ('Snap 4Dx Plus',    'Dirofilaria immitis (Ag) + Anaplasma spp., Borrelia burgdorferi, Ehrlichia spp. (Ac)', 'Sangue total', 'Imunocromatografia (SNAP, Idexx)',
    'O teste rápido para Anaplasma phagocytophilum/A. platys não diferencia essas duas espécies. Portanto, um resultado positivo indica a presença de anticorpos contra A. phagocytophilum e/ou A. platys. O teste rápido para Ehrlichia canis/E. ewingii não diferencia essas duas espécies. Assim, um resultado positivo indica a presença de anticorpos contra E. canis e/ou E. ewingii.', 2),
  ('IgG Babesia',      'Anticorpos IgG',                                               'Soro',              'Imunocromatografia',            NULL, 3),
  ('Cinomose (Ag)',    'Antígeno (Ag)',                                                'Swab conjuntival',  'Imunocromatografia',            NULL, 4),
  ('Cinomose (Ac)',    'Anticorpos (Ac)',                                              'Soro',              'Imunocromatografia',            NULL, 5),
  ('Parvovirose',      'Antígeno fecal',                                               'Fezes',             'Imunocromatografia',            NULL, 6),
  ('Giardia',          'Antígeno fecal',                                               'Fezes',             'Imunocromatografia',            NULL, 7),
  ('Leishmaniose',     'Anticorpos',                                                   'Soro',              'Imunocromatografia (DPP)',      NULL, 8),
  ('Leptospirose',     'Anticorpos',                                                   'Soro',              'Imunocromatografia',            NULL, 9)
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RLS: estas tabelas são acessadas SÓ pelo servidor (service role, que ignora
--    RLS). Ligar RLS sem policies bloqueia acesso anon/público e silencia o
--    Security Advisor do Supabase. Idempotente (habilitar de novo é no-op).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE testes_rapidos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE agendamento_testes_rapidos ENABLE ROW LEVEL SECURITY;
