import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base: './'` keeps the bundle path-agnostic. A GitHub project page is served
// from /<repo>/, and relative asset URLs resolve correctly there without
// hardcoding the repository name. Routing uses the hash, so no server rewrite
// rules are needed either.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    // The Excalidraw bundle is large; the default 500 kB warning is just noise.
    chunkSizeWarningLimit: 3000,
  },
});
