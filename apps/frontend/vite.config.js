import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

function ensureNoTrailingSlash(p) {
  if (!p) return '';
  return p.endsWith('/') ? p.slice(0, -1) : p;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const basePath = ensureNoTrailingSlash(env.VITE_APP_BASE_PATH || '/bms-app');
  const apiBase = env.VITE_API_BASE_URL || `${basePath}/api`;

  // Vite braucht base mit trailing slash, sonst werden Assets manchmal falsch aufgelöst
  const viteBase = `${basePath}/`;

  const port = parseInt(env.FRONTEND_PORT || '3090', 10);

  return {
    base: viteBase,
    plugins: [react()],
    server: {
      host: true,
      port,
      proxy: {
        // Browser ruft /bms-app/api/... auf -> Vite proxy't auf Backend /api/...
        [`${basePath}/api`]: {
          target: env.BACKEND_PROXY_TARGET || 'http://127.0.0.1:3091',
          changeOrigin: true,
          rewrite: (p) => p.replace(`${basePath}/api`, env.BACKEND_API_BASE_PATH || '/api'),
        },
      },
    },
    define: {
      __APP_BASE_PATH__: JSON.stringify(basePath),
      __API_BASE_URL__: JSON.stringify(apiBase),
    },
  };
});
