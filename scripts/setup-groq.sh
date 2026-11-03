#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────
#  Groq API Setup
#  Run from the project root:  bash scripts/setup-groq.sh
# ────────────────────────────────────────────────────────────────

set -euo pipefail

ENV_FILE=".env"

echo ""
echo "┌─────────────────────────────────────────┐"
echo "│        Groq API Key Setup               │"
echo "│  Free tier: ~1,000 req/day              │"
echo "│  30 tickets/request = 30,000 tickets    │"
echo "└─────────────────────────────────────────┘"
echo ""

# Prompt for key (hidden input)
read -rsp "Enter your GROQ_API_KEY: " GROQ_KEY
echo ""

if [[ -z "$GROQ_KEY" ]]; then
  echo "❌  No key entered — aborting."
  exit 1
fi

# Validate key format (starts with gsk_)
if [[ ! "$GROQ_KEY" =~ ^gsk_ ]]; then
  echo "⚠️   Key doesn't start with 'gsk_' — double-check it."
  read -rp "Continue anyway? [y/N] " CONFIRM
  [[ "$CONFIRM" =~ ^[Yy]$ ]] || exit 1
fi

# Add or update in .env
if [[ -f "$ENV_FILE" ]]; then
  if grep -q "^GROQ_API_KEY=" "$ENV_FILE"; then
    # Update existing line
    sed -i "s|^GROQ_API_KEY=.*|GROQ_API_KEY=$GROQ_KEY|" "$ENV_FILE"
    echo "✅  Updated GROQ_API_KEY in $ENV_FILE"
  else
    # Append new line
    echo "" >> "$ENV_FILE"
    echo "GROQ_API_KEY=$GROQ_KEY" >> "$ENV_FILE"
    echo "✅  Added GROQ_API_KEY to $ENV_FILE"
  fi
else
  echo "GROQ_API_KEY=$GROQ_KEY" > "$ENV_FILE"
  echo "✅  Created $ENV_FILE with GROQ_API_KEY"
fi

# Optional: set model (default is llama-3.3-70b-versatile)
echo ""
echo "Available Groq models (for Arabic ticket classification):"
echo "  1) openai/gpt-oss-120b               (default — best accuracy, 100% on test)"
echo "  2) allam-2-7b                        (Arabic native model)"
echo "  3) canopylabs/orpheus-arabic-saudi   (Saudi Arabic dialect)"
echo "  4) qwen/qwen3.8-27b                  (multilingual, 27B)"
echo "  5) Keep current / skip"
echo ""
read -rp "Choose model [1/2/3/4/5]: " MODEL_CHOICE

MODEL=""
case "$MODEL_CHOICE" in
  1) MODEL="openai/gpt-oss-120b" ;;
  2) MODEL="allam-2-7b" ;;
  3) MODEL="canopylabs/orpheus-arabic-saudi" ;;
  4) MODEL="qwen/qwen3.8-27b" ;;
  *) MODEL="" ;;
esac

if [[ -n "$MODEL" ]]; then
  if grep -q "^GROQ_MODEL=" "$ENV_FILE"; then
    sed -i "s|^GROQ_MODEL=.*|GROQ_MODEL=$MODEL|" "$ENV_FILE"
  else
    echo "GROQ_MODEL=$MODEL" >> "$ENV_FILE"
  fi
  echo "✅  GROQ_MODEL set to $MODEL"
fi

echo ""
echo "────────────────────────────────────────────"
echo "Done! Restart the server to activate Groq."
echo ""
echo "To test classification:"
echo "  npx tsx scripts/test-groq-classify.ts"
echo "────────────────────────────────────────────"
