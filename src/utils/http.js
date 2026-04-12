import axios from 'axios'
import { authStore } from '../store/auth'

const instance = axios.create({
  timeout: 10000,
})

instance.interceptors.request.use((config) => {
  config.headers['accesstoken'] = authStore.token
  config.headers['timestamp'] = Date.now().toString()
  return config
})

function handleTokenExpired() {
  authStore.removeExpiredAccount(authStore.token)
  import('../router/index.js').then(({ default: router }) => {
    router.push('/login')
  })
}

const EXPIRED_CODES = ['401', 401]

instance.interceptors.response.use(
  (res) => {
    if (EXPIRED_CODES.includes(res.data?.code)) {
      handleTokenExpired()
      return Promise.reject(new Error('token 已过期'))
    }
    return res.data
  },
  (err) => {
    if (err.response?.status === 401) {
      handleTokenExpired()
    }
    return Promise.reject(err)
  }
)

export const http = {
  get(url, params) {
    return instance.get(url, { params })
  },
  post(url, data, config) {
    return instance.post(url, data, config)
  },
}
