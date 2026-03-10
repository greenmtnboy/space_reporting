import { ref, computed } from 'vue'

export interface QuickSelectPreset {
  id: string
  label: string
  startYear: number
}

export const QUICK_SELECT_PRESETS: QuickSelectPreset[] = [
  { id: '1950+', label: '1950+', startYear: 1950 },
  { id: '2000+', label: '2000+', startYear: 2000 },
  { id: '2010+', label: '2010+', startYear: 2010 },
]

function getDefaultStart(): Date {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 1)
  d.setHours(0, 0, 0, 0)
  return d
}

function getDefaultEnd(): Date {
  const d = new Date()
  d.setHours(23, 59, 59, 999)
  return d
}

function formatProgressLabel(date: Date): string {
  const month = date.toLocaleString('en-US', { month: 'short' })
  return `${month} ${date.getFullYear()}`
}

export function useYearRange(baseDurationPerYear: number = 40000) {
  const startDate = ref<Date>(getDefaultStart())
  const endDate = ref<Date>(getDefaultEnd())
  const activePresetId = ref<string | null>(null)

  const rangeStart = computed(() => startDate.value.getTime())
  const rangeEnd = computed(() => endDate.value.getTime())

  const rangeDuration = computed(() => rangeEnd.value - rangeStart.value)

  const yearCount = computed(() => {
    return Math.max(1, endDate.value.getFullYear() - startDate.value.getFullYear() + 1)
  })

  const animationDurationMs = computed(() => yearCount.value * baseDurationPerYear)

  const title = computed(() => {
    if (activePresetId.value) {
      return activePresetId.value
    }
    const start = formatProgressLabel(startDate.value)
    const end = formatProgressLabel(endDate.value)
    return start === end ? start : `${start} - ${end}`
  })

  const progressStartLabel = computed(() => formatProgressLabel(startDate.value))
  const progressEndLabel = computed(() => formatProgressLabel(endDate.value))

  function setRange(start: Date, end: Date, presetId: string | null = null) {
    startDate.value = start
    endDate.value = end
    activePresetId.value = presetId
  }

  function selectPreset(presetId: string) {
    const preset = QUICK_SELECT_PRESETS.find(p => p.id === presetId)
    if (!preset) return
    const now = new Date()
    setRange(new Date(`${preset.startYear}-01-01`), now, presetId)
  }

  // Kept for internal use / compat
  function selectRange(rangeId: string) {
    selectPreset(rangeId)
  }

  return {
    startDate,
    endDate,
    activePresetId,
    rangeStart,
    rangeEnd,
    rangeDuration,
    animationDurationMs,
    title,
    progressStartLabel,
    progressEndLabel,
    setRange,
    selectPreset,
    selectRange,
    presets: QUICK_SELECT_PRESETS,
  }
}
