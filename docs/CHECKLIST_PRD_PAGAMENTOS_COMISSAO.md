# Checklist de PRD — Pagamentos de comissão (migration v46)

Estado: tudo validado no **DEV**; nada foi para produção. Esta lista é a ordem de
execução. Quem roda DDL (migration) é o Lucas.

## 0. Decisão antes de começar: de qual branch sai o deploy

O código vive na branch `feature/estoque-consumiveis`, que está **4 commits à
frente do `master`**: estoque (v44/v45) e correções de revisão. O
`src/app/admin/dashboard/page.tsx` já carrega os alertas de estoque, então a
alteração do dashboard desta feature **depende** dessa branch.

- **Opção A (mais simples):** fazer deploy da branch inteira. Exige antes rodar
  `migration_v44.sql` e `migration_v45.sql` no PRD (e `migration_v43.sql`, se
  ainda pendente: coluna `comissao_clinica_id`). Confira o que já foi aplicado.
- **Opção B:** criar branch nova a partir do `master` só com os arquivos do v46.
  Dá conflito no `dashboard/page.tsx`: seria preciso reaplicar à mão a troca das
  duas seções de "Pagar" pela seção "Comissões a pagar".

Os arquivos desta feature:

- `supabase/migration_v46.sql`
- `src/lib/comissao-saldo.ts`
- `src/lib/__tests__/comissao-saldo.test.ts`
- `src/lib/__tests__/pagamentos-comissao-route.test.ts`
- `src/app/api/admin/pagamentos-comissao/` (route, `[id]/estornar`, `extrato`)
- `src/app/admin/pagamentos-comissao/page.tsx`
- `src/components/Sidebar.tsx` (item "Pagamentos")
- `src/app/admin/dashboard/page.tsx` (seção "Comissões a pagar")
- `src/app/admin/extracoes/page.tsx` e `src/app/api/admin/extracoes/route.ts`
  (sem botões de pagar; aba "Atribuídas no mês")
- `src/app/api/admin/extracoes/[id]/route.ts` (sem o bloco "marcar pago")
- **Apagados:** `src/app/api/admin/extracoes/marcar-pago/route.ts` e
  `src/app/api/admin/comissoes-pagamento/route.ts`

## 1. Antes da migration (leitura, sem risco)

Já confirmado em leitura no PRD (projeto `ykhshkgdikjplnedtxye`):

- Existe 1 usuário **Lucas Orgal** (`system_users.id = 4`, `recebe_comissao = true`)
  e 1 vet **LUCAS ORGAL** (`veterinarios.id = 4`). O vínculo automático da
  migration (`%lucas%orgal%`, exatamente 1 de cada) vai funcionar.
- `veterinarios.system_user_id` e `pagamentos_comissao` ainda **não existem** no PRD.
- A Andreza (usuário e vet) tem `recebe_comissao = false`: não entra nos saldos.

Ainda não visto (leitura bloqueada): **quanto vira saldo inicial**. Rode no SQL
Editor do PRD para ver antes de aplicar (só SELECT):

```sql
WITH comissoes AS (
  SELECT 'usuario'::TEXT AS pessoa_tipo, l.system_user_id AS pessoa_id,
         l.valor_comissao AS valor, l.criado_em::DATE AS data_ref,
         l.comissao_paga
    FROM laudos l
    JOIN system_users su ON su.id = l.system_user_id
   WHERE su.recebe_comissao IS DISTINCT FROM FALSE AND COALESCE(l.valor_comissao,0) > 0
  UNION ALL
  SELECT CASE WHEN lower(v.nome) LIKE '%lucas%orgal%' THEN 'usuario' ELSE 'veterinario' END,
         CASE WHEN lower(v.nome) LIKE '%lucas%orgal%' THEN 4 ELSE v.id END,
         a.comissao_extracao, a.data_hora::DATE, a.comissao_paga
    FROM agendamentos a
    JOIN veterinarios v ON v.id = a.vet_extracao_id
   WHERE COALESCE(a.comissao_extracao,0) > 0
)
SELECT pessoa_tipo, pessoa_id,
       SUM(valor) FILTER (WHERE data_ref <  DATE '2026-10-01' AND NOT comissao_paga) AS saldo_inicial,
       SUM(valor) FILTER (WHERE data_ref >= DATE '2026-10-01' AND comissao_paga)     AS legado_pago_apos_corte,
       SUM(valor) FILTER (WHERE data_ref >= DATE '2026-10-01' AND NOT comissao_paga) AS gerado_a_pagar
  FROM comissoes GROUP BY 1, 2 ORDER BY 3 DESC NULLS LAST;
```

