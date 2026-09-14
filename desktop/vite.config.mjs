import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const fromHere = p => fileURLToPath(new URL(p, import.meta.url));
export default defineConfig({
  root: fromHere('./dashboard'),
  base: './',
  plugins: [tailwindcss()],
  resolve: {
    alias: { '@': fromHere('../'), 'next/link': fromHere('./dashboard/link.tsx') },
    dedupe: ['react', 'react-dom'],
  },
  esbuild: { jsx: 'automatic' },
  build: { outDir: fromHere('./web-dist'), emptyOutDir: true },
});
