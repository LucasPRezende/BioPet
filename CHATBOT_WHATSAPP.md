# Chatbot de marcação de exames via WhatsApp — Especificação / Plano

> Documento de partida para implementar o bot de agendamento por WhatsApp.
> Sistema: Next.js 14 (App Router) self-hosted em VPS (não Vercel). Banco: Supabase (Postgres).
> Evolution API para WhatsApp. Status: **o agente ainda NÃO está em uso.**

---

## 1. Objetivo
Permitir que o **cliente final (tutor)** marque exames conversando pelo WhatsApp:
identificar o tutor pelo número → escolher exame e pet → ver horários livres →
confirmar → criar o agendamento → enviar link de pagamento. O cliente recebe o
laudo depois (já implementado: PDF direto via WhatsApp; link de laudo é fechado/exige login).

## 2. O que JÁ existe (reaproveitar)
- **Evolution API** integrada — `src/lib/evolution.ts`: `sendWhatsAppText`, `sendWhatsAppDocument` (envia base64).
  Envs: `EVOLUTION_API_URL` (https://evolution.biopetvet.com), `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`.
- **Camada de API do agente** `/api/agente/*`, protegida por header `x-api-key` = `AGENT_API_KEY`
  (`src/lib/agent-auth.ts` → `verifyAgentKey`). Endpoints existentes:
  - `precos` (tabela de preços; **público, sem key**), `horarios-livres`, `contexto`, `configuracoes`
  - `cadastrar-tutor`, `cadastrar-pet`
  - `agendar`, `cancelar`, `remarcar`, `meus-agendamentos`, `laudo`, `notificar`
- `AGENT_USER_ID` (=6 em prod) — usuário do sistema que representa o agente.
- Coluna `agendamentos.origem` (marca a fonte). **OBS:** hoje o default é `'agente'` e está enganoso —
  ver pendência de corrigir (admin→'manual'); o bot deve gravar `origem='agente'` explicitamente.
- Conflito de horário, horários livres, feriados e horário de funcionamento já existem
  (`/api/agendamentos/horarios-livres`, `/api/feriados/horario`, `verificarConflito`).

## 3. O que FALTA construir
- **Webhook de recepção** de mensagens (hoje só há envio): `POST /api/agente/webhook` que a Evolution chama.
- **Orquestrador da conversa** + **estado** (tabela nova `conversas`, chaveada por telefone).
- **NLU/condução** (Claude com tool calling) — ver decisões abaixo.
- Wrappers das ações como "tools" (na prática, chamadas aos `/api/agente/*` existentes).

## 4. Decisões de arquitetura
### 4.1 Quem conduz: IA vs estruturado → **HÍBRIDO**
- Claude (Anthropic API, tool calling) entende a intenção e conduz em linguagem natural.
- Passos **críticos** (escolher horário, confirmar agendamento) usam **listas/botões interativos
  do WhatsApp** — evita a IA "inventar" horário e tira ambiguidade da ação.

### 4.2 Onde roda: n8n vs serviço próprio → **SERVIÇO PRÓPRIO**
- Endpoint Next.js na VPS (`/api/agente/webhook`) com a inteligência — versionado, testável,
  integra direto com banco e endpoints. n8n pode ser só o "cano" do WhatsApp, ou a Evolution
  aponta o webhook direto pro endpoint.

### 4.3 LLM
- **Claude via Anthropic API** (tool calling). Projeto é self-hosted; usar a API direto
  (ou AI Gateway). Custo baixo para o volume de uma clínica.

## 5. Arquitetura
```
WhatsApp → Evolution → POST /api/agente/webhook
                          │
        ┌─────────────────┼──────────────────┐
   estado da conversa   Claude (tool       envia resposta via
   (tabela `conversas`  calling)           Evolution (texto / lista)
    por telefone)        ↓ tools = /api/agente/*:
                          precos, horarios-livres,
                          cadastrar-tutor/pet, agendar,
                          gerar link de pagamento
```

## 6. Fluxo de marcação
1. Mensagem recebida → identifica tutor pelo telefone (cadastra se novo: nome + pet).
2. Entende o exame (consulta `precos`) e informa o valor.
3. Lista **horários livres** (botões) respeitando funcionamento/feriados.
4. Resumo + confirmação explícita → cria via `agente/agendar` (origem `agente`).
5. Gera e envia o **link de pagamento** (PIX/cartão).

## 7. Pré-requisitos e regras de negócio
- **PRÉ-REQUISITO: refatoração de pricing (ao menos Fase 0).** Hoje `agente/agendar` **NÃO cria
  `agendamento_exames` nem calcula preço** (horário especial, etc.). O bot precisa do valor correto —
  então centralizar o cálculo em `src/lib/pricing.ts` e usá-lo no bot. Ver memória `pricing-refactor`.
- **Gratuidade é exclusiva de admin** — o bot NUNCA marca exame gratuito. Ver memória `gratuidade-admin-only`.
- **Confirmação humana**: começar com agendamento do bot entrando como **pendente** para o admin
  confirmar na agenda (mais seguro). Depois, avaliar auto-confirmar.

## 8. Guardrails
- Só agenda em horário realmente livre (usar `horarios-livres`) e dentro do funcionamento.
- Confirmação explícita antes de criar o agendamento.
- Fallback para humano ("vou chamar um atendente") quando não entender.
- **Nada de orientação clínica** — só agendamento/informação operacional.
- Rate limit por número; timeout/expiração da conversa.

## 9. MVP incremental (menor risco)
- **v1 — estruturado**: webhook + estado + menu/listas ("1) Marcar exame, 2) Ver laudo…").
  Valida o encanamento Evolution↔sistema, previsível e barato.
- **v2 — IA**: adiciona Claude para linguagem livre na entrada e fluidez, mantendo confirmações estruturadas.

## 10. Variáveis de ambiente relevantes (já existem no .env da VPS)
`EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`, `AGENT_API_KEY`, `AGENT_USER_ID`,
`NEXT_PUBLIC_URL`/`NEXT_PUBLIC_APP_URL`. Para o LLM: adicionar a chave da Anthropic API.

`EVOLUTION_WEBHOOK_SECRET` — segredo compartilhado do webhook de recepção. **Obrigatório**: sem ele
o `POST /api/agente/webhook` rejeita tudo com 401 (falha fechada), porque o telefone que autoriza
cancelar/remarcar/receber laudo vem do corpo da requisição. A Evolution precisa mandar o mesmo valor
no header `x-webhook-token` (ou `apikey`):

```bash
curl -X POST "$EVOLUTION_API_URL/webhook/set/$EVOLUTION_INSTANCE"   -H "apikey: $EVOLUTION_API_KEY" -H 'Content-Type: application/json'   -d '{"webhook":{"enabled":true,"url":"https://biopetvet.com/api/agente/webhook",
       "events":["MESSAGES_UPSERT"],"headers":{"x-webhook-token":"<EVOLUTION_WEBHOOK_SECRET>"}}}'
```

## 11. Arquivos/endpoints de referência
- `src/lib/evolution.ts` (envio WhatsApp), `src/lib/agent-auth.ts` (verifyAgentKey)
- `src/app/api/agente/*` (ações já prontas) — atenção: `agente/agendar/route.ts` precisa evoluir
  para criar `agendamento_exames` + calcular preço (via pricing.ts)
- `src/app/api/pagamentos/*` (criar-pix, gerar-link) para o link de pagamento
- `/admin/configuracoes/agente` (config do agente já existe na UI)
