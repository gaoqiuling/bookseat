<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { http } from '../utils/http'
import { seatConfigStore, matchesHardcodedDefault } from '../store/seatConfig'

const router = useRouter()

const areaMap = [
  { id: 4, label: '北区' },
  { id: 2, label: '东区' },
  { id: 5, label: '南区' },
  { id: 3, label: '西区' },
]

function toLocalDateStr(d) {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const areaSeats = ref({})
const seatsLoading = ref(false)
const initError = ref('')

const selected = ref({})

const toast = ref('')
let toastTimer = null

function showToast(msg) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value = ''
  }, 3000)
}

async function init() {
  seatsLoading.value = true
  initError.value = ''
  try {
    const today = toLocalDateStr(new Date())
    const pJson = await http.get('/api/period', { date: today, reservationType: 14, libraryId: 1 })
    const list = (pJson.resultStatus?.code === 0 || pJson.resultStatus?.code === 200)
      ? (Array.isArray(pJson.resultValue) ? pJson.resultValue : [])
      : []
    const now = new Date()
    const valid = list.filter(p => {
      const endTime = p.periodTime.split('-')[1]
      const [h, m] = endTime.split(':').map(Number)
      return now.getHours() < h || (now.getHours() === h && now.getMinutes() < m)
    })
    if (valid.length === 0) {
      initError.value = '暂无可选时段'
      return
    }
    const periodTime = valid[0].periodTime
    const startTime = periodTime.split('-')[0]
    const reservationStartDate = `${today} ${startTime}:00`

    const results = await Promise.all(areaMap.map(a =>
      http.get('/seat/getAreaSeats', { areaId: a.id, reservationStartDate })
        .then(j => (j.resultStatus?.code === 0 || j.resultStatus?.code === 200)
          ? (Array.isArray(j.resultValue) ? j.resultValue : [])
          : [])
    ))

    const newAreaSeats = {}
    const newSelected = {}
    for (let i = 0; i < areaMap.length; i++) {
      const areaId = areaMap[i].id
      newAreaSeats[areaId] = results[i]
      if (seatConfigStore.hasConfig(areaId)) {
        const favIds = new Set(seatConfigStore.getFavoriteIds(areaId))
        newSelected[areaId] = new Set(results[i].filter(s => favIds.has(s.seatId)).map(s => s.seatId))
      } else {
        newSelected[areaId] = new Set(results[i].filter(s => matchesHardcodedDefault(s, areaId)).map(s => s.seatId))
      }
    }
    areaSeats.value = newAreaSeats
    selected.value = newSelected
  } catch (e) {
    initError.value = '加载失败：' + e.message
  } finally {
    seatsLoading.value = false
  }
}

function toggleSeat(areaId, seatId) {
  if (!selected.value[areaId]) {
    selected.value[areaId] = new Set()
  }
  const s = selected.value[areaId]
  if (s.has(seatId)) {
    s.delete(seatId)
  } else {
    s.add(seatId)
  }
}

function toggleAll(areaId) {
  const seats = areaSeats.value[areaId] || []
  const current = selected.value[areaId]
  if (current && current.size === seats.length) {
    selected.value[areaId] = new Set()
  } else {
    selected.value[areaId] = new Set(seats.map(s => s.seatId))
  }
}

function isSelected(areaId, seatId) {
  return selected.value[areaId]?.has(seatId) ?? false
}

function isAllSelected(areaId) {
  const seats = areaSeats.value[areaId] || []
  return seats.length > 0 && (selected.value[areaId]?.size ?? 0) === seats.length
}

function selectedCount(areaId) {
  return selected.value[areaId]?.size ?? 0
}

function saveArea(areaId) {
  const ids = [...(selected.value[areaId] || [])]
  seatConfigStore.setAllFavorites({ ...seatConfigStore.favorites, [areaId]: ids })
  const label = areaMap.find(a => a.id === areaId)?.label || ''
  showToast(`${label} 保存成功`)
}

function resetArea(areaId) {
  const seats = areaSeats.value[areaId] || []
  selected.value[areaId] = new Set(
    seats.filter(s => matchesHardcodedDefault(s, areaId)).map(s => s.seatId)
  )
  const label = areaMap.find(a => a.id === areaId)?.label || ''
  showToast(`${label} 已恢复默认`)
}

