# Encaminhamento para Laboratórios Parceiros — Arquitetura

> Documento de desenho. A BioPet passa a atuar como **intermediário logístico**
> entre o solicitante (vet/clínica parceira ou cliente via admin) e um
> laboratório de referência (Tecsa, Hormonalle...). A BioPet coleta a amostra,
> consolida em tubos, envia ao lab e revende o exame com margem.
>
> Fonte do catálogo: `tabela-parceiros-extraida.txt` (extração do PDF
> "Tabela de valores Biopet (Tecsa e Hormonalle_Caes_Gatos)"), ~27 categorias,
> ~600 exames entre os dois labs.

## Decisões travadas

1. **O tutor nunca marca sozinho.** Origem do pedido é sempre:
   - `vet` — veterinário parceiro (portal do vet)
   - `clinica` — clínica parceira (portal da clínica)
   - `admin` — cliente ligou/mandou mensagem e a administradora lançou por ele
2. **A origem define a tabela de preço** (ver [[project_pricing_refactor]]):
   - `vet` / `clinica` → `preco_parceiro`
   - `admin` (em nome do cliente) → `preco_cliente`
3. **Coleta é responsabilidade da BioPet** (até segunda ordem). O pedido gera um
   compromisso na **agenda interna existente** (`agendamentos`), não um
   calendário paralelo. "Horário de coleta" = horário desse compromisso.
4. **"Sob consulta" fica fora deste ciclo.** O schema aceita preço nulo, mas o
   fluxo de cotação manual não será construído agora; exame sem preço fechado
   simplesmente não fica disponível para pedido.

## Por que não reaproveitar `comissoes_exame`

`comissoes_exame` modela *exames que a BioPet executa* (dezenas de linhas, uma
por tipo). O catálogo de parceiros tem ~600 linhas por lab, com atributos que
aquela tabela não tem: cor do tubo, tipo/volume de material, espécie permitida,
prazo em dias úteis, metodologia, e **três** valores (custo, cliente, parceiro).
Modelagem nova, separada.

---

## Modelo de dados

### `lab_laboratorios` — os parceiros de referência
```
id              serial pk
nome            text        -- 'Tecsa', 'Hormonalle'
ativo           boolean default true
endereco_json   jsonb       -- destino para o frete (CEP, rua, número...)
prazo_padrao    integer     -- dias úteis, fallback quando o exame não informa
observacoes     text
criado_em       timestamptz default now()
```
> O **destino** do frete é o endereço do laboratório; a **origem** é o endereço
> fixo da BioPet (config global, não por lab).

### `lab_exames` — o catálogo (alicerce; importado do PDF)
```
id                serial pk
laboratorio_id    integer references lab_laboratorios(id)
codigo            text        -- código do exame no lab (ex. Tecsa '98')
nome              text
categoria         text        -- 'Hematologia', 'Bioquímica', 'Hormônios'...
cor_tubo          text        -- 'Roxa', 'Azul', 'Vermelha/Amarela'... (pode ser nulo)
material_tipo     text        -- 'soro', 'plasma EDTA', 'plasma citratado', 'urina'...
material_volume_ml numeric(6,2)
especies          text        -- texto livre do PDF: 'Canina, felina e equina'
prazo_dias_uteis  integer
metodologia       text
custo             numeric(10,2)   -- o que a BioPet paga ao lab
preco_cliente     numeric(10,2)   -- cobrado no direto (custo +40% no PDF)
preco_parceiro    numeric(10,2)   -- cobrado a vet/clínica (coluna "a preencher")
is_combo          boolean default false  -- perfis/combos do PDF
sob_consulta      boolean default false  -- sem preço fechado; fora do fluxo por ora
ativo             boolean default true
unique(laboratorio_id, codigo)
```

