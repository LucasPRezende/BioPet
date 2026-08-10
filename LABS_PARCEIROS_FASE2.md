# Labs Parceiros — Fase 2 (Pedidos): guia de implementação

> **Para quem vai implementar.** Este doc é o handoff da Fase 1 (catálogo, pronta)
> para a Fase 2 (pedidos). Leia junto com `LABS_PARCEIROS.md` (arquitetura geral)
> e `PROPOSTA_LABS_PARCEIROS.md` (39 perguntas de negócio — várias ainda SEM
> resposta; a seção "Bloqueios" abaixo diz o que dá pra fazer sem elas).

---

## 1. Estado atual (o que já está pronto e verificado)

**Banco (DEV `teozyceggokmsrmuitnj` — migration v39 aplicada, 532 exames importados):**

| Tabela | Conteúdo |
|---|---|
| `lab_laboratorios` | Tecsa (id 1), Hormonalle (id 2). `endereco_json`/`prazo_padrao` ainda nulos (perguntas C.10-C.11) |
| `lab_exames` | 532 linhas (Tecsa 424, Hormonalle 108). `preco_parceiro` TODO NULL (coluna vazia no PDF — pergunta A.1). `codigo` só na Tecsa |

**Código (tudo passa `npx tsc --noEmit`; ainda NÃO commitado):**

- `supabase/migration_v39.sql` — DDL da fase 1 (aplicada em dev; **PRD não**).
- `src/app/api/labs/exames/route.ts` — GET catálogo (auth sistema), PUT lote (admin).
- `src/app/api/labs/exames/exportar/route.ts` — GET download xlsx (uma aba por lab, admin).
- `src/app/api/labs/exames/importar/route.ts` — POST multipart (`arquivo` + `confirmar='1'`);
  sem `confirmar` responde só o preview (novos/atualizados/iguais/ausentes/erros).
- `src/lib/lab-excel.ts` — parse do xlsx (casa colunas pelo cabeçalho, ordem livre,
  acentos ignorados), diff contra o banco, payload de upsert, geração do export.
  Chave de casamento: `codigo` (Tecsa) / `nome` normalizado (Hormonalle).
  **Nunca apaga nem desativa automaticamente** — ausentes são só reportados.
- `src/app/admin/labs/page.tsx` — tela do catálogo (filtros, edição inline de
  preço parceiro/ativo, botões Exportar/Importar com modal de preview).
- `src/components/Sidebar.tsx` — link "🔬 Labs Parceiros" (Financeiro, adminOnly).
- Scripts: `parse-tabela-parceiros.ts` (PDF→JSON, não precisa mais rodar),
  `import-lab-exames.ts` (seed inicial, idempotente, já rodado),
  `test-lab-excel.ts <xlsx> [.env]` — smoke test do diff de Excel SEM aplicar.
- Dependência nova: `xlsx@0.18.5` (SheetJS, só parse/write de planilha).

**Validações já feitas:** os 536 preços do parse batem custo×1,40 com o PDF;
smoke test com o Excel real (`C:\Users\Lucas\Downloads\Telegram Desktop\Exames_Tecsa_Hormonalle_Caes_Gatos.xlsx`)
casou **100% das linhas** (0 novos, 0 ausentes), detectou os 4 códigos duplicados
do PDF (995, 1034, 1035, 1161) e apontou 291 atualizações.

---

## 2. Pendências imediatas (antes/junto da Fase 2)

1. **Aplicar o Excel de exemplo.** As 291 atualizações são majoritariamente
   `material_tipo`/`cor_tubo`/`especies` que a extração do PDF tinha perdido — o
   Excel é mais completo que o banco atual. Caminho: logar como admin →
   `/admin/labs` → Importar Excel → Analisar → Aplicar. (Ou conferir antes com
   `npx tsx scripts/test-lab-excel.ts "<caminho do xlsx>"`.)
2. **Testar a tela logado** (eu não tinha credenciais): filtros, salvar preço
   parceiro, exportar, importar. O dev server sobe com `npm run dev` (porta 3000).
3. **Commitar a Fase 1** (nada foi commitado ainda). Sugestão de commits separados:
   migration+scripts / api+lib / telas.

---

## 3. Fase 2 — Pedidos: o que construir

