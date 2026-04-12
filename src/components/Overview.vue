<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { authStore } from '../store/auth'
import { http } from '../utils/http'

const router = useRouter()

const showPanel = ref(false)

function switchAccount(account) {
  if (account.nameCn === authStore.nameCn) return
  authStore.switchAccount(account)
  showPanel.value = false
  loadAll()
  fetchMyReservations()
}

function goLogin() {
  showPanel.value = false
  router.push('/login')
}

const dayList = ref([])

function toLocalDateStr(d) {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const today = toLocalDateStr(new Date())

function get7Days() {
  const days = []
  for (let i = 0; i < 7; i++) {
    const d = new Date()
    d.setDate(d.getDate() + i)
    days.push(toLocalDateStr(d))
  }
  return days
}

function isPastPeriod(dateStr, periodTime) {
  if (dateStr !== today) return false
  const endTime = periodTime.split('-')[1]
  const [h, m] = endTime.split(':').map(Number)
  const now = new Date()
  return now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m)
}

function formatDate(dateStr) {
  const [, mo, d] = dateStr.split('-')
  const date = new Date(dateStr)
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  return `${mo}月${d}日（周${weekdays[date.getDay()]}）`
}

async function fetchPeriods(dateStr) {
  const json = await http.get('/api/period', { date: dateStr, reservationType: 14, libraryId: 1 })
  if (json.resultStatus?.code !== 0 && json.resultStatus?.code !== 200) return []
  return (Array.isArray(json.resultValue) ? json.resultValue : []).map(item => ({
    periodTime: item.periodTime,
    remaining: item.quotaVo?.remaining ?? 0,
  }))
}

async function fetchSeats(dateStr, periodTime) {
  const startTime = periodTime.split('-')[0]
  const reservationStartDate = `${dateStr} ${startTime}:00`
  async function fetchArea(areaId) {
    const json = await http.get('/seat/getAreaSeats', { areaId, reservationStartDate })
    if (json.resultStatus?.code !== 0 && json.resultStatus?.code !== 200) return []
    return Array.isArray(json.resultValue) ? json.resultValue : []
  }
  const [north, east] = await Promise.all([fetchArea(4), fetchArea(2)])
  const northFiltered = north.filter(
    s => ['5排', '6排', '7排'].includes(s.seatRow) && ['5号', '10号'].includes(s.seatNo)
  )
  const eastFiltered = east.filter(
    s =>
      (['4排', '5排'].includes(s.seatRow) && ['4号', '8号'].includes(s.seatNo)) ||
      (s.seatRow === '6排' && ['5号', '10号'].includes(s.seatNo))
  )
  return { north: northFiltered, east: eastFiltered }
}

// 我的预约：按日期索引 { '2026-04-10': [...] }
const myReservations = ref({})

async function fetchMyReservations() {
  try {
    const json = await http.post('/reservation/myReservationList', { status: 0, size: 100000, page: 1 })
    if (json.resultStatus?.code !== 0 && json.resultStatus?.code !== 200) return
    const content = Array.isArray(json.resultValue?.content) ? json.resultValue.content : []
    const grouped = {}
    for (const day of content) {
      const dateKey = day.reservationDate
      if (!dateKey) continue
      grouped[dateKey] = Array.isArray(day.reservationList) ? day.reservationList : []
    }
    myReservations.value = grouped
  } catch (e) {
    console.error('[myReservationList] error:', e)
  }
}

// 预约弹窗
const dialog = ref(null) // { date, periodTime, seat }
const booking = ref(false)
const bookError = ref('')

function openBookDialog(date, periodTime, seat) {
  const startTime = periodTime.split('-')[0]
  const existing = (myReservations.value[date] || []).find(r => r.startTime === startTime)
  dialog.value = { date, periodTime, seat, existing: existing || null }
  bookError.value = ''
}

function closeDialog() {
  dialog.value = null
  bookError.value = ''
}

