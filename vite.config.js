import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createApi } from './server/api.mjs';
export default defineConfig({
  server: { host: '0.0.0.0' },
  plugins: [react(), {
    name: 'mova-local-rides',
    configureServer(server) { server.middlewares.use(createApi()); },
    configurePreviewServer(server) { server.middlewares.use(createApi()); }
  }]
});
