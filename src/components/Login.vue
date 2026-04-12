<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-header">
        <div class="logo">📚</div>
        <h1>BookSeat</h1>
        <p>手机号快捷登录</p>
      </div>

      <form class="login-form" @submit.prevent="handleLogin">
        <!-- 手机号 -->
        <div class="form-item" :class="{ error: errors.phone }">
          <label>手机号</label>
          <div class="input-wrapper">
            <span class="prefix">+86</span>
            <input
              v-model="form.phone"
              type="tel"
              maxlength="11"
              placeholder="请输入手机号"
              @input="errors.phone = ''"
            />
          </div>
          <span class="error-msg" v-if="errors.phone">{{ errors.phone }}</span>
        </div>

        <!-- 图形验证码 -->
        <div class="form-item" :class="{ error: errors.captcha }">
          <label>图形验证码</label>
          <div class="input-row">
            <div class="input-wrapper flex-1">
              <input
                v-model="form.captcha"
                type="text"
                maxlength="4"
                placeholder="请输入图形验证码"
                @input="errors.captcha = ''"
              />
            </div>
            <div
              class="captcha-img-wrap"
              title="点击刷新"
              @click="refreshCaptcha"
            >
              <img v-if="captchaImg" :src="captchaImg" class="captcha-img" alt="图形验证码" />
              <span v-else-if="captchaLoading" class="captcha-placeholder">加载中...</span>
              <span v-else class="captcha-placeholder captcha-error">加载失败，点击重试</span>
            </div>
          </div>
          <span class="error-msg" v-if="errors.captcha">{{ errors.captcha }}</span>
        </div>

        <!-- 短信验证码 -->
        <div class="form-item" :class="{ error: errors.smsCode }">
          <label>短信验证码</label>
          <div class="input-row">
            <div class="input-wrapper flex-1">
              <input
                v-model="form.smsCode"
                type="text"
                maxlength="6"
                placeholder="请输入短信验证码"
                @input="errors.smsCode = ''"
              />
            </div>
            <button
              type="button"
              class="sms-btn"
              :disabled="countdown > 0 || sending"
              @click="sendSmsCode"
            >
              <span v-if="countdown > 0">{{ countdown }}s 后重发</span>
              <span v-else-if="sending">发送中...</span>
              <span v-else>获取验证码</span>
            </button>
          </div>
          <span class="error-msg" v-if="errors.smsCode">{{ errors.smsCode }}</span>
        </div>

        <!-- 登录按钮 -->
        <button type="submit" class="login-btn" :disabled="loading">
          {{ loading ? '登录中...' : '登 录' }}
        </button>
      </form>

      <div class="login-footer">
        登录即代表同意 <a href="#">用户协议</a> 和 <a href="#">隐私政策</a>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
import { authStore } from '../store/auth'

const router = useRouter()

const aat = ref('')           // 从第一个接口获取的 token
const captchaUuid = ref('')   // 随机 32 位 uuid，验证码校验时需要
const captchaImg = ref('')    // 图形验证码 base64
const captchaLoading = ref(false)
const countdown = ref(0)
const sending = ref(false)
const loading = ref(false)

const form = reactive({
  phone: '',
  captcha: '',
  smsCode: '',
})

const errors = reactive({
  phone: '',
  captcha: '',
  smsCode: '',
})

// 第一步：获取 AAT token
async function fetchAat() {
  const res = await axios.post('/e-api/yuyuetest/st/token/aatTokenAcquire', {
    deviceid: 'libwxmini-10133030031775971874587',
  })
  if (res.data?.code !== '200') {
    throw new Error(res.data?.msg || '获取 token 失败')
  }
  return res.data.data.aat
}

// 生成随机 32 位十六进制字符串
function genUuid() {
  return Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('')
}

// 根据 base64 头部字节判断图片格式
function detectImgMime(base64) {
  if (base64.startsWith('iVBOR')) return 'image/png'
  if (base64.startsWith('/9j/'))  return 'image/jpeg'
  if (base64.startsWith('R0lGO')) return 'image/gif'
  return 'image/png' // 兜底
}

// 第二步：用 aat + uuid 获取图形验证码 base64
async function fetchCaptchaImg(aatToken) {
  const uuid = genUuid()
  captchaUuid.value = uuid
  const res = await axios.post('/e-api/yuyuetest/st/token/authCaptchaimg', {
    uuid,
    aat: aatToken,
  })
  if (res.data?.code !== '200') {
    throw new Error(res.data?.msg || '获取验证码失败')
  }
  const raw = res.data.data.captchaImg
  console.log('[captcha] base64 前20字符：', raw?.slice(0, 20))
  // 如果接口已经带了 data:image/... 前缀就直接用，否则自动补全
  if (raw?.startsWith('data:')) {
    captchaImg.value = raw
  } else {
    captchaImg.value = `data:${detectImgMime(raw)};base64,${raw}`
  }
}

// 刷新图形验证码（点击图片时调用）
async function refreshCaptcha() {
  captchaImg.value = ''
  captchaLoading.value = true
  errors.captcha = ''
  form.captcha = ''
  try {
    aat.value = await fetchAat()
    await fetchCaptchaImg(aat.value)
  } catch (e) {
    console.error('[captcha] 刷新失败', e)
  } finally {
    captchaLoading.value = false
  }
}

function validatePhone() {
  if (!form.phone) {
    errors.phone = '请输入手机号'
    return false
  }
  if (!/^1[3-9]\d{9}$/.test(form.phone)) {
    errors.phone = '请输入正确的手机号'
    return false
  }
  return true
}