### `pedido_lab` — cabeçalho do encaminhamento
```
id                serial pk
tutor_id          integer references tutores(id)
pet_id            integer references pets(id)
origem            text        -- 'vet' | 'clinica' | 'admin'
tipo_cobranca     text        -- 'parceiro' | 'cliente'  (derivado da origem, mas gravado)
clinica_id        integer references clinicas(id)      -- nulo se origem='admin'/'vet' avulso
vet_id            integer references veterinarios(id)  -- nulo se não for vet
agendamento_id    integer references agendamentos(id)  -- o compromisso de coleta
status            text        -- ver máquina de estados abaixo
valor_total       numeric(10,2)  -- snapshot (soma dos itens)
status_pagamento  text        -- reutiliza vocabulário atual: 'pendente'|'a_receber'|'pago'|'pago_clinica'
criado_em         timestamptz default now()
```
> Um pedido pode conter exames de **labs diferentes** (Tecsa + Hormonalle). Por
> isso o `laboratorio_id` **não** fica no cabeçalho — fica no item, e o frete é
> agrupado por lab em `pedido_lab_envio`.

### `pedido_lab_item` — itens com snapshot de preço
```
id              serial pk
pedido_id       integer references pedido_lab(id) on delete cascade
lab_exame_id    integer references lab_exames(id)
laboratorio_id  integer references lab_laboratorios(id)  -- desnormalizado p/ agrupar
codigo          text     -- snapshot
nome            text     -- snapshot
cor_tubo        text     -- snapshot (drive da consolidação de tubos)
material_tipo   text     -- snapshot
material_volume_ml numeric(6,2)
custo_snapshot  numeric(10,2)
preco_snapshot  numeric(10,2)   -- o que foi efetivamente cobrado (cliente ou parceiro)
```
> Snapshot pelos mesmos motivos de `agendamento_exames`/`agendamento_bioquimica`:
> preserva o histórico financeiro mesmo que o catálogo mude depois.

### `pedido_lab_envio` — a remessa por laboratório (frete/etiqueta)
```
id                serial pk
pedido_id         integer references pedido_lab(id) on delete cascade
laboratorio_id    integer references lab_laboratorios(id)
melhor_envio_id   text      -- id do envio na API
transportadora    text
valor_frete       numeric(10,2)
etiqueta_url      text      -- PDF da etiqueta de postagem
codigo_rastreio   text
status_envio      text      -- 'cotado'|'comprado'|'postado'|'entregue'
```

### `lab_exame_interno_map` — De-Para interno ↔ parceiro (fase tardia)
```
id                  serial pk
bioquimica_exame_id integer references bioquimica_exames(id)
lab_exame_id        integer references lab_exames(id)
```
> Pré-requisito do motor "fazer vs. encaminhar": sem isso o sistema não sabe que
> "Creatinina interna" (Mindray BS-200) = código 98 da Tecsa.

**Tubos consolidados** (etiquetas de tubo) são **derivados** dos itens em tempo
de emissão — não precisam de tabela própria a menos que se queira rótulo estável.
Ver `src/lib/lab-tubos.ts` abaixo.

---

## Máquina de estados do pedido

```
rascunho ─▶ confirmado ─▶ coleta_agendada ─▶ coletado ─▶ enviado ─▶ concluído
                │                                            │
                └──────────────▶ cancelado ◀────────────────┘
```
- `confirmado`: itens e preço fechados (snapshot gravado).
- `coleta_agendada`: `agendamento_id` preenchido (aparece na agenda existente).
- `coletado`: amostra em mãos; tubos consolidados/etiquetados.
- `enviado`: `pedido_lab_envio` com etiqueta comprada e código de rastreio.
- `concluído`: resultado recebido do lab (e, se aplicável, laudo emitido).

---

## Precificação em três camadas

Estender `src/lib/pricing.ts` (fonte única — [[project_pricing_refactor]]):

```ts
export type TipoCobranca = 'parceiro' | 'cliente'

export function precoLabExame(
  e: { preco_cliente: number | null; preco_parceiro: number | null },
  tipo: TipoCobranca,
): number {
  return (tipo === 'parceiro' ? e.preco_parceiro : e.preco_cliente) ?? 0
}
```
- `tipo_cobranca` é derivado da `origem` do pedido (`vet`/`clinica` → parceiro;
  `admin` → cliente) e **gravado** no pedido para não depender de recalcular.
- O **frete** é custo da BioPet, não necessariamente repassado ao solicitante —
  decidir política de repasse (ver pontas soltas).

---

## Consolidação de tubos — `src/lib/lab-tubos.ts`

