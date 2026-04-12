import { reactive } from 'vue'

function loadAccounts() {
  try {
    return JSON.parse(localStorage.getItem('accounts') || '[]')
  } catch {
    return []
  }
}

function saveAccounts(accounts) {
  localStorage.setItem('accounts', JSON.stringify(accounts))
}

export const authStore = reactive({
  token: localStorage.getItem('accesstoken') || '',
  nameCn: localStorage.getItem('nameCn') || '',
  validated: false,
  accounts: loadAccounts(), // [{ nameCn, token }]

  setToken(token) {
    this.token = token
    localStorage.setItem('accesstoken', token)
  },

  // 登录成功后保存账号（同名则更新 token）
  addAccount(nameCn, token) {
    this.nameCn = nameCn
    localStorage.setItem('nameCn', nameCn)
    const idx = this.accounts.findIndex(a => a.nameCn === nameCn)
    if (idx >= 0) {
      this.accounts[idx].token = token
    } else {
      this.accounts.push({ nameCn, token })
    }
    saveAccounts(this.accounts)
  },

  // 切换到已有账号
  switchAccount(account) {
    this.token = account.token
    this.nameCn = account.nameCn
    this.validated = true
    localStorage.setItem('accesstoken', account.token)
    localStorage.setItem('nameCn', account.nameCn)
  },

  // token 过期时移除该账号并清空当前会话
  removeExpiredAccount(token) {
    this.accounts = this.accounts.filter(a => a.token !== token)
    saveAccounts(this.accounts)
    this.token = ''
    this.nameCn = ''
    this.validated = false
    localStorage.removeItem('accesstoken')
    localStorage.removeItem('nameCn')
  },
})

export async function validateToken(token) {
  const { default: axios } = await import('axios')
  const res = await axios.post('/library-api/st/user/getPayCount', { accessToken: token }, {
    headers: { 'Content-Type': 'application/json' },
  })
  return res.data.code === '200'
}
