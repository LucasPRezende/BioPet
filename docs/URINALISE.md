# Urinálise (analisador URIT UC-32B)

A máquina não conversa com o computador. Quem emite o laudo fotografa a **tela**
ou a **impressão** do resultado em `/admin/novo-urinalise` (celular abre a
câmera), o Gemini lê a sigla e o valor de cada parâmetro e a tela mostra tudo,
com a foto ao lado, para conferir antes de emitir. Exame físico e sedimentoscopia
são digitados na mesma tela.

- Fita **URIT 11G**: LEU, KET, NIT, URO, BIL, GLU, PRO, SG, pH, BLD, Vc.
- Fita **URIT 14G**: as 11 + MA, Ca, CR; a impressão traz também a ACR
  (relação albumina/creatinina) que a máquina calcula. A tela não mostra tudo
  de uma vez: são duas fotos (ou uma da impressão).

Migration: `supabase/migration_v53.sql`. Código: `src/lib/urinalise.ts` (regras
puras), `src/lib/ler-urina-foto.ts` (Gemini), `src/lib/generate-urinalise-pdf.ts`.

## Regras (entram na Etapa 8 — Laudos e na Etapa 10 — Estoque de `REGRAS_DE_NEGOCIO.md`)

| # | Regra | Onde | Teste |
|---|-------|------|-------|
| U.1 | Dois exames no catálogo, "Urinálise (11 parâmetros)" e "Urinálise (14 parâmetros)", nascem **inativos e com preço 0**: só aparecem para agendar (painel e IA) depois de ganhar preço e ser ativados em Preços. | `migration_v53` | — |
| U.2 | O tipo de fita sai do nome do exame; o laudo é gravado com o **nome do exame do agendamento** com aquela fita (ou o de Preços, sem agendamento), para agenda, comissão, duplicidade e estoque baterem. | `fitaDoExame`, `salvar-urinalise` | ✅ |
| U.3 | Não emite sem paciente, espécie e ao menos um resultado da fita; fita 11 com parâmetro que só a 14 tem (MA, Ca, CR, ACR) é recusada (foto da amostra ou exame trocado). | `validarUrinalise` | ✅ |
| U.4 | A foto só transcreve; a interpretação é do código: Neg/Normal = 0, Pos = 1, "<=1" e "<30" mantêm o sinal. Resultado acima do máximo ou abaixo do mínimo da referência da espécie sai **Alterado/Baixo**; sem referência, só o valor. | `lerValorUrina`, `statusUrina` | ✅ |
| U.5 | Referências por espécie editáveis em `/admin/urinalise/referencias` (só admin grava). Seed de literatura — **revisar com a Andreza**. A referência humana que a máquina usa para o "!" é ignorada. | `urinalise_referencia` | — |
| U.6 | Ácido ascórbico presente gera nota automática de possível falso-negativo (glicose, sangue, bilirrubina, nitrito). | `notasAutomaticas` | ✅ |
| U.7 | Parâmetro da fita que a foto não trouxe é apontado na tela antes de emitir (ACR não é cobrada: só sai na impressão). | `parametrosFaltando` | ✅ |
| U.8 | Cada laudo de urinálise dá baixa de **1 fita** do seu tipo (PEPS) e grava o custo no laudo; falha no estoque não impede a emissão. Agendamentos em aberto sem laudo reservam a fita. | `exame_consumiveis`, `consumoExame` | ✅ (baixa) |
| U.9 | Só 1 laudo por exame de urinálise do agendamento; o agendamento conclui quando todos os exames têm laudo. | `jaTemLaudo` | ✅ |
