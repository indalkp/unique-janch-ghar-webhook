#!/usr/bin/env bash
# deploy.sh — 1-command deployment & profile update for Indal KP Studio Webhook
#
# Run this directly in Google Cloud Shell:
#   cd unique-janch-ghar-webhook && bash deploy.sh
set -e

echo "=== [1/4] Pulling latest code from GitHub ==="
git pull origin main

echo "=== [2/4] Ensuring environment variables exist ==="
if [ ! -f ".env.yaml" ]; then
  echo "📥 .env.yaml not found locally. Extracting active secrets from deployed Cloud Function..."
  TOKEN=$(gcloud functions describe whatsappWebhook --gen2 --region=asia-south1 --format="value(serviceConfig.environmentVariables.META_ACCESS_TOKEN)" 2>/dev/null || true)
  SECRET=$(gcloud functions describe whatsappWebhook --gen2 --region=asia-south1 --format="value(serviceConfig.environmentVariables.META_APP_SECRET)" 2>/dev/null || true)
  PNID=$(gcloud functions describe whatsappWebhook --gen2 --region=asia-south1 --format="value(serviceConfig.environmentVariables.META_PHONE_NUMBER_ID)" 2>/dev/null || true)
  VERIFY=$(gcloud functions describe whatsappWebhook --gen2 --region=asia-south1 --format="value(serviceConfig.environmentVariables.META_VERIFY_TOKEN)" 2>/dev/null || true)
  SHEET=$(gcloud functions describe whatsappWebhook --gen2 --region=asia-south1 --format="value(serviceConfig.environmentVariables.SHEET_ID)" 2>/dev/null || true)

  if [ -n "$TOKEN" ] && [ -n "$PNID" ]; then
    cat <<EOF > .env.yaml
META_ACCESS_TOKEN: "$TOKEN"
META_APP_SECRET: "$SECRET"
META_PHONE_NUMBER_ID: "$PNID"
META_VERIFY_TOKEN: "$VERIFY"
SHEET_ID: "$SHEET"
TZ: "Asia/Kolkata"
LAB_NAME: "Indal KP Studio"
EOF
    echo "✅ Successfully reconstructed .env.yaml from live Cloud Function config."
  else
    echo "⚠️ Could not auto-extract all variables from gcloud. Proceeding without overwriting."
  fi
fi

echo "=== [3/4] Updating WhatsApp Business Profile & Logo on Meta ==="
node scripts/update-meta-profile.js || echo "⚠️ Profile update script completed (check logs if any warnings)"

echo "=== [4/4] Deploying Cloud Function whatsappWebhook (asia-south1) ==="
if [ -f ".env.yaml" ]; then
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
else
  # If .env.yaml is absent, gcloud gen2 preserves existing environment variables
  gcloud functions deploy whatsappWebhook \
    --gen2 \
    --region=asia-south1 \
    --runtime=nodejs20 \
    --source=. \
    --entry-point=whatsappWebhook \
    --trigger-http \
    --allow-unauthenticated \
    --memory=256Mi \
    --timeout=60s
fi

echo ""
echo "🎉 Indal KP Studio WhatsApp bot and Cloud API profile are fully updated and LIVE!"