### 3.1 Migration v40 (DDL — **quem roda é o Lucas**, nunca o agente)

Criar `supabase/migration_v40.sql` seguindo o desenho de `LABS_PARCEIROS.md`
(seção "Modelo de dados"). Atenção às convenções: `SERIAL PRIMARY KEY`,
`TIMESTAMPTZ DEFAULT NOW()`, RLS habilitado SEM policy (padrão do projeto,
acesso é 100% service-role — ver memória `project_supabase_rls`), e **comentários
SQL sem `;` no meio** (o `scripts/migrate.mjs` divide statements por `;` de forma
ingênua).

```sql
pedido_lab
  id               SERIAL PRIMARY KEY
  tutor_id         INTEGER NOT NULL REFERENCES tutores(id)
  pet_id           INTEGER NOT NULL REFERENCES pets(id)
  origem           TEXT NOT NULL         -- 'vet' | 'clinica' | 'admin'
  tipo_cobranca    TEXT NOT NULL         -- 'parceiro' | 'cliente' (derivado da origem, mas GRAVADO)
  clinica_id       INTEGER REFERENCES clinicas(id)
  vet_id           INTEGER REFERENCES veterinarios(id)
  agendamento_id   INTEGER REFERENCES agendamentos(id)   -- compromisso de coleta
  status           TEXT NOT NULL DEFAULT 'rascunho'
  valor_total      NUMERIC(10,2)
  status_pagamento TEXT NOT NULL DEFAULT 'pendente'      -- vocabulário atual: pendente|a_receber|pago|pago_clinica
  observacoes      TEXT
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW()

pedido_lab_item     -- snapshot de preço, mesmo racional de agendamento_exames
  id               SERIAL PRIMARY KEY
  pedido_id        INTEGER NOT NULL REFERENCES pedido_lab(id) ON DELETE CASCADE
  lab_exame_id     INTEGER NOT NULL REFERENCES lab_exames(id)
  laboratorio_id   INTEGER NOT NULL REFERENCES lab_laboratorios(id)  -- desnormalizado p/ agrupar remessa
  codigo           TEXT
  nome             TEXT NOT NULL
  cor_tubo         TEXT
  material_tipo    TEXT
  material_volume_ml NUMERIC(6,2)
  custo_snapshot   NUMERIC(10,2)
  preco_snapshot   NUMERIC(10,2)   -- o que foi cobrado (parceiro OU cliente)
```

Máquina de estados (campo `status`):
`rascunho → confirmado → coleta_agendada → coletado → enviado → concluido`,
com `cancelado` alcançável de qualquer estado antes de `concluido`.
Fase 2 usa até `coleta_agendada`/`coletado`; `enviado` é da fase de frete (não
bloquear o vocabulário, só não construir a transição ainda).

**NÃO incluir na v40:** `pedido_lab_envio` (frete, fase 4), `lab_exame_interno_map`
(De-Para, fase final), insumos/maquininhas (fases 5-6).

### 3.2 Precificação — estender `src/lib/pricing.ts`

Exatamente como especificado em `LABS_PARCEIROS.md`:

```ts
export type TipoCobranca = 'parceiro' | 'cliente'

export function precoLabExame(
  e: { preco_cliente: number | null; preco_parceiro: number | null },
  tipo: TipoCobranca,
): number | null   // null = sem preço definido para essa cobrança
```

Regras duras (backend, nunca só no front — princípio do projeto:
"backend é a rede de verdade"):
- `origem 'vet'/'clinica'` → `tipo_cobranca 'parceiro'`; `origem 'admin'` → `'cliente'`.
- Exame com `sob_consulta=true` ou `ativo=false` → **recusar** no pedido (400).
- `tipo 'parceiro'` com `preco_parceiro NULL` → **recusar** com mensagem clara
  ("preço parceiro não definido para o exame X — preencha em /admin/labs").
  Enquanto a pergunta A.1 não for respondida, na prática só pedidos de origem
  `admin` vão fluir. Isso é intencional, não contornar.
- Gratuidade **não existe** nesse fluxo até resposta da pergunta A.5 (e mesmo
  depois, seguir a regra do sistema: gratuito é exclusivo de admin).

### 3.3 APIs

Seguir o padrão de auth de `src/app/api/comissoes/route.ts`
(`parseSystemSession` + cookie `SESSION_COOKIE_NAME`, admin p/ escrita).