Regra pura a partir dos itens do pedido:
1. Agrupar por `cor_tubo` **normalizado** (`normalizarCorTubo`). Tecsa e
   Hormonalle descrevem o mesmo tubo físico de formas diferentes — ex: "Roxa"
   (Tecsa) e "Roxa (EDTA)" (Hormonalle) são o mesmo tubo, o parêntese só
   documenta o aditivo padrão daquela cor (EDTA=roxa, citrato=azul,
   fluoreto=cinza, soro=vermelha/amarela). Removendo o parêntese os dois
   catálogos convergem pro mesmo grupo. `material_tipo` deixou de ser chave de
   agrupamento — vira informação por item (exibida na etiqueta), já que a cor
   do tubo já implica o aditivo/material esperado.
2. Somar `material_volume_ml`, respeitando o volume máximo por tubo (config,
   `VOLUME_MAX_TUBO_ML`). Item sem volume informado (lâmina, bloco de
   parafina) não é consolidado com outros — vai sozinho num recipiente.
3. Emitir a lista: *"2 tubos Roxa, 1 tubo Azul…"* + uma etiqueta de tubo por
   tubo físico (pet, tutor, exames daquele tubo, código do pedido).

Saída alimenta tanto a **instrução de coleta** (o que a BioPet coleta) quanto a
**impressão de etiquetas de tubo**.

---

## Frete via Melhor Envio — `src/lib/melhor-envio.ts`

**Confirmado (doc oficial):** a API cobre todo o ciclo — cotação, compra e
geração/impressão da etiqueta em PDF. Automação ponta a ponta é viável.

Encapsular como `asaas.ts` / `mp-preference.ts` já fazem com APIs externas.
Fluxo da API (OAuth2 Bearer, base `.../api/v2/me/`), um escopo por etapa:

| Passo | Endpoint | Escopo | Nota |
|---|---|---|---|
| Cotar | `POST /shipment/calculate` | `shipping-calculate` | origem BioPet, destino lab; escolhe a mais barata que atende o prazo |
| Carrinho | `POST /cart` | `cart-write` | adiciona o envio escolhido |
| Pagar | `POST /shipment/checkout` | `shipping-checkout` | **debita do saldo pré-pago** da conta Melhor Envio |
| Gerar | `POST /shipment/generate` | `shipping-generate` | **assíncrono** — dar um intervalo antes de imprimir |
| Imprimir | `POST /shipment/print` | `shipping-print` | retorna **PDF** (também JPEG/ZPL); `"mode":"public"` p/ link público |
| Rastrear | tracking | `shipping-tracking` | código + status |

Persistir `melhor_envio_id`, `valor_frete`, `etiqueta_url`, `codigo_rastreio`,
`status_envio` em `pedido_lab_envio`.

Envs: `MELHOR_ENVIO_TOKEN`, `MELHOR_ENVIO_CLIENT_ID/SECRET`, `MELHOR_ENVIO_BASE_URL`
(sandbox `sandbox.melhorenvio.com.br` vs. produção `melhorenvio.com.br`).

**Notas operacionais:**
- Manter **saldo** na conta Melhor Envio — o checkout debita crédito pré-pago.
- `generate` é assíncrono: sequenciar `generate` → (delay) → `print`.
- **Transporte não refrigerado**: caixa de isopor com gelo. Prazo apurado de
  **2–3 dias**, aceito pela BioPet e pelo laboratório — não exige modalidade
  especial de transporte biológico neste momento.

---

## Motor "fazer vs. encaminhar" — `src/lib/lab-decisao.ts` (fase final)

Para exames que a BioPet **também executa** internamente:
- Comparar `custo_interno` vs. `custo_lab + frete_rateado`, respeitando o prazo
  máximo aceitável.
- **Frete é por envio, não por exame**: o custo marginal do 2º exame ao mesmo lab
  é ~zero. A otimização real é **agrupar exames por lab/envio**, não decidir
  linha a linha.
- Considerar **combos/perfis** (`is_combo`): um perfil pode ser mais barato que a
  soma dos avulsos.
- Regra de desempate a definir: default custo (mais margem), com prazo como
  restrição — nunca só o menor preço unitário.

Depende do `lab_exame_interno_map` estar populado. Por isso é a última fase.

---

## Conclusão: o que o sistema automatiza e o que continua humano

