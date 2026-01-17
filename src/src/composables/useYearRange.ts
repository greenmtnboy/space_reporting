import { ref, computed } from 'vue'

export interface YearRangeOption {
  id: string
  label: string
  startYear: number
  endYear: number
}

export const YEAR_RANGE_OPTIONS: YearRangeOption[] = [
  { id: '2026', label: '2026', startYear: 2026, endYear: 2026 },
  { id: '2025', label: '2025', startYear: 2025, endYear: 2025 },
  { id: '2020+', label: '2020+', startYear: 2020, endYear: 2026 },
  { id: '2000+', label: '2000+', startYear: 2000, endYear: 2026 },
  { id: '1950+', label: '1950+', startYear: 1950, endYear: 2026 }
]

export function useYearRange(baseDurationPerYear: number = 40000) {
  const selectedRangeId = ref('2025')

  const selectedRange = computed(() => {
    return YEAR_RANGE_OPTIONS.find(r => r.id === selectedRangeId.value) || YEAR_RANGE_OPTIONS[1]
  })

  const rangeStart = computed(() => {
    return new Date(`${selectedRange.value.startYear}-01-01`).getTime()
  })

  const rangeEnd = computed(() => {
    return new Date(`${selectedRange.value.endYear}-12-31T23:59:59`).getTime()
  })

  const rangeDuration = computed(() => {
    return rangeEnd.value - rangeStart.value
  })

  // Animation duration scales with number of years
  const yearCount = computed(() => {
    return selectedRange.value.endYear - selectedRange.value.startYear + 1
  })

  const animationDurationMs = computed(() => {
    return yearCount.value * baseDurationPerYear
  })

  const title = computed(() => {
    const range = selectedRange.value
    if (range.startYear === range.endYear) {
      return `${range.startYear}`
    }
    return `${range.startYear}-${range.endYear}`
  })

  const progressStartLabel = computed(() => {
    const range = selectedRange.value
    if (range.startYear === range.endYear) {
      return `Jan ${range.startYear}`
    }
    return `${range.startYear}`
  })

  const progressEndLabel = computed(() => {
    const range = selectedRange.value
    if (range.startYear === range.endYear) {
      return `Dec ${range.endYear}`
    }
    return `${range.endYear}`
  })

  function selectRange(rangeId: string) {
    selectedRangeId.value = rangeId
  }

  return {
    selectedRangeId,
    selectedRange,
    rangeStart,
    rangeEnd,
    rangeDuration,
    animationDurationMs,
    title,
    progressStartLabel,
    progressEndLabel,
    selectRange,
    options: YEAR_RANGE_OPTIONS
  }
}