- `POST /api/labs/pedidos` — cria pedido **com snapshot**:
  body `{ tutor_id, pet_id, origem, clinica_id?, vet_id?, observacoes?, itens: number[] /* lab_exame_id */ }`.
  Backend busca os exames, valida (regras 3.2), monta itens com
  `custo_snapshot`/`preco_snapshot`, grava `tipo_cobranca` e `valor_total`
  (= Σ preco_snapshot), status `rascunho` (ou `confirmado` direto — ver 3.5).
- `GET /api/labs/pedidos` — lista com joins (`tutores(nome)`, `pets(nome)`,
  itens, clinica). Filtro por `status` via querystring.
- `GET /api/labs/pedidos/[id]` — detalhe completo.
- `PATCH /api/labs/pedidos/[id]` — transições de status + editar observações.
  Validar transição legal (map de estados permitidos). `cancelado` não apaga nada.
- `POST /api/labs/pedidos/[id]/agendar-coleta` — cria o compromisso na agenda
  existente e grava `agendamento_id`, status → `coleta_agendada` (ver 3.4).

### 3.4 Integração com a agenda (coleta)

**Decisão travada:** coleta vira compromisso na agenda interna existente
(`agendamentos`), NÃO um calendário paralelo. O insert de referência está em
`src/app/api/admin/agendar/route.ts:166-190`. Campos mínimos p/ compatibilidade
com a agenda/telas atuais:

```
tutor_id, pet_id, system_user_id (sessão), tipo_exame (label — usar
'Coleta Labs Parceiros: <nomes dos exames>'), data_hora, duracao_minutos,
valor (= valor_total do pedido, ou NULL), forma_pagamento ('a confirmar'),
status 'agendado', status_pagamento (espelhar o do pedido), origem 'manual',
clinica_id (se houver), observacoes
```

Cuidados:
- **Não** inserir em `agendamento_exames` linhas de tipos que não existem em
  `comissoes_exame` — a coleta labs NÃO é um exame do catálogo interno. Deixar o
  agendamento sem `agendamento_exames` (o label `tipo_exame` carrega a descrição,
  padrão legado suportado pelas telas) e o vínculo financeiro fica no `pedido_lab`.
- Duração: sem resposta da pergunta D.16, usar default configurável (sugestão:
  30 min) — constante no código com comentário apontando a pergunta.
- Reaproveitar `/api/agendamentos/horarios-livres` para o seletor de horário.
- PRD tem trigger de proteção contra DELETE em agendamentos — nunca deletar;
  cancelamento de pedido só muda status (do pedido e, se existir, do agendamento
  → status 'cancelado' seguindo o vocabulário atual da agenda).

### 3.5 Telas (admin primeiro; portais vet/clínica ficam pra depois)

Estilo: seguir `/admin/labs` e `/admin/comissoes` (client components, fetch às
APIs, Tailwind, paleta `#19202d`/`#8a6e36`, inputs pequenos, modais simples).

- `/admin/labs/pedidos` — lista: colunas pedido nº, data, tutor/pet, origem,
  itens (contagem + labs envolvidos), valor, status (badge), status_pagamento.
  Filtro por status. Link p/ detalhe.
- `/admin/labs/pedidos/novo` — criação:
  1. Buscar tutor (existe API de busca em `/api/tutores` — conferir assinatura;
     a tela `/admin/novo` já faz isso, copiar o padrão de autocomplete de lá)
     → escolher pet do tutor.
  2. Origem: admin (default) / clínica (select de clínicas) / vet (select).
     Mostrar aviso quando origem parceiro e algum exame sem `preco_parceiro`.
  3. Adicionar exames: busca no catálogo (GET `/api/labs/exames` já retorna
     tudo; filtrar client-side como a tela do catálogo faz). Mostrar preço da
     cobrança aplicável, tubo e prazo. Múltiplos labs no mesmo pedido é OK.
  4. Resumo: itens agrupados por laboratório, total. Criar → vai pro detalhe.
- `/admin/labs/pedidos/[id]` — detalhe: itens por lab, totais, botões de
  transição de status (confirmar / agendar coleta [abre seletor de data/hora] /
  marcar coletado / cancelar), dados do agendamento vinculado.
