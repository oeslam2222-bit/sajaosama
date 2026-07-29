import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import fs from 'fs';

// Load ORS key from .env for the dev proxy (avoids browser CORS issues)
const envRaw = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf-8') : '';
const orsKeyMatch = envRaw.split('\n').find(l => l.startsWith('VITE_ORS_API_KEY='));
const ORS_KEY = orsKeyMatch ? orsKeyMatch.split('=')[1].trim() : '';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        // Proxy ORS through the dev server to bypass browser CORS restrictions
        '/api/ors': {
          target: 'https://api.openrouteservice.org',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/ors/, ''),
          headers: {
            Authorization: ORS_KEY,
          },
        },
      },
    },
  };
});
