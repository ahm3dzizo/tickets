#!/bin/bash
# scripts/auto-retrain.sh
# ────────────────────────
# Runs every 3 days via cron:
#   1. Export classified tickets from DB → ml/db_tickets.csv
#   2. Retrain ML model
#   3. Restart ML service
#   4. Reclassify all tickets with new model

set -e
cd /opt/retal-api

LOG="/opt/retal-api/logs/auto-retrain.log"
mkdir -p /opt/retal-api/logs

echo "" >> "$LOG"
echo "══════════════════════════════════" >> "$LOG"
echo "$(date '+%Y-%m-%d %H:%M')  Auto-Retrain Start" >> "$LOG"
echo "══════════════════════════════════" >> "$LOG"

echo "▶ Exporting DB tickets..." | tee -a "$LOG"
npx tsx scripts/retrain-from-db.ts >> "$LOG" 2>&1

echo "▶ Retraining main ML model..." | tee -a "$LOG"
python3 ml/train.py >> "$LOG" 2>&1

echo "▶ Retraining sub-type models..." | tee -a "$LOG"
python3 ml/train_subtype.py >> "$LOG" 2>&1

echo "▶ Restarting ML service..." | tee -a "$LOG"
pm2 restart retal-ml >> "$LOG" 2>&1
sleep 3

echo "▶ Reclassifying all tickets..." | tee -a "$LOG"
npx tsx scripts/reclassify-all.ts >> "$LOG" 2>&1

echo "✔ Auto-Retrain Done  $(date '+%H:%M')" | tee -a "$LOG"
