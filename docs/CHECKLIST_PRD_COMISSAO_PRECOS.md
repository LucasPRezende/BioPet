# Deploy em PRD — comissão por beneficiário + tela de Preços 2a

Branch `feature/comissao-por-beneficiario` (3 commits sobre o master `0eee769`; entra por fast-forward).
Validado em DEV e na homologação em 16/10/2026.

## Ordem (importa)

As migrations entram **antes** do código. O código novo filtra `comissoes_exame.ativo` na
tabela de preços do agente: sem a v49, o agente fica sem preços. O código antigo funciona
com as colunas novas (as migrations só acrescentam).

| # | Passo | Quem |
|---|-------|------|
| 1 | Supabase PRD (`ykhshkgdikjplnedtxye`) → SQL Editor: rodar `supabase/migration_v48.sql` e as consultas de conferência do fim do arquivo | Lucas |
| 2 | Rodar `supabase/migration_v49.sql` e a conferência | Lucas |
| 3 | Rodar `supabase/prd_ajuste_hemogramas_v48.sql` (4 Hemogramas da Clive → R$ 20) | Lucas, ou Claude com OK |
| 4 | Merge do branch no `master` (fast-forward) + push | Claude |
| 5 | VPS: `cd /var/www/biopet && git pull && npm run build && pm2 restart biopet` | Claude |
| 6 | Conferências pós-deploy (abaixo) | Claude + Lucas |

## O que esperar depois da v48 (conferido no PRD em 16/10/2026)

| Exame | valor_comissao hoje | Vai para |
|---|---|---|
| Raio-X, Raio-X Acréscimo | 30 | laudo |
| RX CONTRASTADO | 90 | laudo |
| Hemograma | 30 | **clínica** |
| RETICULÓCITOS | 7 | **clínica** (decisão: acompanha o hemograma) |
| Hemogasometria | 15 | **extração** |
| Demais | 0 | — |

## Conferências pós-deploy

- [ ] `https://biopetvet.com/login` responde 200; `pm2 logs biopet --err` sem erro novo.
- [ ] **Preços**: carrega as 3 abas; todos os exames aparecem ativos.
- [ ] Alerta "cobra R$ 0,00" lista só **Cistocentese** → desativar pelo toggle e "Revisar e salvar" (decisão do Lucas).
- [ ] **Dashboard**: "Comissão extração" (outubro: R$ 15), "Comissão a clínicas" e o novo "Lucro BioPet (est.)".
- [ ] **Relatório de clínicas**: o agendamento 557 (Teste Rápido, tutor ainda não pagou) sai do "a pagar" e fica aguardando; os 14 já pagos pelo tutor (R$ 1.700) continuam a pagar.
- [ ] Agente: rodar a skill de verificação do agente (tabela de preços respondendo e sem erro).

## Mudanças de regra que vão aparecer em PRD

- Comissão de clínica só fica devida depois que a BioPet recebe do tutor; gratuito nunca gera.
- O lucro do Dashboard passa a descontar a extração e a comissão de clínica já paga (antes só descontava a pendente).
- Laudo de Hemogasometria deixa de creditar R$ 15 a quem laudou (fica só o extrator). Laudos antigos não mudam.
- Exame novo nasce inativo; "Remover exame" virou "Desativar".

## Rollback

Código: na VPS, `git reset --hard 0eee769 && npm run build && pm2 restart biopet`.
Migrations: não precisam ser desfeitas (só acrescentam colunas/tabela/função; o código antigo ignora).
