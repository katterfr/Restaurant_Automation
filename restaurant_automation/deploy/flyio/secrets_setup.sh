#!/usr/bin/env bash
# deploy/flyio/secrets_setup.sh
# Run this script ONCE after `fly launch` to set all secrets.
# Edit the values below before running.
# Usage: chmod +x deploy/flyio/secrets_setup.sh && ./deploy/flyio/secrets_setup.sh

set -e

echo "🔐 Setting Fly.io secrets for restaurant-automation..."

fly secrets set \
  OPENAI_API_KEY="sk-REPLACE_ME" \
  TWILIO_ACCOUNT_SID="AC_REPLACE_ME" \
  TWILIO_AUTH_TOKEN="REPLACE_ME" \
  TWILIO_PHONE_NUMBER="+1REPLACE_ME" \
  SENDGRID_API_KEY="SG.REPLACE_ME" \
  ALERT_EMAIL_FROM="noreply@myrestaurant.com" \
  ALERT_EMAIL_TO="owner@myrestaurant.com" \
  ALERT_EMAIL_CC="" \
  DOORDASH_DEVELOPER_ID="REPLACE_ME" \
  DOORDASH_KEY_ID="REPLACE_ME" \
  DOORDASH_SIGNING_SECRET="REPLACE_ME" \
  UBEREATS_CLIENT_ID="REPLACE_ME" \
  UBEREATS_CLIENT_SECRET="REPLACE_ME" \
  UBEREATS_STORE_ID="REPLACE_ME" \
  WEBSITE_API_URL="https://yoursite.com/api" \
  WEBSITE_API_KEY="REPLACE_ME"

echo ""
echo "⚠️  Don't forget to set REDIS_URL!"
echo "   Run: fly redis create"
echo "   Then: fly secrets set REDIS_URL=redis://..."
echo ""
echo "✅ Secrets set. Deploy with: fly deploy"