async function confirmBook() {
  if (!dialog.value) return
  booking.value = true
  bookError.value = ''
  try {
    const { date, periodTime, seat, existing } = dialog.value
    // 先取消已有预约
    if (existing) {
      const cancelJson = await http.get('/seatReservation/calcelReservation', { reservationId: existing.reservationId })
      if (cancelJson.resultStatus?.code !== 0 && cancelJson.resultStatus?.code !== 200) {
        bookError.value = '取消原预约失败：' + (cancelJson.resultStatus?.message || '未知错误')
        return
      }
    }
    // 预约新座位
    const [startTime, endTime] = periodTime.split('-')
    const json = await http.post('/seatReservation/reservation', {
      areaId: seat.areaId,
      floorId: seat.floorId,
      reservationStartDate: `${date} ${startTime}:00`,
      reservationEndDate: `${date} ${endTime}:00`,
      seatId: seat.seatId,
      seatReservationType: 2,
    })
    if (json.resultStatus?.code !== 0 && json.resultStatus?.code !== 200) {
      bookError.value = json.resultStatus?.message || '预约失败'
      return
    }
    closeDialog()
    await fetchMyReservations()
    // 刷新该时段的座位状态
    const day = dayList.value.find(d => d.date === date)
    const period = day?.periods.find(p => p.periodTime === periodTime)
    if (period) {
      period.seatsLoading = true
      try {
        period.seats = await fetchSeats(date, periodTime)
      } finally {
        period.seatsLoading = false
      }
    }
  } catch (e) {
    bookError.value = '预约失败：' + e.message
  } finally {
    booking.value = false
  }
}

function isMyReservedSeat(dateStr, periodTime, seatId) {
  const startTime = periodTime.split('-')[0]
  return (myReservations.value[dateStr] || []).some(
    r => r.startTime === startTime && r.seatId === seatId
  )
}

const refreshing = ref(false)

async function loadAll() {
  refreshing.value = true
  const dates = get7Days()
  dayList.value = dates.map(date => ({
    date,
    loading: true,
    error: '',
    periods: [],
  }))

  await Promise.all(
    dates.map(async (dateStr, idx) => {
      try {
        const periods = await fetchPeriods(dateStr)
        const enriched = periods.filter(p=>!isPastPeriod(dateStr, p.periodTime)).map(p => ({
          ...p,
          seatsLoading: false,
          seats: null,
        }))
        dayList.value[idx].periods = enriched

        // 对有余量的时段自动拉座位数据
        await Promise.all(
          enriched
            .map(async p => {
              p.seatsLoading = true
              try {
                p.seats = await fetchSeats(dateStr, p.periodTime)
              } catch {
                p.seats = null
              } finally {
                p.seatsLoading = false
              }
            })
        )
      } catch (e) {
        dayList.value[idx].error = '请求失败：' + e.message
      } finally {
        dayList.value[idx].loading = false
      }
    })
  )
  refreshing.value = false
}

onMounted(() => {
  loadAll()
  fetchMyReservations()
})

</script>

