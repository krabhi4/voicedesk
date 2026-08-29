export type Slot = {
  id: string
  time: string
  label: string
}

export type Day = {
  date: string
  weekday: string
  monthDay: string
  slots: Slot[]
}

const OPEN_HOUR = 9
const CLOSE_HOUR = 17

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function timeLabel(hour: number, minute: number) {
  return new Date(2000, 0, 1, hour, minute).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function buildWeek(now = new Date()): Day[] {
  const days: Day[] = []
  const cursor = new Date(now)
  while (days.length < 7) {
    if (cursor.getDay() !== 0) {
      const date = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`
      const weekday = cursor.toLocaleDateString('en-US', { weekday: 'short' })
      const monthDay = cursor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      const slots: Slot[] = []
      for (let hour = OPEN_HOUR; hour < CLOSE_HOUR; hour++) {
        for (const minute of [0, 30]) {
          const isToday = cursor.toDateString() === now.toDateString()
          const past =
            isToday &&
            (hour < now.getHours() || (hour === now.getHours() && minute <= now.getMinutes()))
          if (past) continue
          slots.push({
            id: `${date}|${pad(hour)}:${pad(minute)}`,
            time: `${pad(hour)}:${pad(minute)}`,
            label: `${weekday} ${monthDay}, ${timeLabel(hour, minute)}`,
          })
        }
      }
      days.push({ date, weekday, monthDay, slots })
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

export function slotLabel(slotId: string): string {
  const [date, time] = slotId.split('|')
  if (!date || !time) return slotId
  const [h, m] = time.split(':').map(Number)
  const d = new Date(`${date}T00:00:00`)
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short' })
  const monthDay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${weekday} ${monthDay}, ${timeLabel(h, m)}`
}

export function isValidSlot(slotId: string, now = new Date()): boolean {
  return buildWeek(now).some((day) => day.slots.some((s) => s.id === slotId))
}

export function newCode(): string {
  return `VD-${Math.floor(1000 + Math.random() * 9000)}`
}
