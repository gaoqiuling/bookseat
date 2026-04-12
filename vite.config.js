import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/library-api': {
        target: 'https://www.library.sh.cn',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('origin')
            proxyReq.removeHeader('referer')
          })
        },
      },
      '/api': {
        target: 'https://yuyue.library.sh.cn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/eastLibReservation/api'),
      },
      '/seatReservation': {
        target: 'https://yuyue.library.sh.cn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/seatReservation/, '/eastLibReservation/seatReservation'),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('origin')
            proxyReq.removeHeader('referer')
          })
        },
      },
      '/seat': {
        target: 'https://yuyue.library.sh.cn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/seat/, '/eastLibReservation/seat'),
      },
      '/reservation': {
        target: 'https://yuyue.library.sh.cn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/reservation/, '/eastLibReservation/reservation'),
        headers: {
          Origin: 'https://yuyue.library.sh.cn',
          Referer: 'https://yuyue.library.sh.cn/',
        },
      },
      '/e-api': {
        target: 'https://e.library.sh.cn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/e-api/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('origin')
            proxyReq.removeHeader('referer')
          })
        },
      },
    },
  },
})
