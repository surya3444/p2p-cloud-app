// frontend/vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    // This plugin adds the PWA functionality
    VitePWA({ registerType: 'autoUpdate' })
  ],
  define: {
    // These lines fix compatibility issues with some libraries
    global: 'window',
    'process.env': {},
  },
  // This section configures the development server
  server: {
    // These headers allow the Google OAuth pop-up to work correctly
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
  },
})