| Etapa | Automatiza? | Responsável |
|---|---|---|
| Consulta de catálogo + preço (3 camadas) | ✅ total | sistema |
| Criar pedido (vet/clínica/admin) | ✅ total | solicitante + sistema |
| Decidir tubos (cor, tipo, volume, quantidade) | ✅ total | sistema (`lab-tubos.ts`) |
| Imprimir etiqueta de tubo | ✅ total | sistema → impressora térmica |
| Agendar coleta (na agenda existente) | ✅ total | sistema |
| **Coletar a amostra / montar isopor+gelo** | ❌ | pessoa (BioPet) |
| Cotar frete (menor custo, prazo) | ✅ total | sistema (Melhor Envio) |
| Comprar + gerar etiqueta de postagem | ✅ total | sistema (Melhor Envio) |
| **Colar etiquetas e postar** | ❌ | pessoa (BioPet) |
| Rastrear envio | ✅ total | sistema |
| **Digitar/receber o resultado do lab** | ⚠️ semi | pessoa (upload+transcrição) ou API do lab |
| Emitir laudo com a cara da BioPet | ✅ total | sistema (esteira `laudos`) |
| Recomendar maquininha do recebimento | ✅ total | sistema (ver abaixo) |
| **Passar o cartão na maquininha** | ❌ | pessoa (BioPet) |
| Decidir fazer-vs-encaminhar | ✅ total | sistema (fase final) |

**Leitura:** tudo que é decisão/cálculo/documento é automatizável. O que sobra pra
pessoa é o físico (coletar, embalar, postar, passar cartão) e a ponte do resultado
do lab enquanto não houver integração.

---

## Recursos necessários

**Impressora — 1 térmica de etiquetas, um único rolo 10×15cm, pros dois usos
(decisão travada).** A mesma impressora e o mesmo rolo 10×15cm imprimem tanto a
etiqueta de tubo quanto a etiqueta de postagem do Melhor Envio — sem trocar
rolo. Como a etiqueta de tubo é pequena demais pra ocupar a folha 10×15
inteira, cada folha traz várias faixas de tubo empilhadas (18mm de altura
cada, ~7 por folha), com linha de corte tracejada + indicação de tesoura entre
elas — a BioPet imprime a folha e corta as faixas, cada uma do tamanho certo
pra colar ao redor de um tubo de coleta (`generate-etiqueta-tubo-pdf.ts`,
constantes `LABEL_HEIGHT_MM`/`LABELS_POR_FOLHA` ajustáveis se a medida real do
tubo pedir outro tamanho). Ex. de mercado: Elgin L42, Zebra ZD220/GK420
(~R$500–1.000).
- **Resolvido — tudo em PDF, sem ZPL.** A impressora do Lucas trabalha melhor
  com PDF do que ZPL. `POST /shipment/print` do Melhor Envio devolve **PDF por
  padrão** (JPEG/ZPL são alternativas, não a única saída — ver tabela acima),
  então a Fase 4 pede PDF nesse endpoint e usa o mesmo formato/driver que a
  etiqueta de tubo da Fase 3 (`generate-etiqueta-tubo-pdf.ts`). Não precisa de
  conversão nem migrar nada pra ZPL — as duas etiquetas (tubo e postagem) saem
  em PDF pela mesma impressora, no mesmo rolo 10×15cm.
- Impressora comum (jato/laser) só se quiserem **laudo impresso** — mas laudo é
  PDF digital hoje, então é **opcional**.

**Outros recursos:**
- Conta **Melhor Envio** com app OAuth (client id/secret) + **saldo pré-pago**.
- Caixas de isopor + gelo (operacional).
- Dimensões/peso da caixa para a cotação: usar **presets de caixa** (P/M/G) em vez
  de medir a cada envio — mais simples e suficiente.
- Maquininhas de cartão (já existem) — o sistema só as cadastra e roteia.

---

## Estoque de insumos e custo real do envio

**Implementável e recomendado.** Além do controle operacional (saber quando
repor isopor/gelo/tubo), fecha o buraco do **custo real**: hoje o `custo` do
catálogo é só o que a BioPet paga ao lab. O custo de encaminhar é
`custo_lab + frete + insumos`. Sem os insumos, margem e motor fazer-vs-encaminhar
ficam otimistas.

### O que amarra tudo: consumo automático

