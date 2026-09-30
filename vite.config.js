import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solidPlugin()],
  server: { port: 3000 },
  build: { target: 'esnext' },
  // Python-Worker des Coding-Tabs (workers/pyWorker.js) lädt Pyodide per dynamischem import() → Modul-Worker
  worker: { format: 'es' },
});
