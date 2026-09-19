import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "path";

export default defineConfig({
  plugins: [vue()],

  // GitHub Pages 部署基路径（仓库名）
  base: '/Maimai-Prober-OS/',

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          echarts: ["echarts"],
        },
      },
    },
  },

  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    proxy: {
      "/api-df": {
        target: "https://www.diving-fish.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-df/, "/api/maimaidxprober"),
        secure: true,
        cookieDomainRewrite: "localhost",
      },
      "/df-covers": {
        target: "https://www.diving-fish.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/df-covers/, "/covers"),
        secure: true,
      },
      // DXRating 谱面 tag（社区标注，公开免鉴权）— 开发期走代理规避 CORS
      "/api-dxr": {
        target: "https://miruku.dxrating.net",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-dxr/, ""),
        secure: true,
      },
    },
  },
});
