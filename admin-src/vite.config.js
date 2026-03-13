import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: '/admin/',
  build: {
    // Output to frontend/admin/ for Firebase Hosting (public dir is now "frontend")
    outDir: path.resolve(__dirname, '..', 'frontend', 'admin'),
    emptyOutDir: true,
  },
  server: {
    port: 5174,
  },
})
