<script setup lang="ts">
import { computed } from 'vue'
import { QUICK_SELECT_PRESETS } from '../composables/useYearRange'

const props = defineProps<{
  startDate: Date
  endDate: Date
  activePresetId: string | null
}>()

const emit = defineEmits<{
  change: [{ start: Date; end: Date; presetId: string | null }]
}>()

function toInputValue(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const startValue = computed(() => toInputValue(props.startDate))
const endValue = computed(() => toInputValue(props.endDate))

function onStartChange(e: Event) {
  const val = (e.target as HTMLInputElement).value
  if (!val) return
  const newStart = new Date(val + 'T00:00:00')
  if (newStart > props.endDate) return
  emit('change', { start: newStart, end: props.endDate, presetId: null })
}

function onEndChange(e: Event) {
  const val = (e.target as HTMLInputElement).value
  if (!val) return
  const newEnd = new Date(val + 'T23:59:59')
  if (newEnd < props.startDate) return
  emit('change', { start: props.startDate, end: newEnd, presetId: null })
}

function onPresetClick(presetId: string) {
  const preset = QUICK_SELECT_PRESETS.find(p => p.id === presetId)
  if (!preset) return
  const now = new Date()
  emit('change', { start: new Date(`${preset.startYear}-01-01T00:00:00`), end: now, presetId })
}
</script>

<template>
  <div class="date-range-selector">
    <div class="date-inputs">
      <div class="date-field-wrap" :class="{ 'custom-active': !activePresetId }">
        <span class="date-label">FROM</span>
        <input
          type="date"
          class="date-input"
          :value="startValue"
          :max="endValue"
          @change="onStartChange"
        />
      </div>
      <span class="date-separator">→</span>
      <div class="date-field-wrap" :class="{ 'custom-active': !activePresetId }">
        <span class="date-label">TO</span>
        <input
          type="date"
          class="date-input"
          :value="endValue"
          :min="startValue"
          @change="onEndChange"
        />
      </div>
    </div>

    <div class="divider"></div>

    <div class="quick-select">
      <button
        v-for="preset in QUICK_SELECT_PRESETS"
        :key="preset.id"
        class="preset-btn"
        :class="{ active: activePresetId === preset.id }"
        @click="onPresetClick(preset.id)"
      >
        {{ preset.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
/* ── shared token ───────────────────────────────────────── */
.date-range-selector {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

/* ── date pickers ───────────────────────────────────────── */
.date-inputs {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

/*
  The wrapper carries clip-path + border + background so the
  angled corners render exactly like the preset buttons.
  drop-shadow() works with clip-path; box-shadow does not.
*/
.date-field-wrap {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.625rem;
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  clip-path: polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px);
  transition: background-color 0.15s ease, border-color 0.15s ease, filter 0.15s ease;
  cursor: pointer;
}

.date-field-wrap:hover {
  background-color: var(--color-bg-secondary);
  border-color: var(--color-border-bright);
}

/* Blue glow when the user has a custom (non-preset) range active */
.date-field-wrap.custom-active {
  background: linear-gradient(135deg, var(--color-accent-dim) 0%, var(--color-accent) 100%);
  border-color: var(--color-accent);
  filter: drop-shadow(0 0 6px rgba(14, 165, 233, 0.35));
}

.date-field-wrap.custom-active:hover {
  background: linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-bright) 100%);
  filter: drop-shadow(0 0 10px rgba(14, 165, 233, 0.5));
}

.date-label {
  font-family: var(--font-mono);
  font-size: 0.5rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-text-muted);
  white-space: nowrap;
  pointer-events: none;
}

.custom-active .date-label {
  color: rgba(255, 255, 255, 0.75);
}

/* The input itself is transparent — the wrapper provides all styling */
.date-input {
  background: transparent;
  border: none;
  outline: none;
  font-family: var(--font-mono);
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 0;
  -webkit-appearance: none;
  appearance: none;
  width: 6.5rem;
  color-scheme: dark;
}

.custom-active .date-input {
  color: white;
}

.date-input::-webkit-calendar-picker-indicator {
  filter: opacity(0.45);
  cursor: pointer;
  padding: 0;
  margin-left: 0.125rem;
}

.date-input::-webkit-calendar-picker-indicator:hover {
  filter: opacity(0.9);
}

.custom-active .date-input::-webkit-calendar-picker-indicator {
  filter: invert(1) opacity(0.75);
}

.date-separator {
  font-family: var(--font-mono);
  font-size: 0.625rem;
  color: var(--color-text-muted);
}

/* ── divider ────────────────────────────────────────────── */
.divider {
  width: 1px;
  height: 1.25rem;
  background-color: var(--color-border);
  flex-shrink: 0;
}

/* ── quick-select preset buttons ────────────────────────── */
.quick-select {
  display: flex;
  gap: 0.25rem;
}

.preset-btn {
  padding: 0.25rem 0.625rem;
  font-family: var(--font-mono);
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  border: 1px solid rgba(14, 165, 233, 0.25);
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, filter 0.15s ease;
  background-color: var(--color-bg-tertiary);
  color: var(--color-accent);
  clip-path: polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px);
  white-space: nowrap;
  filter: drop-shadow(0 0 3px rgba(14, 165, 233, 0.12));
}

.preset-btn:hover {
  background-color: var(--color-bg-secondary);
  border-color: rgba(14, 165, 233, 0.5);
  color: var(--color-accent-bright, var(--color-accent));
  filter: drop-shadow(0 0 5px rgba(14, 165, 233, 0.25));
}

.preset-btn.active {
  background: linear-gradient(135deg, var(--color-accent-dim) 0%, var(--color-accent) 100%);
  border-color: var(--color-accent);
  color: white;
  filter: drop-shadow(0 0 6px rgba(14, 165, 233, 0.45));
}

.preset-btn.active:hover {
  background: linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-bright) 100%);
  filter: drop-shadow(0 0 10px rgba(14, 165, 233, 0.6));
}

.preset-btn:active {
  transform: scale(0.96);
}

/* ── mobile ─────────────────────────────────────────────── */
@media (max-width: 600px) {
  .date-range-selector {
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .date-field-wrap {
    padding: 0.2rem 0.4rem;
    clip-path: polygon(3px 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%, 0 3px);
  }

  .date-input {
    width: 5.75rem;
    font-size: 0.5625rem;
  }

  .preset-btn {
    padding: 0.2rem 0.4rem;
    font-size: 0.5625rem;
    clip-path: polygon(3px 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%, 0 3px);
  }

  .divider {
    display: none;
  }
}
</style>
