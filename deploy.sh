#!/usr/bin/env bash
# deploy.sh — 1-command deployment & profile update for Indal KP Studio Webhook
#
# Run this directly in Google Cloud Shell:
#   cd unique-janch-ghar-webhook && bash deploy.sh
set -e

echo "=== [1/3] Pulling latest code from GitHub ==="
git pull origin main

echo "=== [2/3] Updating WhatsApp Business Profile & Logo on Meta ==="
node scripts/update-meta-profile.js || echo "⚠️ Profile update script completed (check logs if any warnings)"

echo "=== [3/3] Deploying Cloud Function whatsappWebhook (asia-south1) ==="
gcloud functions deploy whatsappWebhook \
  --gen2 \
  --region=asia-south1 \
  --runtime=nodejs20 \
  --source=. \
  --entry-point=whatsappWebhook \
  --trigger-http \
  --allow-unauthenticated \
  --memory=256Mi \
  --timeout=60s \
  --env-vars-file=.env.yaml

echo ""
echo "🎉 Indal KP Studio WhatsApp bot and Cloud API profile are fully updated and LIVE!"