O sistema **já calcula os tubos** (`lab-tubos.ts`) e o **preset de caixa** do
envio. Então a baixa de estoque é derivada, não digitada:
- Consolidação diz "2 tubos Roxa + 1 Azul" → baixa 2+1 dos insumos de tubo.
- Preset de caixa (P/M/G) tem um **kit** (1 isopor + N gelo + embalagem +
  etiquetas) → baixa o kit no envio.

### Dados (versão enxuta — sem lote/validade/ordem de compra)

```
insumos
  id            serial pk
  nome          text            -- 'Tubo Roxa EDTA', 'Caixa isopor P', 'Gelo', 'Etiqueta térmica'
  unidade       text            -- 'un', 'mL', 'g'
  custo_unitario numeric(10,2)  -- último custo (para o rollup de custo real)
  estoque_atual  numeric(12,2)
  estoque_minimo numeric(12,2)  -- gatilho de alerta de reposição
  ativo         boolean default true

insumo_movimento          -- ledger; saldo = soma dos movimentos
  id            serial pk
  insumo_id     integer references insumos(id)
  tipo          text            -- 'entrada' | 'saida' | 'ajuste'
  quantidade    numeric(12,2)
  custo_unitario numeric(10,2)  -- gravado na entrada (compra)
  pedido_id     integer references pedido_lab(id)  -- quando a saída vem de um pedido
  motivo        text
  criado_em     timestamptz default now()

-- Mapa tubo→insumo e kit de caixa podem ser config simples:
caixa_preset              -- P/M/G: dimensões p/ frete + composição do kit
  id, nome, altura_cm, largura_cm, comprimento_cm, peso_kg, kit_json
```

### Custo real por pedido (rollup)

`custo_total_pedido = Σ custo_lab(itens) + valor_frete + Σ (insumo consumido × custo_unitario)`

Alimenta a **margem real** do pedido e o **motor fazer-vs-encaminhar** (o custo
interno também passa a somar seus insumos — reagente Mindray, tubo).

### Escopo — decisão sua

- **Enxuto agora:** insumos + ledger + alerta de estoque mínimo + baixa
  automática. **Sem** lote, validade, fornecedor ou ordem de compra (tubo e
  isopor não vencem; gelo é reutilizável) — evita inchar.
- O mesmo módulo serve, se quiserem depois, para **reagentes da bioquímica
  interna** (Mindray) — a tabela já é genérica. Decidir se entra agora ou depois.
- **Repasse do custo de insumo** segue a mesma pendência do frete (absorve /
  repassa / linha) — por ora só *registramos* o custo.

---

## Roteamento de recebimento entre maquininhas

Regra interna da BioPet (o *porquê* não nos cabe): o valor recebido enche uma
maquininha até **R$ 1.500**, daí passa para a próxima; quando a próxima também
bate R$ 1.500, volta para a primeira, e assim por diante — rodízio em "baldes"
de R$ 1.500. O sistema é **conselheiro + registro**: diz em qual maquininha passar
e guarda o histórico. **Não** passa o cartão.

### Dados

```
maquininhas
  id            serial pk
  nome          text            -- 'Maquininha 1', 'Cielo', 'Loja'...
  limite        numeric(10,2)   default 1500
  ordem         integer         -- posição no rodízio
  ativo         boolean default true

recebimento_maquina           -- ledger de cada recebimento roteado
  id            serial pk
  maquininha_id integer references maquininhas(id)
  pedido_id     integer references pedido_lab(id)   -- (ou agendamento_id, ver escopo)
  valor         numeric(10,2)
  criado_em     timestamptz default now()
```

### Algoritmo (advisor)

Estado corrente = maquininha ativa + acumulado no balde atual (derivável do ledger
ou materializado):
1. `proxima(valor)`: se `acumulado_atual + valor <= limite` → **mesma** maquininha.
2. Senão → avança para a **próxima** na `ordem` (rodízio circular), abre balde novo.
3. Registra o recebimento no ledger com a maquininha efetivamente usada.

### Parâmetros que precisam de valor (configuráveis, sem hardcode)

- **Quantas** maquininhas e em que **ordem** de rodízio.
- **Limite** por maquininha (default R$ 1.500 — mas configurável por máquina).
- **Reset do balde:** nunca (rodízio contínuo), diário, ou manual? A frase "volta
  em uma" sugere contínuo; deixo **configurável** para não travar.
