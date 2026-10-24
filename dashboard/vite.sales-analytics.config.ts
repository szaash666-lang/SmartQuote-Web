/**
 * 销售数据分析页面的【独立生产构建】配置（新增文件，不影响主 vite.config.ts）。
 *
 * 用法（在 dashboard 目录下）：
 *   pnpm exec vite build --config vite.sales-analytics.config.ts
 *
 * 产物输出到 dist/sales-analytics/（该目录位于已 gitignore 的 dist/ 内），
 * 其中 index.html 可直接用任意静态服务器打开，无需后端。
 *
 * 注意：这是页面单独开发/演示用的辅助配置；当页面接入主路由后，此文件可删除，
 * 页面会随主应用一起打包进 dist/。
 */
import { fileURLToPath, URL } from 'url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';

export default defineConfig({
  base: './',
  plugins: [vue(), vuetify({ autoImport: true })],
  resolve: {
    alias: [
      {
        find: '@',
        replacement: fileURLToPath(new URL('./src', import.meta.url)),
      },
    ],
  },
  build: {
    outDir: 'dist/sales-analytics',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: fileURLToPath(new URL('./sales-analytics-preview.html', import.meta.url)),
    },
  },
});
