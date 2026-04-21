#!/bin/bash
export PGPASSWORD="Retal2025!"
psql -U retal -d retal_db -h localhost << 'SQL'
SELECT uid, email, role FROM "User" LIMIT 10;
SQL
