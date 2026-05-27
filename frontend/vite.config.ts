import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Im lokalen Dev-Modus Anfragen an /api ans Backend weiterleiten.
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
