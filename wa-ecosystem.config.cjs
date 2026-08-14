module.exports = {
  apps: [{
    name: 'wa-automate',
    script: '/opt/retal-api/node_modules/.bin/wa-automate',
    args: '--port 8002 --api-key ad74dd92fe40db79b614b10f7ae3cf31 --session-data-path /opt/retal-api/wa-sessions --use-chrome --no-sandbox --headless --qr-timeout 0 --auth-timeout 0',
    cwd: '/opt/retal-api',
    env: {
      PUPPETEER_EXECUTABLE_PATH: '/usr/bin/chromium',
      PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: 'true',
      NODE_ENV: 'production'
    },
    autorestart: true,
    restart_delay: 10000,
    max_restarts: 5
  }]
};
