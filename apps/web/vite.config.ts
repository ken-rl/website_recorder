import { defineConfig, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";

const recorderProxy: ProxyOptions = {
  target: "http://127.0.0.1:3847",
  changeOrigin: true,
  configure(proxy) {
    proxy.on("error", (_error, _request, response) => {
      if (!("writeHead" in response)) return;
      if (!response.headersSent) {
        response.writeHead(502, { "content-type": "application/json" });
      }
      response.end(JSON.stringify({
        ok: false,
        error: "Recorder API is unavailable. Start the API service and try again.",
      }));
    });
  },
};

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
        ...recorderProxy,
      },
      "/style": {
        ...recorderProxy,
      },
      "/api": {
        ...recorderProxy,
      },
      "/outputs": {
        ...recorderProxy,
      },
    },
  },
});
