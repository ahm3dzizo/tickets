#!/bin/bash
set -e

cd /opt/retal-api

# Create .env if not exists
cat > .env << 'EOF'
DATABASE_URL="postgresql://retal:Retal2025!@localhost:5432/retal_db?schema=public"
EOF

# Install prisma if needed
if ! ls node_modules/.bin/prisma 2>/dev/null; then
  npm install prisma @prisma/client --save
fi

# Run migration / push schema
npx prisma db push --schema=./prisma/schema.prisma

echo "Prisma migration complete"
