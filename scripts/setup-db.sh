#!/bin/bash
set -e

# Create user if not exists
sudo -u postgres psql -tc "SELECT 1 FROM pg_user WHERE usename='retal'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER retal WITH PASSWORD 'Retal2025!';"

# Set password (idempotent)
sudo -u postgres psql -c "ALTER USER retal WITH PASSWORD 'Retal2025!';"

# Create database if not exists
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='retal_db'" | grep -q 1 || \
  sudo -u postgres createdb -O retal retal_db

echo "DB setup complete"