function validateCaptcha() {
  if (!form.captcha) {
    errors.captcha = '请输入图形验证码'
    return false
  }
  return true
}

async function sendSmsCode() {
  if (!validatePhone()) return
  if (!validateCaptcha()) return

  sending.value = true
  try {
    const res = await axios.post('/library-api/st/token/authSendsmscode', {
      code: form.captcha,
      mobile: form.phone,
      uuid: captchaUuid.value,
      aat: aat.value,
    })
    if (res.data?.code !== '200') {
      errors.captcha = res.data?.msg || '验证码错误，请重试'
      refreshCaptcha()
      return
    }
    countdown.value = 60
    const timer = setInterval(() => {
      countdown.value--
      if (countdown.value <= 0) clearInterval(timer)
    }, 1000)
  } catch (e) {
    errors.captcha = '发送失败，请稍后重试'
    console.error('[sms] 发送失败', e)
  } finally {
    sending.value = false
  }
}

async function handleLogin() {
  if (!validatePhone()) return
  if (!validateCaptcha()) return
  if (!form.smsCode) {
    errors.smsCode = '请输入短信验证码'
    return
  }
  if (!/^\d{6}$/.test(form.smsCode)) {
    errors.smsCode = '请输入6位数字验证码'
    return
  }

  loading.value = true
  try {
    const res = await axios.post('/library-api/st/token/uatTokenSmsAcquire', {
      code: form.captcha,
      mobile: form.phone,
      smscode: form.smsCode,
      uuid: captchaUuid.value,
      aat: aat.value,
    })
    if (res.data?.code !== '200') {
      errors.smsCode = res.data?.msg || '登录失败，请重试'
      return
    }
    const nameCn = res.data.data.us.nameCn
    const uat = res.data.data.uat

    // 第二步：用 uat + aat 换取最终 accessToken
    const tokenRes = await axios.post('/library-api/st/token/accessTokenAcquire', {
      aat: aat.value,
      uat,
    })
    if (tokenRes.data?.code !== '200') {
      errors.smsCode = tokenRes.data?.msg || '获取 token 失败，请重试'
      return
    }
    const accessToken = tokenRes.data.data.accessToken
    authStore.addAccount(nameCn, accessToken)
    authStore.setToken(accessToken)
    authStore.validated = true
    router.push('/')
  } catch (e) {
    errors.smsCode = '登录失败，请稍后重试'
    console.error('[login] 登录失败', e)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  refreshCaptcha()
})
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.login-card {
  background: #fff;
  border-radius: 16px;
  padding: 40px 36px;
  width: 100%;
  max-width: 400px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
}

.login-header {
  text-align: center;
  margin-bottom: 32px;
}

.logo {
  font-size: 48px;
  margin-bottom: 8px;
}

.login-header h1 {
  font-size: 24px;
  font-weight: 700;
  color: #1a1a2e;
  margin: 0 0 6px;
}

.login-header p {
  font-size: 14px;
  color: #888;
  margin: 0;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-item label {
  font-size: 13px;
  font-weight: 600;
  color: #444;
}

.input-wrapper {
  display: flex;
  align-items: center;
  border: 1.5px solid #e0e0e0;
  border-radius: 10px;
  overflow: hidden;
  transition: border-color 0.2s;
  background: #fafafa;
}

.input-wrapper:focus-within {
  border-color: #667eea;
  background: #fff;
}

.form-item.error .input-wrapper {
  border-color: #ff4d4f;
}

.prefix {
  padding: 0 12px;
  font-size: 14px;
  color: #555;
  border-right: 1.5px solid #e0e0e0;
  white-space: nowrap;
  line-height: 42px;
}

.input-wrapper input {
  flex: 1;
  border: none;
  outline: none;
  padding: 0 14px;
  height: 42px;
  font-size: 15px;
  background: transparent;
  color: #1a1a2e;
}

.input-wrapper input::placeholder {
  color: #bbb;
  font-size: 14px;
}

.input-row {
  display: flex;
  gap: 10px;
  align-items: center;
}

.flex-1 {
  flex: 1;
}

.captcha-img-wrap {
  width: 110px;
  height: 42px;
  flex-shrink: 0;
  border-radius: 10px;
  border: 1.5px solid #e0e0e0;
  overflow: hidden;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.2s;
  background: #f0f4ff;
}

.captcha-img-wrap:hover {
  border-color: #667eea;
}

.captcha-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.captcha-placeholder {
  font-size: 11px;
  color: #999;
  text-align: center;
  padding: 0 4px;
}

.captcha-error {
  color: #ff4d4f;
}

.sms-btn {
  flex-shrink: 0;
  padding: 0 14px;
  height: 42px;
  border-radius: 10px;
  border: 1.5px solid #667eea;
  background: #fff;
  color: #667eea;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
}

.sms-btn:hover:not(:disabled) {
  background: #667eea;
  color: #fff;
}

.sms-btn:disabled {
  border-color: #ccc;
  color: #bbb;
  cursor: not-allowed;
}

.error-msg {
  font-size: 12px;
  color: #ff4d4f;
}

.login-btn {
  width: 100%;
  height: 46px;
  background: linear-gradient(90deg, #667eea, #764ba2);
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  margin-top: 4px;
  transition: opacity 0.2s, transform 0.1s;
}

.login-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.login-btn:active:not(:disabled) {
  transform: scale(0.98);
}

.login-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.login-footer {
  text-align: center;
  font-size: 12px;
  color: #aaa;
  margin-top: 24px;
}

.login-footer a {
  color: #667eea;
  text-decoration: none;
}

.login-footer a:hover {
  text-decoration: underline;
}
</style>