- Sidebar: adicionar "📦 Pedidos Labs" (ou similar) em FINANCEIRO, adminOnly,
  ao lado de "Labs Parceiros".

### 3.6 O que explicitamente NÃO entra na Fase 2

Frete/Melhor Envio (fase 4), etiquetas/tubos consolidados (fase 3 — mas o
snapshot de `cor_tubo`/`material_volume_ml` nos itens já deixa pronto), estoque
(fase 5), maquininhas (fase 6), portais vet/clínica, resultado→laudo (fase 7),
motor fazer-vs-encaminhar (fase 8).

---

## 4. Bloqueios: perguntas da proposta × o que travam

Perguntas de `PROPOSTA_LABS_PARCEIROS.md` **ainda sem resposta**. A Fase 2 como
especificada acima é construível JÁ, com estes efeitos:

| Perguntas | O que travam | Como a Fase 2 convive sem resposta |
|---|---|---|
| **A.1** (preço vet/clínica) | Pedidos de origem vet/clínica | Backend recusa item sem `preco_parceiro`; na prática só origem `admin` flui. Preencher na tela/Excel destrava sozinho |
| **A.2-A.4** (preço direto, preço da clínica ao cliente, repasse) | Relatório de repasse de labs | Não construir repasse de labs ainda; `status_pagamento` fica manual |
| **A.5** (gratuidade) | — | Sem gratuidade no fluxo (não implementar) |
| **B.6-B.9** (critério mais vantajoso) | Motor fazer-vs-encaminhar (fase 8) | Nada na Fase 2 |
| **C.10-C.14** (CEPs, caixas, horário postagem) | Frete (fase 4) | Nada na Fase 2; `lab_laboratorios.endereco_json` fica nulo |
| **D.15-D.20** (coleta, janelas, requisição) | Detalhes da coleta | Default duração 30min comentado no código; requisição de coleta (folha de trabalho) adiar p/ fase 3 |
| **E.21-E.23** (tubos) | Consolidação de tubos (fase 3) | Snapshot dos campos de tubo nos itens já prepara |
| **F.24-F.29** (maquininhas) | Fase 6 | Nada |
| **G.30-G.33** (insumos) | Fase 5 | Nada |
| **H.34-H.36** (resultado/laudo) | Fase 7 | Nada |
| **I.37-I.38** (pagamento/faturamento) | Cobrança automática | Fase 2 registra `status_pagamento` manualmente (admin marca pago), sem Asaas/MP por ora |
| **J.39** (origem do pedido) | — | Já travada como decidida (tutor nunca marca sozinho) |

**Resumo pro Lucas cobrar da equipe:** as respostas que destravam valor mais
rápido são **A.1** (libera pedidos de parceiro — é só preencher a coluna no
Excel/tela) e **D.16-D.18** (janelas de coleta + o que a requisição precisa ter,
que é a fase 3).

---

## 5. Convenções do projeto (obrigatórias pra quem implementa)

- **DDL é só o Lucas** — gerar o `.sql`, avisar, esperar ele aplicar. DML em dev
  pode, mostrando o comando antes. NUNCA misturar credenciais dev/prd
  (dev `teozyceggokmsrmuitnj`, prd `ykhshkgdikjplnedtxye`).
- Auth de API: copiar o `requireAuth`/`requireAdmin` de `src/app/api/comissoes/route.ts`.
- Supabase client: `import { supabase } from '@/lib/supabase'` (service role,
  lazy proxy). Sem RLS policies — não criar.
- Erros de API: `NextResponse.json({ error: '...' }, { status })`, mensagens em PT-BR.
- Preço SEMPRE calculado no backend (nunca confiar em valor vindo do front) —
  ver `precificarExames` em `/api/admin/agendar` como referência do padrão.
- Verificar com `npx tsc --noEmit` e, se mexer no agente de WhatsApp (não deve),
  `npm run test:agent`.
- `migrate.mjs` divide o SQL por `;` — não usar `;` dentro de comentários, nem
  functions/triggers com corpo (se precisar de trigger, avisar o Lucas p/ rodar
  manual no SQL Editor).
- Commits: mensagens em PT-BR estilo `feat(labs): ...` (ver `git log`), sem
  `--no-verify`, sem push sem pedir.
