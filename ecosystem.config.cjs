/**
 * PM2 ecosystem config (CommonJS)
 * Start:
 *   pm2 start ecosystem.config.cjs
 */
module.exports = {
  apps: [
    {
      name: "bms-backend",
      cwd: "./apps/backend",
      script: "./src/index.js",
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "bms-frontend",
      cwd: "./apps/frontend",
      script: "./server/server.js",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
