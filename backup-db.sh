#!/bin/bash
BACKUP_DIR=/opt/retal-api/db-backups
mkdir -p $BACKUP_DIR
FILENAME="retal_db_$(date +%Y%m%d_%H%M).sql.gz"
pg_dump postgresql://retal:Retal2025\!@localhost:5432/retal_db | gzip > $BACKUP_DIR/$FILENAME
# Keep only last 7 backups
ls -t $BACKUP_DIR/*.sql.gz | tail -n +8 | xargs rm -f 2>/dev/null
echo "Backup done: $FILENAME"
