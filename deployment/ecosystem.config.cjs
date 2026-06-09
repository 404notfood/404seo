// =============================================================================
// 404seo — PM2 Ecosystem Config
// =============================================================================
// Usage :
//   pm2 start deployment/ecosystem.config.cjs
//   pm2 reload deployment/ecosystem.config.cjs
//   pm2 logs
// =============================================================================

const path = require("path");
const root = path.resolve(__dirname, "..");

module.exports = {
  apps: [
    // ── Next.js 16 Frontend (:3030) ──────────────────────────────────────────
    {
      name: "404seo-site",
      cwd: path.join(root, "site/.next/standalone/site"),
      script: "server.js",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        PORT: "3030",
        HOSTNAME: "0.0.0.0",
      },
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      watch: false,
      max_memory_restart: "512M",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: path.join(root, "logs/site-error.log"),
      out_file: path.join(root, "logs/site-out.log"),
      merge_logs: true,
    },

    // ── Fastify API Backend (:4000) ──────────────────────────────────────────
    {
      name: "404seo-api",
      cwd: root,
      script: path.join(root, "node_modules/.bin/tsx"),
      args: "apps/api/src/index.ts",
      interpreter: "node",
      // Variables de prod via .env.production à la racine (ne jamais commiter)
      // ou définir directement via pm2 --env-file ou dans /etc/environment
      env: {
        NODE_ENV: "production",
        API_PORT: "4000",
      },
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      watch: false,
      max_memory_restart: "512M",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: path.join(root, "logs/api-error.log"),
      out_file: path.join(root, "logs/api-out.log"),
      merge_logs: true,
    },

    // ── BullMQ Crawl Worker ──────────────────────────────────────────────────
    {
      name: "404seo-worker",
      cwd: root,
      script: path.join(root, "node_modules/.bin/tsx"),
      args: "workers/crawl-worker.ts",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
      },
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      watch: false,
      max_memory_restart: "1G",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: path.join(root, "logs/worker-error.log"),
      out_file: path.join(root, "logs/worker-out.log"),
      merge_logs: true,
    },

    // ── BullMQ Schedule Worker (audits planifies) ───────────────────────────
    {
      name: "404seo-scheduler",
      cwd: root,
      script: path.join(root, "node_modules/.bin/tsx"),
      args: "workers/schedule-worker.ts",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
      },
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      watch: false,
      max_memory_restart: "256M",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: path.join(root, "logs/scheduler-error.log"),
      out_file: path.join(root, "logs/scheduler-out.log"),
      merge_logs: true,
    },
  ],
};
