import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  build: {
    outDir: '../server/dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
      },
      '/api': {
        target: 'http://localhost:3000',
      },
    },
  },
})
