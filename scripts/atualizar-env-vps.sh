#!/bin/bash
# Script para atualizar as credenciais de produção no VPS
# Execute com: bash scripts/atualizar-env-vps.sh

set -e

VPS="root@83.136.219.44"
KEY="$HOME/.ssh/biopet_vps"
ENV="/var/www/biopet/.env.local"

# ─── PREENCHA OS VALORES ABAIXO ──────────────────────────────────────────────

# Mercado Pago (conta da Luciana)
# Encontre em: mercadopago.com.br/developers → Suas aplicações → Credenciais de produção
MP_ACCESS_TOKEN="COLOQUE_O_ACCESS_TOKEN_AQUI"
MP_PUBLIC_KEY="COLOQUE_O_PUBLIC_KEY_AQUI"

# Webhook secret do Mercado Pago
# Encontre em: mercadopago.com.br/developers → Webhooks → Chave secreta
MP_WEBHOOK_SECRET="COLOQUE_O_WEBHOOK_SECRET_AQUI"

# WhatsApp das administradoras (com DDI 55 + DDD)
# Exemplo: 5524999999999
ADMIN_WHATSAPP_ANDREZA="55249XXXXXXXX"   # telefone da Andreza
ADMIN_WHATSAPP_LUCIANA="55249XXXXXXXX"   # telefone da Luciana

# ─────────────────────────────────────────────────────────────────────────────

echo "Atualizando credenciais e configurações no VPS..."

ssh -i "$KEY" "$VPS" bash << REMOTE
  # Mercado Pago
  sed -i 's|^MP_ACCESS_TOKEN=.*|MP_ACCESS_TOKEN=$MP_ACCESS_TOKEN|' $ENV
  sed -i 's|^MP_PUBLIC_KEY=.*|MP_PUBLIC_KEY=$MP_PUBLIC_KEY|' $ENV
  sed -i 's|^MP_WEBHOOK_SECRET=.*|MP_WEBHOOK_SECRET=$MP_WEBHOOK_SECRET|' $ENV

  # NEXT_PUBLIC_MP_PUBLIC_KEY (para SDK frontend)
  grep -q 'NEXT_PUBLIC_MP_PUBLIC_KEY' $ENV \
    && sed -i 's|^NEXT_PUBLIC_MP_PUBLIC_KEY=.*|NEXT_PUBLIC_MP_PUBLIC_KEY=$MP_PUBLIC_KEY|' $ENV \
    || echo "NEXT_PUBLIC_MP_PUBLIC_KEY=$MP_PUBLIC_KEY" >> $ENV

  # WhatsApp das administradoras
  sed -i 's|^ADMIN_WHATSAPP_1=.*|ADMIN_WHATSAPP_1=$ADMIN_WHATSAPP_ANDREZA|' $ENV
  sed -i 's|^ADMIN_WHATSAPP_2=.*|ADMIN_WHATSAPP_2=$ADMIN_WHATSAPP_LUCIANA|' $ENV

  echo "Env atualizado:"
  grep -E 'MP_ACCESS_TOKEN|MP_PUBLIC_KEY|MP_WEBHOOK|ADMIN_WHATSAPP|NEXT_PUBLIC_MP' $ENV \
    | sed 's/=.*/=***/'

  # Reinicia com novas variáveis
  cd /var/www/biopet
  pm2 restart biopet --update-env
  sleep 3
  pm2 list | grep biopet
REMOTE

echo ""
echo "Feito! Verifique: https://biopetvet.com"
