-- Migration v51: PCR agendável + laudo de PCR
--
-- Pré-requisito: v50 (catálogo exames_pcr).
--
-- Mesmo modelo do Teste Rápido (migration v31): "PCR" vira um exame
-- agrupador em comissoes_exame (preço vem dos PCRs escolhidos) e cada PCR do
-- agendamento fica em agendamento_pcr, com o preço e a comissão da clínica
-- congelados no momento do agendamento.
--
-- 1. "PCR" em comissoes_exame — nasce INATIVO: só aparece no agendamento
--    depois que alguém liga "Ativo" em Preços › Exames.
-- 2. agendamento_pcr (snapshot de preço + comissão por PCR)

BEGIN;

INSERT INTO comissoes_exame (tipo_exame, preco_pix_comercial, custo_exame, valor_comissao,
                             varia_por_horario, duracao_minutos, observacao, ativo)
VALUES ('PCR', 0, 0, 0, false, 15, 'Preço individual por PCR — configurar em Preços › PCR', false)
ON CONFLICT (tipo_exame) DO NOTHING;

CREATE TABLE IF NOT EXISTS agendamento_pcr (
  id             SERIAL PRIMARY KEY,
  agendamento_id INTEGER       NOT NULL REFERENCES agendamentos(id) ON DELETE CASCADE,
  pcr_id         INTEGER       NOT NULL REFERENCES exames_pcr(id),
  valor_pix      NUMERIC(10,2) NOT NULL,
  valor_cartao   NUMERIC(10,2) NOT NULL,
  comissao       NUMERIC(10,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_agendamento_pcr_agendamento ON agendamento_pcr(agendamento_id);

-- Acesso só pelo service role (server-side), igual às demais tabelas.
ALTER TABLE agendamento_pcr ENABLE ROW LEVEL SECURITY;

COMMIT;

-- Conferência:
-- SELECT tipo_exame, ativo FROM comissoes_exame WHERE tipo_exame = 'PCR';
-- SELECT * FROM agendamento_pcr ORDER BY id DESC LIMIT 10;
