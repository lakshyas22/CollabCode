import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendInternal = process.env.VITE_BACKEND_INTERNAL || 'http://localhost:8000'
const wsInternal      = backendInternal.replace('http://', 'ws://')

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api/v1/ws': {
        target: wsInternal,
        ws: true,
        changeOrigin: true,
      },
      '/api': {
        target: backendInternal,
        changeOrigin: true,
        ws: false,
        // Follow redirects so OAuth flows work through the proxy
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes, req, res) => {
            // Allow redirects to pass through for OAuth flows
            if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400) {
              const location = proxyRes.headers['location'];
              if (location && location.includes('localhost:8000')) {
                proxyRes.headers['location'] = location.replace(
                  'http://localhost:8000', 'http://localhost:5173'
                );
              }
            }
          });
        },
      },
    },
  },
})