<template>
  <div class="container">
    <div class="page-header">
      <h1>上海图书馆座位总览</h1>
      <div class="header-actions">
        <button class="refresh-btn" :disabled="refreshing" @click="loadAll">
          {{ refreshing ? '刷新中...' : '刷新' }}
        </button>
        <div class="account-wrap">
          <button class="switch-btn" @click="showPanel = !showPanel">
            {{ authStore.nameCn || '账号' }} ▾
          </button>
          <div v-if="showPanel" class="account-panel">
            <div class="panel-title">已登录账号</div>
            <ul class="account-list">
              <li
                v-for="account in authStore.accounts"
                :key="account.nameCn"
                class="account-item"
                :class="{ active: account.nameCn === authStore.nameCn }"
                @click="switchAccount(account)"
              >
                <span class="account-name">{{ account.nameCn }}</span>
                <span v-if="account.nameCn === authStore.nameCn" class="account-tag">当前</span>
              </li>
              <li v-if="authStore.accounts.length === 0" class="account-empty">暂无账号</li>
            </ul>
            <button class="login-new-btn" @click="goLogin">+ 登录新账号</button>
          </div>
        </div>
      </div>
    </div>

    <div v-for="(day, dayIdx) in dayList" :key="day.date" class="day-section">
      <div class="day-header">{{ formatDate(day.date) }}</div>
      <div v-if="day.loading" class="loading">加载中...</div>
      <p v-else-if="day.error" class="error">{{ day.error }}</p>
      <div v-else-if="day.periods.length" class="period-list">
        <div
          v-for="(p, i) in day.periods"
          :key="i"
          class="period-row"
        >
          <!-- 时段 + 余量 + 我的预约 -->
          <div class="period-meta">
            <span class="period-time">{{ p.periodTime }}</span>
            <span class="period-remaining" :class="p.remaining > 0 ? 'has-remain' : 'no-remain'">
              {{ p.remaining > 0 ? `剩余 ${p.remaining}` : '已满' }}
            </span>
            <span
              v-if="(myReservations[day.date] || []).find(r => r.startTime === p.periodTime.split('-')[0])"
              class="my-res-inline"
            >已预约：{{ (myReservations[day.date] || []).find(r => r.startTime === p.periodTime.split('-')[0]).seatNo.substring(2) }}</span>
            <button class="more-btn" @click="router.push({ path: '/seats', query: { date: day.date, periodTime: p.periodTime } })">查看更多</button>
          </div>

          <!-- 座位状态 -->
          <div class="seats-area">
            <template v-if="p.seatsLoading">
              <span class="seats-loading">查询座位中...</span>
            </template>
            <template v-else-if="p.seats">
              <div class="seat-columns">
                <div v-for="group in [{ label: '北', seats: p.seats.north }, { label: '东', seats: p.seats.east }]" :key="group.label" class="seat-col">
                  <span class="seat-col-label">{{ group.label }}区</span>
                  <div class="seat-tags">
                    <span
                      v-for="(s, si) in group.seats"
                      :key="si"
                      class="seat-tag"
                      :class="[
                        isMyReservedSeat(day.date, p.periodTime, s.seatId) ? 'tag-mine' : s.seatStatus === 3 ? 'tag-avail' : 'tag-occ',
                        dayIdx > 0 && s.seatStatus === 3 && !isMyReservedSeat(day.date, p.periodTime, s.seatId) ? 'tag-clickable' : ''
                      ]"
                      @click="dayIdx > 0 && s.seatStatus === 3 && !isMyReservedSeat(day.date, p.periodTime, s.seatId) && openBookDialog(day.date, p.periodTime, { ...s, area: group.label })"
                    >
                      {{ s.seatRow }}{{ s.seatNo }}
                    </span>
                  </div>
                </div>
              </div>
            </template>
            <template v-else>
              <span class="seats-na">无座位数据</span>
            </template>
          </div>
        </div>
      </div>
      <p v-else class="empty">暂无数据</p>
    </div>
  </div>

  <!-- 预约确认弹窗 -->
  <div v-if="dialog" class="dialog-mask" @click.self="closeDialog">
    <div class="dialog-box">
      <div class="dialog-title">确定预约吗</div>
      <div class="dialog-body">
        <p>日期：{{ dialog.date }} {{ dialog.periodTime }}</p>
        <p>座位：{{ dialog.seat.area }}{{ dialog.seat.seatRow }}{{ dialog.seat.seatNo }}</p>
        <p v-if="dialog.existing" class="dialog-warn">
          该时段已有预约（ {{ dialog.existing.seatNo }}），确认后将自动取消并预约新座位
        </p>
      </div>
      <p v-if="bookError" class="dialog-error">{{ bookError }}</p>
      <div class="dialog-actions">
        <button class="btn-cancel" @click="closeDialog">取消</button>
        <button class="btn-confirm" :disabled="booking" @click="confirmBook">
          {{ booking ? (dialog.existing ? '取消并预约中...' : '预约中...') : '确定预约' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.container {
  max-width: 960px;
  margin: 0 auto;
  padding: 24px 20px;
  font-family: 'PingFang SC', 'Helvetica Neue', sans-serif;
  color: #222;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 28px;
}

h1 {
  font-size: 1.4rem;
  color: #1a5e9a;
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.refresh-btn {
  padding: 7px 18px;
  background: #1a5e9a;
  color: #fff;
  border: none;
  border-radius: 20px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: background 0.2s;
}
.refresh-btn:hover:not(:disabled) {
  background: #154d82;
}
.refresh-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.account-wrap {
  position: relative;
}

.switch-btn {
  padding: 7px 18px;
  background: transparent;
  color: #555;
  border: 1px solid #ddd;
  border-radius: 20px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: border-color 0.2s, color 0.2s;
}
.switch-btn:hover {
  border-color: #aaa;
  color: #333;
}

.account-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 200px;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  z-index: 100;
  overflow: hidden;
}

.panel-title {
  padding: 10px 14px 6px;
  font-size: 11px;
  color: #aaa;
  letter-spacing: 0.5px;
}

.account-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.account-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 14px;
  cursor: pointer;
  transition: background 0.15s;
  font-size: 0.9rem;
  color: #333;
}
.account-item:hover {
  background: #f5f7ff;
}
.account-item.active {
  color: #1a5e9a;
  font-weight: 600;
}

.account-tag {
  font-size: 11px;
  color: #1a5e9a;
  background: #e8f0fb;
  border-radius: 4px;
  padding: 1px 6px;
}

.account-empty {
  padding: 10px 14px;
  font-size: 0.85rem;
  color: #bbb;
}

.login-new-btn {
  display: block;
  width: 100%;
  padding: 10px 14px;
  border: none;
  border-top: 1px solid #f0f0f0;
  background: #fff;
  color: #1a5e9a;
  font-size: 0.9rem;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;
}
.login-new-btn:hover {
  background: #f5f7ff;
}

.day-section {
  margin-bottom: 28px;
}

.day-header {
  font-size: 0.95rem;
  font-weight: 600;
  color: #1a5e9a;
  padding: 5px 12px;
  background: #e8f0fb;
  border-left: 4px solid #1a5e9a;
  border-radius: 0 6px 6px 0;
  margin-bottom: 10px;
}

.period-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.period-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 14px;
  border-radius: 10px;
  background: #f9f9f9;
  border: 1px solid #eee;
  transition: background 0.15s, transform 0.15s;
}

