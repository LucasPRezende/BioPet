-- Migration v27: eliminar coluna preco_exame de comissoes_exame
-- preco_pix_comercial assume o papel de preço PIX para todos os exames.
-- Para exames sem variação de horário, preco_pix_fora_horario e preco_cartao_fora_horario
-- são nivelados com os valores comerciais (sem fallbacks no código).

-- 1. Copia preco_exame para preco_pix_comercial onde ainda está null
UPDATE comissoes_exame
SET preco_pix_comercial = preco_exame
WHERE preco_pix_comercial IS NULL AND preco_exame IS NOT NULL;

-- 2. Para exames sem variação de horário, nivela fora_horario com comercial
UPDATE comissoes_exame
SET preco_pix_fora_horario    = preco_pix_comercial,
    preco_cartao_fora_horario = preco_cartao_comercial
WHERE varia_por_horario = false;

-- 3. Remove coluna redundante
ALTER TABLE comissoes_exame DROP COLUMN IF EXISTS preco_exame;
