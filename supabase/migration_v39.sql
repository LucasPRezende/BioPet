-- Migration v39: Labs Parceiros — Fase 1 (Catálogo)
--
-- Cria as duas tabelas-alicerce do encaminhamento para laboratórios de
-- referência (Tecsa, Hormonalle...), conforme LABS_PARCEIROS.md:
--   - lab_laboratorios: os parceiros (destino do frete, prazo padrão)
--   - lab_exames:       o catálogo (~600 exames importados do PDF de preços)
--
-- Não reaproveita comissoes_exame de propósito: aquela tabela modela exames que
-- a BioPet EXECUTA. O catálogo de parceiros tem atributos próprios (cor do tubo,
-- material, espécie, prazo, três valores) e ~600 linhas por lab.
--
-- "Sob consulta" fica fora do fluxo de pedido: sob_consulta=true aceita preço
-- nulo e o exame simplesmente não fica disponível para pedido.

CREATE TABLE IF NOT EXISTS lab_laboratorios (
  id            SERIAL PRIMARY KEY,
  nome          TEXT NOT NULL UNIQUE,
  ativo         BOOLEAN NOT NULL DEFAULT TRUE,
  endereco_json JSONB,              -- destino do frete (CEP, rua, número...)
  prazo_padrao  INTEGER,            -- dias úteis, fallback quando o exame não informa
  observacoes   TEXT,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lab_exames (
  id                 SERIAL PRIMARY KEY,
  laboratorio_id     INTEGER NOT NULL REFERENCES lab_laboratorios(id),
  codigo             TEXT,           -- código no lab (Tecsa tem, Hormonalle não)
  nome               TEXT NOT NULL,
  categoria          TEXT,           -- 'Hematologia', 'Bioquímica', 'Hormônios'...
  cor_tubo           TEXT,           -- 'Roxa', 'Azul', 'Vermelha/Amarela'...
  material_tipo      TEXT,           -- texto do PDF: '0,5 mL de soro'...
  material_volume_ml NUMERIC(6,2),
  especies           TEXT,           -- texto livre do PDF: 'Canina, felina e equina'
  prazo_dias_uteis   INTEGER,
  metodologia        TEXT,
  custo              NUMERIC(10,2),  -- o que a BioPet paga ao lab
  preco_cliente      NUMERIC(10,2),  -- cobrado no direto (custo +40% no PDF)
  preco_parceiro     NUMERIC(10,2),  -- cobrado a vet/clínica (coluna "a preencher")
  is_combo           BOOLEAN NOT NULL DEFAULT FALSE,
  sob_consulta       BOOLEAN NOT NULL DEFAULT FALSE,
  ativo              BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Código é único por lab quando existe (Hormonalle vem sem código do PDF).
CREATE UNIQUE INDEX IF NOT EXISTS lab_exames_lab_codigo_uniq
  ON lab_exames (laboratorio_id, codigo) WHERE codigo IS NOT NULL;

CREATE INDEX IF NOT EXISTS lab_exames_categoria_idx ON lab_exames (laboratorio_id, categoria);

-- Mesmo padrão do resto do sistema: acesso 100% service-role server-side.
-- RLS ligado sem policy é intencional (ver project_supabase_rls).
ALTER TABLE lab_laboratorios ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_exames       ENABLE ROW LEVEL SECURITY;

-- Seeds dos dois parceiros atuais (endereço/CEP ainda pendente — item C.11 da proposta).
INSERT INTO lab_laboratorios (nome) VALUES ('Tecsa'), ('Hormonalle')
ON CONFLICT (nome) DO NOTHING;