onMounted(() => {
  init()
})
</script>

<template>
  <div class="container">
    <div v-if="toast" class="toast">{{ toast }}</div>
    <div class="page-header">
      <button class="back-btn" @click="router.back()">← 返回</button>
      <h1>选择佳座</h1>
    </div>

    <div v-if="initError" class="error">{{ initError }}</div>
    <div v-else-if="seatsLoading" class="loading">加载座位中...</div>
    <template v-else>
      <div v-for="area in areaMap" :key="area.id" class="area-section">
        <div class="area-header">
          <span>{{ area.label }}</span>
          <span class="selected-count">已选 {{ selectedCount(area.id) }} / {{ (areaSeats[area.id] || []).length }}</span>
          <button class="toggle-all-btn" @click="toggleAll(area.id)">
            {{ isAllSelected(area.id) ? '取消全选' : '全选' }}
          </button>
          <button class="area-save-btn" @click="saveArea(area.id)">保存</button>
          <button class="area-reset-btn" @click="resetArea(area.id)">重置</button>
        </div>
        <div v-if="(areaSeats[area.id] || []).length" class="seat-grid">
          <label
            v-for="s in areaSeats[area.id]"
            :key="s.seatId"
            class="seat-check-card"
            :class="{ checked: isSelected(area.id, s.seatId) }"
          >
            <input
              type="checkbox"
              :checked="isSelected(area.id, s.seatId)"
              @change="toggleSeat(area.id, s.seatId)"
            />
            <span>{{ s.seatRow }}{{ s.seatNo }}</span>
          </label>
        </div>
        <p v-else class="empty">暂无数据</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.container {
  max-width: 960px;
  margin: 0 auto;
  padding: 24px 20px;
  font-family: 'PingFang SC', 'Helvetica Neue', sans-serif;
  color: #222;
  position: relative;
}

.toast {
  position: fixed;
  top: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: #1a5e9a;
  color: #fff;
  padding: 10px 28px;
  border-radius: 8px;
  font-size: 0.9rem;
  z-index: 200;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
  animation: toast-in 0.25s ease;
}

@keyframes toast-in {
  from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}

.page-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}

.page-header h1 {
  flex: 1;
  font-size: 1.2rem;
  color: #1a5e9a;
  margin: 0;
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
.back-btn:hover { background: #e0e0e0; }

.loading, .empty { color: #aaa; font-size: 0.9rem; padding: 10px 0; }

.error {
  color: #c62828;
  background: #fdecea;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 0.9rem;
}

.area-section {
  margin-bottom: 24px;
}

.area-header {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.95rem;
  font-weight: 600;
  color: #1a5e9a;
  padding: 5px 12px;
  background: #e8f0fb;
  border-left: 4px solid #1a5e9a;
  border-radius: 0 6px 6px 0;
  margin-bottom: 12px;
}

.selected-count {
  font-size: 0.78rem;
  color: #888;
  font-weight: 400;
  margin-left: auto;
}

.toggle-all-btn {
  padding: 2px 10px;
  border: 1px solid #ddd;
  border-radius: 10px;
  background: #fff;
  font-size: 0.75rem;
  color: #888;
  cursor: pointer;
}
.toggle-all-btn:hover { border-color: #aaa; color: #555; }

.area-save-btn {
  padding: 2px 14px;
  border: none;
  border-radius: 10px;
  background: #1a5e9a;
  font-size: 0.75rem;
  color: #fff;
  cursor: pointer;
}
.area-save-btn:hover { background: #154d82; }

.area-reset-btn {
  padding: 2px 10px;
  border: 1px solid #ddd;
  border-radius: 10px;
  background: #fff;
  font-size: 0.75rem;
  color: #e65c00;
  cursor: pointer;
}
.area-reset-btn:hover { border-color: #e65c00; }

.seat-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.seat-check-card {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 0.82rem;
  font-weight: 500;
  border: 1px solid #e0e0e0;
  background: #f9f9f9;
  color: #999;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.seat-check-card.checked {
  background: #e6f4ea;
  color: #1e7e34;
  border-color: #b7dfbe;
}

.seat-check-card input[type="checkbox"] {
  accent-color: #1a5e9a;
  cursor: pointer;
}

.seat-check-card:hover {
  border-color: #bbb;
}
</style>
