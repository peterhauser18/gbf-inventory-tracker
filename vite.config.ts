import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(process.cwd(), 'popup.html'),
        dashboard: resolve(process.cwd(), 'dashboard.html'),
        background: resolve(process.cwd(), 'src/background.ts'),
        'passive-page': resolve(process.cwd(), 'src/passive-page.ts'),
        'passive-bridge': resolve(process.cwd(), 'src/passive-bridge.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
