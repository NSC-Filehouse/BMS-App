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
      script: require.resolve("nodemon/bin/nodemon.js"),
      args: [
        "--delay", "5000ms",
        "--ext", "js,json,cjs,mjs",
        "--exec", "node --openssl-legacy-provider",
        "src/index.js"
      ],
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
