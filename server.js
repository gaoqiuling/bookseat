import express from 'express'
import { createProxyMiddleware } from 'http-proxy-middleware'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 5000

function removeOriginHeaders(proxyReq) {
  proxyReq.removeHeader('origin')
  proxyReq.removeHeader('referer')
}

const proxyConfigs = [
  {
    pathFilter: '/library-api',
    target: 'https://www.library.sh.cn',
    on: { proxyReq: removeOriginHeaders },
  },
  {
    pathFilter: '/seatReservation',
    target: 'https://yuyue.library.sh.cn',
    pathRewrite: { '^/seatReservation': '/eastLibReservation/seatReservation' },
    on: { proxyReq: removeOriginHeaders },
  },
  {
    pathFilter: '/seat',
    target: 'https://yuyue.library.sh.cn',
    pathRewrite: { '^/seat': '/eastLibReservation/seat' },
  },
  {
    pathFilter: '/reservation',
    target: 'https://yuyue.library.sh.cn',
    pathRewrite: { '^/reservation': '/eastLibReservation/reservation' },
    headers: { Origin: 'https://yuyue.library.sh.cn', Referer: 'https://yuyue.library.sh.cn/' },
  },
  {
    pathFilter: '/api',
    target: 'https://yuyue.library.sh.cn',
    pathRewrite: { '^/api': '/eastLibReservation/api' },
  },
  {
    pathFilter: '/e-api',
    target: 'https://e.library.sh.cn',
    pathRewrite: { '^/e-api': '' },
    on: { proxyReq: removeOriginHeaders },
  },
]

for (const { on, ...rest } of proxyConfigs) {
  app.use(createProxyMiddleware({
    changeOrigin: true,
    ...rest,
    on: {
      ...on,
      proxyRes(proxyRes) {
        proxyRes.headers['cache-control'] = 'no-store'
      },
    },
  }))
}

// 托管前端静态文件
app.use(express.static(join(__dirname, 'dist')))

// 所有其他路由返回 index.html（支持前端路由）
app.get('/{*path}', (_, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'))
})

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`)
})
