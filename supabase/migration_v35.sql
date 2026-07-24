-- Migration v35: agentes (analitos) dos testes rápidos "combo" no banco
--
-- Tira a lista de agentes do código (ANALITOS_POR_TESTE) e leva para o catálogo,
-- para as usuárias editarem no painel (Preços › Teste Rápido › ✏️ Editar).
-- Testes "combo" (4Dx, FIV/FeLV, ...) detectam vários agentes num teste só e o
-- laudo marca Positivo/Negativo por agente. `analitos` é um array JSON de nomes;
-- testes sem `analitos` seguem com resultado único.

ALTER TABLE testes_rapidos
  ADD COLUMN IF NOT EXISTS analitos JSONB;

UPDATE testes_rapidos
SET analitos = '["Ehrlichia spp.", "Anaplasma spp.", "Borrelia Burgdorferi", "Dirofilaria Immitis"]'::jsonb
WHERE nome = 'Snap 4Dx Plus';

UPDATE testes_rapidos
SET analitos = '["FIV (Vírus da Imunodeficiência Felina)", "FeLV (Vírus da Leucemia Felina)"]'::jsonb
WHERE nome = 'Combo FIV / FeLV';
