import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // Client bundle → dist/client   (npm run build:client)
    // Server bundle → dist/server   (npm run build:server)
    outDir: 'dist/client',
  },
});