Atenção ao `saldo_inicial`: se for alto, pode ser comissão antiga que nunca foi
baixada. Decida agora se aceita ou se prefere acertar o legado primeiro.

## 2. Backup

- Supabase PRD: confirmar backup/PITR recente (Database → Backups) antes do DDL.

## 3. Janela de execução (migration e deploy juntos)

A migration **precisa vir antes do deploy**. Sem as tabelas, a tela nova e o
dashboard quebram. Mas o código antigo continua marcando `comissao_paga` até o
deploy:

- **Não clique em "Pagar" / "Marcar pago" nas telas antigas** entre a migration e
  o deploy. A baixa legado (passo 4b da migration) roda uma vez por pessoa: o que
  for baixado depois dela **não** vira pagamento legado e o saldo ficaria inflado.
- Se acontecer, registre esse valor na tela nova como pagamento manual.

## 4. Execução

1. Rodar `supabase/migration_v46.sql` no SQL Editor do **PRD**, no arquivo
   inteiro de uma vez.
2. Conferir o resultado final (lista de saldos iniciais) contra a prévia do passo 1.
3. Conferir o vínculo:
   ```sql
   SELECT id, nome, system_user_id FROM veterinarios WHERE id = 4;  -- deve ser 4
   ```
4. Security Advisor: `pagamentos_comissao` e `saldo_inicial_comissao` com RLS
   ligado e sem policy é **esperado** (INFO 0008), como as demais.
5. Deploy do código (fluxo da VPS):
   ```powershell
   git push origin <branch>
   ssh -i "C:\Users\Lucas\.ssh\biopet_vps" root@83.136.219.44 "cd /var/www/biopet && git branch --show-current && git pull && npm run build 2>&1 | tail -10 && pm2 restart biopet && echo DONE"
   ```
   Conferir que o `git branch --show-current` é a branch certa e que o pull
   **trouxe** as mudanças (não "Already up to date").

## 5. Validação em PRD (nesta ordem)

- [ ] `/admin/pagamentos-comissao` abre e os saldos batem com a prévia.
- [ ] Lucas Orgal aparece **uma vez só**, com laudos e extrações somados.
- [ ] Dashboard mostra "Comissões a pagar" e o link para Pagamentos.
- [ ] `/admin/extracoes` sem nenhum botão de pagar; atribuir vet continua funcionando.
- [ ] Registrar um pagamento de teste de valor pequeno e **estornar** em seguida
      (fica no histórico como estornado; não dá para apagar pela tela).
- [ ] Console do navegador e `pm2 logs biopet` sem erros.

## 6. Pontos de atenção

- Pagamento errado: use **Estornar** (motivo obrigatório). Nada é apagado.
- Pagar a mais vira adiantamento e abate das próximas comissões.
- Vet que passar a ter usuário **depois** da migration: ao vincular, mover também
  as linhas de `saldo_inicial_comissao` e `pagamentos_comissao` da chave
  `veterinario` para `usuario`, senão o saldo antigo fica separado.
- Campos `comissao_paga` / `comissao_paga_em` ficam congelados como legado; o
  saldo novo não depende deles depois da migration.
- Reverter: o código antigo ainda funciona com as tabelas novas presentes (elas
  só não são usadas). Para voltar, é só redeployar a versão anterior; os
  pagamentos já registrados ficariam nas tabelas novas, fora do fluxo antigo.

## 7. Chaves de PRD

O `.env.prd.local` tem a chave legada desativada (rotação de 12/09) e a
`sb_secret_` nova. Se for usar para leitura de conferência, use a `sb_secret_` e
confira o ref `ykhshkgdikjplnedtxye` antes.
