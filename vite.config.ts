import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { handleApi } from './server/api.ts';

export default defineConfig({
  plugins: [
    react(),
    {
      // Serve /api/* from the same handler the production server uses.
      name: 'homehunt-api',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          handleApi(req, res).then((handled) => {
            if (!handled) next();
          }, next);
        });
      },
    },
  ],
});
