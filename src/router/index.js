import { createRouter, createWebHistory } from 'vue-router'
import Overview from '../components/Overview.vue'
import SeatAll from '../components/SeatAll.vue'
import Login from '../components/Login.vue'
import { authStore } from '../store/auth'

const routes = [
  { path: '/', component: Overview },
  { path: '/seats', component: SeatAll },
  { path: '/login', component: Login },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

const PUBLIC_PATHS = ['/login']

router.beforeEach((to) => {
  if (PUBLIC_PATHS.includes(to.path)) return true
  if (!authStore.token) return '/login'
})

export default router
