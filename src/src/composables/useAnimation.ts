import { ref, computed } from 'vue'
import { ANIMATION_DURATION_MS, YEAR_START, YEAR_DURATION } from '../utils/constants'

export function useAnimation() {
  const isPlaying = ref(false)
  const isPaused = ref(false)
  const isComplete = ref(false)
  const currentTime = ref(YEAR_START)
  const animationStartTime = ref(0)
  const pausedElapsed = ref(0)
  const animationFrameId = ref<number | null>(null)

  const progress = computed(() => {
    return ((currentTime.value - YEAR_START) / YEAR_DURATION) * 100
  })

  const currentDateDisplay = computed(() => {
    const date = new Date(currentTime.value)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  })

  function animate(timestamp: number) {
    if (!isPlaying.value || isPaused.value) return

    const elapsed = timestamp - animationStartTime.value + pausedElapsed.value
    const timeProgress = Math.min(elapsed / ANIMATION_DURATION_MS, 1)
    currentTime.value = YEAR_START + timeProgress * YEAR_DURATION

    if (timeProgress >= 1) {
      isPlaying.value = false
      isComplete.value = true
      return
    }

    animationFrameId.value = requestAnimationFrame(animate)
  }

  function startAnimation() {
    if (isComplete.value) {
      currentTime.value = YEAR_START
      pausedElapsed.value = 0
      isComplete.value = false
    }

    isPlaying.value = true
    isPaused.value = false
    animationStartTime.value = performance.now()
    animationFrameId.value = requestAnimationFrame(animate)
  }

  function pauseAnimation() {
    if (isPlaying.value && !isPaused.value) {
      isPaused.value = true
      pausedElapsed.value += performance.now() - animationStartTime.value
      if (animationFrameId.value) {
        cancelAnimationFrame(animationFrameId.value)
      }
    }
  }

  function resumeAnimation() {
    if (isPlaying.value && isPaused.value) {
      isPaused.value = false
      animationStartTime.value = performance.now()
      animationFrameId.value = requestAnimationFrame(animate)
    }
  }

  function togglePlayPause() {
    if (!isPlaying.value || isComplete.value) {
      startAnimation()
    } else if (isPaused.value) {
      resumeAnimation()
    } else {
      pauseAnimation()
    }
  }

  function resetAnimation() {
    isPlaying.value = false
    isPaused.value = false
    isComplete.value = false
    currentTime.value = YEAR_START
    pausedElapsed.value = 0
    if (animationFrameId.value) {
      cancelAnimationFrame(animationFrameId.value)
    }
  }

  function seekTo(progressPercent: number) {
    const clampedProgress = Math.max(0, Math.min(100, progressPercent))
    const timeProgress = clampedProgress / 100
    currentTime.value = YEAR_START + timeProgress * YEAR_DURATION

    // Update pausedElapsed to match the seek position
    pausedElapsed.value = timeProgress * ANIMATION_DURATION_MS

    // If we were complete and seek back, reset complete state
    if (isComplete.value && clampedProgress < 100) {
      isComplete.value = false
    }

    // If we seek to end, mark as complete
    if (clampedProgress >= 100) {
      isComplete.value = true
      isPlaying.value = false
      isPaused.value = false
      if (animationFrameId.value) {
        cancelAnimationFrame(animationFrameId.value)
      }
    }

    // If playing and not paused, restart animation from new position
    if (isPlaying.value && !isPaused.value && clampedProgress < 100) {
      animationStartTime.value = performance.now()
      if (animationFrameId.value) {
        cancelAnimationFrame(animationFrameId.value)
      }
      animationFrameId.value = requestAnimationFrame(animate)
    }
  }

  function cleanup() {
    if (animationFrameId.value) {
      cancelAnimationFrame(animationFrameId.value)
    }
  }

  return {
    isPlaying,
    isPaused,
    isComplete,
    currentTime,
    progress,
    currentDateDisplay,
    startAnimation,
    pauseAnimation,
    resumeAnimation,
    togglePlayPause,
    resetAnimation,
    seekTo,
    cleanup
  }
}
