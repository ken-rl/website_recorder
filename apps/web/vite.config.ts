import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "../api/public",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/record": {
        target: "http://127.0.0.1:3847",
        changeOrigin: true,
      },
      "/style": {
        target: "http://127.0.0.1:3847",
        changeOrigin: true,
      },
      "/api": {
        target: "http://127.0.0.1:3847",
        changeOrigin: true,
      },
      "/outputs": {
        target: "http://127.0.0.1:3847",
        changeOrigin: true,
      },
    },
  },
});
