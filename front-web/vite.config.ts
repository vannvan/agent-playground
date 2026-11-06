import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
  resolve: {
    mainFields: ['module', 'jsnext:main', 'jsnext'],
    alias: {
      'emoji-regex': path.resolve(__dirname, '../node_modules/emoji-regex/index.mjs'),
    },
  },
})
