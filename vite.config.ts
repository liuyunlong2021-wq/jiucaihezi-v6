import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { cleanDistPlugin } from './build/cleanDistPlugin'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [vue(), cleanDistPlugin()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
