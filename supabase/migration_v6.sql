-- BioPet — Migration v6: Seed completo de preços dos exames

-- ─── Ultrassonografia ───────────────────────────────────────────────────────

-- Abdominal Total (varia por horário)
INSERT INTO comissoes_exame (tipo_exame, preco_exame, custo_exame, valor_comissao, varia_por_horario, preco_pix_comercial, preco_cartao_comercial, preco_pix_fora_horario, preco_cartao_fora_horario)
VALUES ('Ultrassom Abdominal Total', 180, 0, 0, TRUE, 180, 200, 240, 260)
ON CONFLICT (tipo_exame) DO UPDATE SET
  varia_por_horario         = TRUE,
  preco_exame               = 180,
  preco_pix_comercial       = 180,
  preco_cartao_comercial    = 200,
  preco_pix_fora_horario    = 240,
  preco_cartao_fora_horario = 260;

-- Cervical (preço único, sem variação de horário)
INSERT INTO comissoes_exame (tipo_exame, preco_exame, custo_exame, valor_comissao, varia_por_horario, preco_pix_comercial, preco_cartao_comercial, preco_pix_fora_horario, preco_cartao_fora_horario)
VALUES ('Ultrassom Cervical', 200, 0, 0, FALSE, 200, 220, NULL, NULL)
ON CONFLICT (tipo_exame) DO UPDATE SET
  varia_por_horario         = FALSE,
  preco_exame               = 200,
  preco_pix_comercial       = 200,
  preco_cartao_comercial    = 220,
  preco_pix_fora_horario    = NULL,
  preco_cartao_fora_horario = NULL;

-- Cistocentese (sem ultra) — sem cartão
INSERT INTO comissoes_exame (tipo_exame, preco_exame, custo_exame, valor_comissao, varia_por_horario, preco_pix_comercial, preco_cartao_comercial, preco_pix_fora_horario, preco_cartao_fora_horario)
VALUES ('Cistocentese (sem ultra)', 90, 0, 0, FALSE, 90, NULL, NULL, NULL)
ON CONFLICT (tipo_exame) DO UPDATE SET
  varia_por_horario         = FALSE,
  preco_exame               = 90,
  preco_pix_comercial       = 90,
  preco_cartao_comercial    = NULL,
  preco_pix_fora_horario    = NULL,
  preco_cartao_fora_horario = NULL;

-- Laudo de revisão — sem cartão
INSERT INTO comissoes_exame (tipo_exame, preco_exame, custo_exame, valor_comissao, varia_por_horario, preco_pix_comercial, preco_cartao_comercial, preco_pix_fora_horario, preco_cartao_fora_horario)
VALUES ('Laudo de revisão', 90, 0, 0, FALSE, 90, NULL, NULL, NULL)
ON CONFLICT (tipo_exame) DO UPDATE SET
  varia_por_horario         = FALSE,
  preco_exame               = 90,
  preco_pix_comercial       = 90,
  preco_cartao_comercial    = NULL,
  preco_pix_fora_horario    = NULL,
  preco_cartao_fora_horario = NULL;

-- ─── Raio-X ─────────────────────────────────────────────────────────────────

-- Um Estudo (varia por horário)
INSERT INTO comissoes_exame (tipo_exame, preco_exame, custo_exame, valor_comissao, varia_por_horario, preco_pix_comercial, preco_cartao_comercial, preco_pix_fora_horario, preco_cartao_fora_horario)
VALUES ('Raio-X Um Estudo', 230, 0, 0, TRUE, 230, 250, 250, 270)
ON CONFLICT (tipo_exame) DO UPDATE SET
  varia_por_horario         = TRUE,
  preco_exame               = 230,
  preco_pix_comercial       = 230,
  preco_cartao_comercial    = 250,
  preco_pix_fora_horario    = 250,
  preco_cartao_fora_horario = 270;

-- Acréscimo por estudo adicional — sem cartão
INSERT INTO comissoes_exame (tipo_exame, preco_exame, custo_exame, valor_comissao, varia_por_horario, preco_pix_comercial, preco_cartao_comercial, preco_pix_fora_horario, preco_cartao_fora_horario)
VALUES ('Raio-X Acréscimo por Estudo Adicional', 150, 0, 0, FALSE, 150, NULL, NULL, NULL)
ON CONFLICT (tipo_exame) DO UPDATE SET
  varia_por_horario         = FALSE,
  preco_exame               = 150,
  preco_pix_comercial       = 150,
  preco_cartao_comercial    = NULL,
  preco_pix_fora_horario    = NULL,
  preco_cartao_fora_horario = NULL;

-- Com contraste — a consultar
INSERT INTO comissoes_exame (tipo_exame, preco_exame, custo_exame, valor_comissao, varia_por_horario, preco_pix_comercial, preco_cartao_comercial, preco_pix_fora_horario, preco_cartao_fora_horario, observacao)
VALUES ('Raio-X Com Contraste', 0, 0, 0, FALSE, NULL, NULL, NULL, NULL, 'A consultar')
ON CONFLICT (tipo_exame) DO UPDATE SET
  varia_por_horario         = FALSE,
  preco_exame               = 0,
  preco_pix_comercial       = NULL,
  preco_cartao_comercial    = NULL,
  preco_pix_fora_horario    = NULL,
  preco_cartao_fora_horario = NULL,
  observacao                = 'A consultar';

-- ─── Outros Exames ───────────────────────────────────────────────────────────

-- Hemogasometria
INSERT INTO comissoes_exame (tipo_exame, preco_exame, custo_exame, valor_comissao, varia_por_horario, preco_pix_comercial, preco_cartao_comercial, preco_pix_fora_horario, preco_cartao_fora_horario)
VALUES ('Hemogasometria', 200, 0, 0, FALSE, 200, 240, NULL, NULL)
ON CONFLICT (tipo_exame) DO UPDATE SET
  varia_por_horario         = FALSE,
  preco_exame               = 200,
  preco_pix_comercial       = 200,
  preco_cartao_comercial    = 240,
  preco_pix_fora_horario    = NULL,
  preco_cartao_fora_horario = NULL;

-- Elastografia
INSERT INTO comissoes_exame (tipo_exame, preco_exame, custo_exame, valor_comissao, varia_por_horario, preco_pix_comercial, preco_cartao_comercial, preco_pix_fora_horario, preco_cartao_fora_horario)
VALUES ('Elastografia', 240, 0, 0, FALSE, 240, 270, NULL, NULL)
ON CONFLICT (tipo_exame) DO UPDATE SET
  varia_por_horario         = FALSE,
  preco_exame               = 240,
  preco_pix_comercial       = 240,
  preco_cartao_comercial    = 270,
  preco_pix_fora_horario    = NULL,
  preco_cartao_fora_horario = NULL;

-- Endoscopia
INSERT INTO comissoes_exame (tipo_exame, preco_exame, custo_exame, valor_comissao, varia_por_horario, preco_pix_comercial, preco_cartao_comercial, preco_pix_fora_horario, preco_cartao_fora_horario)
VALUES ('Endoscopia', 2000, 0, 0, FALSE, 2000, 2200, NULL, NULL)
ON CONFLICT (tipo_exame) DO UPDATE SET
  varia_por_horario         = FALSE,
  preco_exame               = 2000,
  preco_pix_comercial       = 2000,
  preco_cartao_comercial    = 2200,
  preco_pix_fora_horario    = NULL,
  preco_cartao_fora_horario = NULL;
