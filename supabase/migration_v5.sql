-- BioPet — Migration v5: Variação de preço por horário e forma de pagamento

ALTER TABLE comissoes_exame
  ADD COLUMN IF NOT EXISTS preco_pix_comercial      NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS preco_cartao_comercial   NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS preco_pix_fora_horario   NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS preco_cartao_fora_horario NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS varia_por_horario        BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS duracao_minutos          INTEGER,
  ADD COLUMN IF NOT EXISTS observacao               TEXT;

UPDATE comissoes_exame SET
  varia_por_horario         = TRUE,
  preco_pix_comercial       = 180,
  preco_cartao_comercial    = 200,
  preco_pix_fora_horario    = 240,
  preco_cartao_fora_horario = 260
WHERE tipo_exame = 'Ultrassom Abdominal Total';

UPDATE comissoes_exame SET
  varia_por_horario         = TRUE,
  preco_pix_comercial       = 200,
  preco_cartao_comercial    = 220,
  preco_pix_fora_horario    = 200,
  preco_cartao_fora_horario = 220
WHERE tipo_exame = 'Ultrassom Cervical';

UPDATE comissoes_exame SET
  varia_por_horario         = TRUE,
  preco_pix_comercial       = 230,
  preco_cartao_comercial    = 250,
  preco_pix_fora_horario    = 250,
  preco_cartao_fora_horario = 270
WHERE tipo_exame = 'Raio-X Um Estudo';
