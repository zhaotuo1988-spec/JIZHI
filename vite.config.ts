import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false
  },
  server: {
    proxy: {
      // 本地开发时，将 /api 请求转发给本地运行的 Node.js (server.js) 服务器
      // 确保你同时运行了 `npm run start` (端口 3000)
      '/api': {
        target: 'http://localhost:3000', 
        changeOrigin: true,
      },
    },
  },
});