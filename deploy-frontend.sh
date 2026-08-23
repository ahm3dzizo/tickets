#!/bin/bash

set -e

cd /opt/retal-api

echo "================ BUILD ================"

rm -rf dist
rm -rf node_modules/.vite

npm run build

echo
echo "================ DEPLOY ================"

rm -rf /var/www/retal/*
cp -r dist/* /var/www/retal/

echo
echo "================ NGINX ================"

sudo nginx -t
sudo systemctl reload nginx

echo
echo "================ VERIFY ================"

echo "Index:"
curl -ksI https://tickets.knot-sys.com/index.html | \
grep -Ei 'HTTP|cache-control|pragma|expires'

echo
echo "Frontend deployed successfully."
