import { createRouter, createWebHistory } from 'vue-router'
import Overview from '../components/Overview.vue'
import SeatAll from '../components/SeatAll.vue'
import Login from '../components/Login.vue'
import { authStore, validateToken } from '../store/auth'

const routes = [
  { path: '/', component: Overview },
  { path: '/seats', component: SeatAll },
  { path: '/login', component: Login },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

let checked = false

const PUBLIC_PATHS = ['/login']

router.beforeEach(async (to) => {
  if (PUBLIC_PATHS.includes(to.path)) return true

  if (!checked) {
    checked = true
    try {
      const valid = await validateToken(authStore.token)
      authStore.validated = valid
    } catch {
      authStore.validated = false
    }
  }

  if (!authStore.validated) return '/login'
})

export default router
