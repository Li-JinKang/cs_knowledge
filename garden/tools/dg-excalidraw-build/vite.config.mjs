// 把 @excalidraw/excalidraw 打成一个自托管的 IIFE。
//
// 为什么必须打包、不能用 import map：这个包的 dist/prod 是已构建 ESM，但把
// react、react-dom、jotai、roughjs 等约 20 个依赖都外部化了，浏览器端没有
// 打包器就解析不了这些裸模块名。
//
// 产物只在一个页面加载（notes 里的 .excalidraw.md），不进其它页面。
//
// Usage: npm run excalidraw:viewer
import { defineConfig } from 'vite';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

export default defineConfig({
  root: here,
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    outDir: join(root, 'src', 'site', 'plugins', 'dg-excalidraw'),
    emptyOutDir: true,
    cssCodeSplit: false,
    minify: 'esbuild',
    lib: {
      entry: join(here, 'entry.js'),
      formats: ['iife'],
      name: 'DGExcalidrawBundle',
      fileName: () => 'viewer.js',
    },
  },
});