.period-meta {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 140px;
}

.period-time {
  font-size: 0.9rem;
  font-weight: 600;
  color: #333;
  white-space: nowrap;
}

.period-remaining {
  font-size: 0.78rem;
  font-weight: 500;
}
.period-remaining.has-remain { color: #1e7e34; }
.period-remaining.no-remain { color: #aaa; }

.seats-area {
  flex: 1;
}

.seat-columns {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}

.seat-col {
  display: flex;
  align-items: center;
  gap: 6px;
}

.seat-col-label {
  font-size: 0.75rem;
  color: #aaa;
  white-space: nowrap;
  min-width: 24px;
}

.seat-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.seat-tag {
  padding: 3px 9px;
  border-radius: 12px;
  font-size: 0.78rem;
  font-weight: 500;
}
.seat-tag.tag-avail {
  background: #e6f4ea;
  color: #1e7e34;
  border: 1px solid #b7dfbe;
}
.seat-tag.tag-occ {
  background: #f5f5f5;
  color: #bbb;
  border: 1px solid #e0e0e0;
}
.seat-tag.tag-mine {
  background: #fff8e1;
  color: #e65c00;
  border: 1px solid #ffcc80;
}
.seat-tag.tag-clickable {
  cursor: pointer;
}
.seat-tag.tag-clickable:hover {
  background: #c8e6c9;
  border-color: #81c784;
}

.dialog-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.dialog-box {
  background: #fff;
  border-radius: 14px;
  padding: 28px 32px;
  width: 320px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
}

.dialog-title {
  font-size: 1.05rem;
  font-weight: 600;
  color: #1a5e9a;
  margin-bottom: 16px;
}

.dialog-body p {
  margin: 6px 0;
  font-size: 0.9rem;
  color: #333;
  text-align: left;
}

.dialog-warn {
  color: #e65c00;
  background: #fff3e0;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 0.85rem;
  margin-top: 6px;
}

.dialog-error {
  color: #c62828;
  background: #fdecea;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 0.85rem;
  margin-top: 10px;
}

.dialog-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 22px;
}

.btn-cancel {
  padding: 8px 18px;
  border: 1px solid #ddd;
  border-radius: 8px;
  background: #fff;
  color: #666;
  font-size: 0.9rem;
  cursor: pointer;
}

.btn-confirm {
  padding: 8px 18px;
  border: none;
  border-radius: 8px;
  background: #1a5e9a;
  color: #fff;
  font-size: 0.9rem;
  cursor: pointer;
}

.btn-confirm:hover:not(:disabled) {
  background: #154d82;
}

.btn-confirm:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.avail-hint {
  font-size: 0.78rem;
  color: #1a5e9a;
  font-weight: 500;
  margin-left: 4px;
}
.avail-hint.no-avail {
  color: #bbb;
}

.seats-loading {
  font-size: 0.82rem;
  color: #aaa;
}
.seats-na {
  font-size: 0.82rem;
  color: #ccc;
}

.my-res-inline {
  font-size: 0.78rem;
  color: #e65c00;
}

.more-btn {
  background: transparent;
  border: 1px solid #ddd;
  border-radius: 10px;
  padding: 2px 0px;
  color: #bbb;
  font-size: 0.75rem;
  cursor: pointer;
}
.more-btn:hover {
  border-color: #bbb;
  color: #888;
}

.loading, .empty {
  color: #aaa;
  padding: 10px 0;
  font-size: 0.9rem;
}

.error {
  color: #c62828;
  background: #fdecea;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 0.9rem;
}
</style>
