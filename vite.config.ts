import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    emptyOutDir: true,
    modulePreload: false,
    rollupOptions: {
      input: {
        popup: resolve(process.cwd(), 'popup.html'),
        dashboard: resolve(process.cwd(), 'dashboard.html'),
        combat: resolve(process.cwd(), 'combat.html'),
        background: resolve(process.cwd(), 'src/background-entry.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
