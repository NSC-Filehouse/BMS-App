import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createProxyMiddleware } from 'http-proxy-middleware';
import fs from 'fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function ensureNoTrailingSlash(p) {
  if (!p) return '';
  return p.endsWith('/') ? p.slice(0, -1) : p;
}

const HOST = process.env.FRONTEND_HOST || '0.0.0.0';
const PORT = parseInt(process.env.FRONTEND_PORT || '3090', 10);

const APP_BASE_PATH = ensureNoTrailingSlash(process.env.APP_BASE_PATH || '/bms-app');
const BACKEND_TARGET = process.env.BACKEND_PROXY_TARGET || 'http://127.0.0.1:3091';
const BACKEND_API_BASE_PATH = ensureNoTrailingSlash(process.env.BACKEND_API_BASE_PATH || '/api');

const app = express();

// Redirect root -> /bms-app
app.get('/', (req, res) => res.redirect(`${APP_BASE_PATH}/`));

// Proxy: /bms-app/api/* -> http://127.0.0.1:3091/api/*
app.use(
  `${APP_BASE_PATH}/api`,
  createProxyMiddleware({
    target: BACKEND_TARGET,
    changeOrigin: true,
    pathRewrite: (p) => p.replace(`${APP_BASE_PATH}/api`, BACKEND_API_BASE_PATH),
    logLevel: 'warn',
  })
);

const distPath = path.resolve(__dirname, '..', 'dist');
const indexFile = path.join(distPath, 'index.html');

if (!fs.existsSync(distPath) || !fs.existsSync(indexFile)) {
  console.warn('[bms-frontend] dist/ nicht gefunden. Bitte zuerst "npm run build" in apps/frontend ausführen.');
}

// Static assets unter /bms-app
app.use(APP_BASE_PATH, express.static(distPath, { index: false }));

// SPA fallback (React Router)
app.get(`${APP_BASE_PATH}/*`, (req, res) => {
  res.sendFile(indexFile);
});

app.listen(PORT, HOST, () => {
  console.log(`[bms-frontend] listening on http://${HOST}:${PORT}${APP_BASE_PATH}`);
  console.log(`[bms-frontend] proxying ${APP_BASE_PATH}/api -> ${BACKEND_TARGET}${BACKEND_API_BASE_PATH}`);
});
