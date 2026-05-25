import { reactive } from 'vue'

function loadFavorites() {
  try {
    return JSON.parse(localStorage.getItem('favoriteSeats') || '{}')
  } catch {
    return {}
  }
}

export const seatConfigStore = reactive({
  favorites: loadFavorites(),

  hasConfig(areaId) {
    return Array.isArray(this.favorites[areaId]) && this.favorites[areaId].length > 0
  },

  getFavoriteIds(areaId) {
    return this.favorites[areaId] || []
  },

  setAllFavorites(map) {
    this.favorites = {}
    for (const [key, val] of Object.entries(map)) {
      if (val && val.length > 0) {
        this.favorites[key] = [...val]
      }
    }
    localStorage.setItem('favoriteSeats', JSON.stringify(this.favorites))
  },

  ensureDefaults(areaId, seats) {
    if (!this.hasConfig(areaId)) {
      const ids = seats.filter(s => matchesHardcodedDefault(s, areaId)).map(s => s.seatId)
      if (ids.length > 0) {
        this.favorites = { ...this.favorites, [areaId]: ids }
        localStorage.setItem('favoriteSeats', JSON.stringify(this.favorites))
      }
    }
  }
})

export function getHardcodedDefaults(areaId) {
  if (areaId === 4) {
    return { rows: ['5排', '6排', '7排'], nos: ['5号', '10号'] }
  }
  if (areaId === 2) {
    return { rows: ['4排', '5排'], nos: ['4号', '8号'] }
  }
  if (areaId === 5) {
    return [
      [{ seatRow: ['23排', '21排'], seatNo: ['10号'] }],
      [{ seatRow: ['24排'], seatNo: ['7号'] }],
      [{ seatRow: ['18排'], seatNo: ['6号', '5号'] }],
      [{ seatRow: ['25排', '22排'], seatNo: ['12号'] }],
    ]
  }
  return null
}

export function matchesHardcodedDefault(seat, areaId) {
  if (areaId === 4) return ['5排', '6排', '7排'].includes(seat.seatRow) && ['5号', '10号'].includes(seat.seatNo)
  if (areaId === 2) return ['4排', '5排'].includes(seat.seatRow) && ['4号', '8号'].includes(seat.seatNo)
  if (areaId === 5) {
    return (
      (['23排', '21排'].includes(seat.seatRow) && ['10号'].includes(seat.seatNo)) ||
      (seat.seatRow === '24排' && ['7号'].includes(seat.seatNo)) ||
      (seat.seatRow === '18排' && ['6号', '5号'].includes(seat.seatNo)) ||
      (['25排', '22排'].includes(seat.seatRow) && ['12号'].includes(seat.seatNo))
    )
  }
  return false
}
