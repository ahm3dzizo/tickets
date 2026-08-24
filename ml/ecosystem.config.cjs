module.exports = {
  apps: [{
    name:        "retal-ml",
    script:      "/opt/retal-api/ml/.venv/bin/python",
    args:        "ml/classifier_service.py",
    cwd:         "/opt/retal-api",
    interpreter: "none",
    autorestart: true,
    watch:       false,
    env: {
      PATH: "/home/ubuntu/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    },
    error_file:  "/home/ubuntu/.pm2/logs/retal-ml-error.log",
    out_file:    "/home/ubuntu/.pm2/logs/retal-ml-out.log",
  }],
};
