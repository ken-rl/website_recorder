import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/record': {
        target: 'http://localhost:3847',
        changeOrigin: true,
      },
      '/outputs': {
        target: 'http://localhost:3847',
        changeOrigin: true,
      },
    },
  },
})