- **Pagamento único > limite** (ex.: R$ 2.000 num exame caro): vai inteiro na
  próxima máquina (estoura o balde uma vez) ou divide? — regra a definir.

### Escopo — decisão sua

Recebimento não é exclusivo de labs: os `agendamentos` normais também recebem. O
módulo `maquininhas` pode servir **o sistema todo** (recomendado) ou ficar
**restrito a labs**. Se for geral, o ledger referencia `pedido_id` **ou**
`agendamento_id`.

---

## Superfícies (rotas e telas, seguindo as convenções atuais)

- **Catálogo (admin):** `src/app/admin/labs/` + `src/app/api/labs/exames/`
- **Pedidos (admin):** `src/app/admin/labs/pedidos/` + `src/app/api/labs/pedidos/`
- **Portal parceiro:** `src/app/clinica/labs/` e/ou `src/app/vet/labs/`
- **Frete:** `src/app/api/labs/frete/cotar/`, `.../etiqueta/`
- **Etiquetas de tubo:** `src/app/api/labs/pedidos/[id]/etiquetas/` — gera PDF p/ a térmica
- **Maquininhas:** `src/app/admin/maquininhas/` + `src/app/api/maquininhas/`
- **Estoque:** `src/app/admin/estoque/` + `src/app/api/estoque/`
- **Libs:** `melhor-envio.ts`, `lab-tubos.ts`, `lab-decisao.ts`, `maquininhas.ts`,
  `estoque.ts`, extensão de `pricing.ts`
- **Migrations:** novas `migration_vNN.sql` (próximas livres a partir de v31)

---

## Fases (ordem que reduz risco)

1. **Catálogo** — `lab_laboratorios` + `lab_exames`, importador do PDF, tela de
   catálogo. Sem isso nada anda.
2. **Pedido + precificação 3 camadas** — `pedido_lab`/`pedido_lab_item`, extensão
   de `pricing.ts`, telas de criação (admin + portais parceiros), vínculo do
   compromisso de coleta na agenda existente.
3. **Consolidação de tubos + etiquetas de tubo** — derivado puro do catálogo.
4. **Frete Melhor Envio** — cotação + compra + etiqueta de postagem.
5. **Estoque de insumos** — insumos + ledger + baixa automática (tubo/kit) +
   alerta de mínimo. Habilita o custo real por pedido.
6. **Roteamento de maquininhas** — módulo independente (pode entrar em paralelo).
7. **Resultado → laudo BioPet** — entrada do resultado + re-emissão na esteira.
8. **Motor fazer-vs-encaminhar** — depende do De-Para, do agrupamento e do custo
   real (itens + frete + insumos).

---

## Resultado → laudo com a cara da BioPet (decidido)

O resultado do lab parceiro **é re-emitido como laudo BioPet** — deve sair com a
identidade visual da BioPet, não repassar o PDF do laboratório cru. Integra com a
esteira de `laudos` existente (reusa `generate-pdf.ts`/template). Falta definir a
mecânica de entrada do resultado (upload manual do PDF do lab + transcrição, ou
integração se o lab oferecer API/retorno estruturado).

## Pontas soltas / decisões futuras

- **Repasse do frete — decidido:** absorvido pela BioPet, não repassado ao
  solicitante (`valor_total` do pedido não inclui frete). `valor_frete` fica
  registrado separado em `pedido_lab_envio` mesmo assim, só pra custo real —
  não é cobrado, é modelado desde já pra não migrar depois se a política
  mudar.
- **Múltiplos labs num pedido:** confirmado que é possível — o frete é por
  `pedido_lab_envio` (por lab). Falta definir UX de agrupamento.
- **Entrada do resultado do lab:** upload manual + transcrição vs. integração —
  definir por laboratório.
- **"Sob consulta":** fluxo de cotação manual — adiado.
- **Pagamento:** reaproveitar Asaas/Mercado Pago ou faturar parceiro em lote
  (como o `repasse_confirmado` de clínicas já faz)?

Transporte biológico deixou de ser bloqueio: isopor + gelo, prazo 2–3 dias,
aceito pela BioPet e pelo lab (ver seção de frete).
