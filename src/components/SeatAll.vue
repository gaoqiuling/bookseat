<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { http } from '../utils/http'

const route = useRoute()
const router = useRouter()

const date = route.query.date
const periodTime = route.query.periodTime

const loading = ref(true)
const error = ref('')
const northSeats = ref([])
const eastSeats = ref([])
const southSeats = ref([])
const westSeats = ref([])

const myReservations = ref([])

async function fetchArea(areaId) {
  const startTime = periodTime.split('-')[0]
  const reservationStartDate = `${date} ${startTime}:00`
  const json = await http.get('/seat/getAreaSeats', { areaId, reservationStartDate })
  if (json.resultStatus?.code !== 0 && json.resultStatus?.code !== 200) return []
  return Array.isArray(json.resultValue) ? json.resultValue : []
}

async function fetchMyReservations() {
  try {
    const json = await http.post('/reservation/myReservationList', { status: 0, size: 100000, page: 1 })
    if (json.resultStatus?.code !== 0 && json.resultStatus?.code !== 200) return
    const content = Array.isArray(json.resultValue?.content) ? json.resultValue.content : []
    const day = content.find(d => d.reservationDate === date)
    myReservations.value = Array.isArray(day?.reservationList) ? day.reservationList : []
  } catch (e) {
    console.error('[myReservationList] error:', e)
  }
}

async function reloadSeats() {
  const [north, east, south, west] = await Promise.all([fetchArea(4), fetchArea(2), fetchArea(5), fetchArea(3)])
  northSeats.value = north
  eastSeats.value = east
  southSeats.value = south
  westSeats.value = west
}

onMounted(async () => {
  try {
    await Promise.all([reloadSeats(), fetchMyReservations()])
  } catch (e) {
    error.value = '加载失败：' + e.message
  } finally {
    loading.value = false
  }
})

function isMyReservedSeat(seatId) {
  const startTime = periodTime.split('-')[0]
  return myReservations.value.some(r => r.startTime === startTime && r.seatId === seatId)
}

// 预约弹窗
const dialog = ref(null)
const booking = ref(false)
const bookError = ref('')

function openBookDialog(seat, areaLabel) {
  const startTime = periodTime.split('-')[0]
  const existing = myReservations.value.find(r => r.startTime === startTime)
  dialog.value = { seat: { ...seat, area: areaLabel }, existing: existing || null }
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
    const { seat, existing } = dialog.value
    if (existing) {
      const cancelJson = await http.get('/seatReservation/calcelReservation', { reservationId: existing.reservationId })
      if (cancelJson.resultStatus?.code !== 0 && cancelJson.resultStatus?.code !== 200) {
        bookError.value = '取消原预约失败：' + (cancelJson.resultStatus?.message || '未知错误')
        return
      }
    }
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
    await Promise.all([reloadSeats(), fetchMyReservations()])
  } catch (e) {
    bookError.value = '预约失败：' + e.message
  } finally {
    booking.value = false
  }
}
</script>

<template>
  <div class="container">
    <div class="page-header">
      <button class="back-btn" @click="router.back()">← 返回</button>
      <div class="header-info">
        <div class="header-date">{{ date }} {{ periodTime }}</div>
      </div>
    </div>

    <div v-if="loading" class="loading">加载中...</div>
    <p v-else-if="error" class="error">{{ error }}</p>
    <template v-else>
      <div v-for="group in [{ label: '北区', seats: northSeats }, { label: '东区', seats: eastSeats }, { label: '南区', seats: southSeats }, { label: '西区', seats: westSeats }]" :key="group.label" class="area-section">
        <div class="area-header">{{ group.label }}</div>
        <div v-if="group.seats.length" class="seat-grid">
          <div
            v-for="(s, i) in group.seats"
            :key="i"
            class="seat-card"
            :class="[
              isMyReservedSeat(s.seatId) ? 'mine' : s.seatStatus === 3 ? 'avail' : 'occ',
              s.seatStatus === 3 && !isMyReservedSeat(s.seatId) ? 'clickable' : ''
            ]"
            @click="s.seatStatus === 3 && !isMyReservedSeat(s.seatId) && openBookDialog(s, group.label)"
          >
            {{ s.seatRow }}{{ s.seatNo }}
          </div>
        </div>
        <p v-else class="empty">暂无数据</p>
      </div>
    </template>
  </div>

  <!-- 预约确认弹窗 -->
  <div v-if="dialog" class="dialog-mask" @click.self="closeDialog">
    <div class="dialog-box">
      <div class="dialog-title">确定预约吗</div>
      <div class="dialog-body">
        <p>日期：{{ date }} {{ periodTime }}</p>
        <p>座位：{{ dialog.seat.area }}{{ dialog.seat.seatRow }}{{ dialog.seat.seatNo }}</p>
        <p v-if="dialog.existing" class="dialog-warn">
          该时段已有预约（{{ dialog.existing.seatNo }}），确认后将自动取消并预约新座位
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
  gap: 16px;
  margin-bottom: 28px;
}

.back-btn {
  padding: 7px 16px;
  background: #f0f0f0;
  border: none;
  border-radius: 20px;
  font-size: 0.9rem;
  cursor: pointer;
  color: #333;
  white-space: nowrap;
}
.back-btn:hover {
  background: #e0e0e0;
}

.header-date {
  font-size: 1rem;
  font-weight: 600;
  color: #1a5e9a;
}

.area-section {
  margin-bottom: 28px;
}

.area-header {
  font-size: 0.95rem;
  font-weight: 600;
  color: #1a5e9a;
  padding: 5px 12px;
  background: #e8f0fb;
  border-left: 4px solid #1a5e9a;
  border-radius: 0 6px 6px 0;
  margin-bottom: 14px;
}

.seat-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.seat-card {
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 0.82rem;
  font-weight: 500;
  border: 1px solid;
}

.seat-card.avail {
  background: #e6f4ea;
  color: #1e7e34;
  border-color: #b7dfbe;
}

.seat-card.occ {
  background: #f5f5f5;
  color: #bbb;
  border-color: #e0e0e0;
}

.seat-card.mine {
  background: #fff8e1;
  color: #e65c00;
  border-color: #ffcc80;
}

.seat-card.clickable {
  cursor: pointer;
}
.seat-card.clickable:hover {
  background: #c8e6c9;
  border-color: #81c784;
}

.loading, .empty {
  color: #aaa;
  font-size: 0.9rem;
  padding: 10px 0;
}

.error {
  color: #c62828;
  background: #fdecea;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 0.9rem;
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
</style>
