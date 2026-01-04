import { ref, watch, type Ref } from 'vue'
import type { ActiveLaunch } from './useLaunches'

export function useSound(
  activeLaunches: Ref<ActiveLaunch[]>,
  isPlaying: Ref<boolean>
) {
  const isMuted = ref(false)
  const volume = ref(0.6)

  let audioContext: AudioContext | null = null
  let seenLaunches = new Set<string>()

  function getAudioContext(): AudioContext {
    if (!audioContext) {
      audioContext = new AudioContext()
    }
    return audioContext
  }

  // Synthesize a roar/whoosh sound - frequency and duration based on payload size
  function playWhoosh(payloadSize: number) {
    if (isMuted.value) return

    const ctx = getAudioContext()
    const now = ctx.currentTime

    // Normalize payload (0-18 tons) to 0-1 range
    const normalizedSize = Math.min(payloadSize, 18) / 18

    // Deeper frequencies across the board, bigger difference between small and large
    const baseFreq = 300 - normalizedSize * 200  // 350Hz to 150Hz (much lower overall)
    const duration = 1.5 + normalizedSize * 0.5  // 0.5s to 1.0s
    // Smaller launches are quieter, larger ones are more prominent
    const gainLevel = (0.08 + normalizedSize * 0.35) * volume.value

    // Create noise buffer for the roar texture
    const bufferSize = ctx.sampleRate * duration
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const output = noiseBuffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1
    }

    const noise = ctx.createBufferSource()
    noise.buffer = noiseBuffer

    // Low-pass filter for the deep roar foundation
    const lowPass = ctx.createBiquadFilter()
    lowPass.type = 'lowpass'
    lowPass.frequency.setValueAtTime(baseFreq * 4, now)
    lowPass.frequency.exponentialRampToValueAtTime(baseFreq * 6, now + duration * 0.2)
    lowPass.frequency.exponentialRampToValueAtTime(baseFreq, now + duration)
    lowPass.Q.value = 0.5

    // High-pass - lower cutoff to keep more bass
    const highPass = ctx.createBiquadFilter()
    highPass.type = 'highpass'
    highPass.frequency.value = 20

    // Add resonant peak for "whoosh" character - lower frequency
    const peakFilter = ctx.createBiquadFilter()
    peakFilter.type = 'peaking'
    peakFilter.frequency.setValueAtTime(baseFreq * 1.5, now)
    peakFilter.frequency.exponentialRampToValueAtTime(baseFreq * 3, now + duration * 0.3)
    peakFilter.frequency.exponentialRampToValueAtTime(baseFreq * 0.8, now + duration)
    peakFilter.Q.value = 1.5
    peakFilter.gain.value = 8

    // Envelope - quick attack, sustain, then fade
    const gainNode = ctx.createGain()
    gainNode.gain.setValueAtTime(0, now)
    gainNode.gain.linearRampToValueAtTime(gainLevel, now + 0.02)
    gainNode.gain.setValueAtTime(gainLevel, now + duration * 0.4)
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration)

    noise.connect(highPass)
    highPass.connect(lowPass)
    lowPass.connect(peakFilter)
    peakFilter.connect(gainNode)
    gainNode.connect(ctx.destination)

    noise.start(now)
    noise.stop(now + duration)

    // Add a low rumble oscillator - now for all launches, stronger for bigger ones
    const rumble = ctx.createOscillator()
    rumble.type = 'sawtooth'
    rumble.frequency.setValueAtTime(40 + normalizedSize * 25, now)
    rumble.frequency.exponentialRampToValueAtTime(25, now + duration * 0.8)

    const rumbleGain = ctx.createGain()
    const rumbleLevel = (0.05 + normalizedSize * 0.2) * volume.value
    rumbleGain.gain.setValueAtTime(0, now)
    rumbleGain.gain.linearRampToValueAtTime(rumbleLevel, now + 0.03)
    rumbleGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.7)

    const rumbleFilter = ctx.createBiquadFilter()
    rumbleFilter.type = 'lowpass'
    rumbleFilter.frequency.value = 120

    rumble.connect(rumbleFilter)
    rumbleFilter.connect(rumbleGain)
    rumbleGain.connect(ctx.destination)

    rumble.start(now)
    rumble.stop(now + duration)
  }

  // Synthesize a crash/explosion sound for failures
  function playCrash() {
    if (isMuted.value) return

    const ctx = getAudioContext()
    const now = ctx.currentTime
    const duration = 0.8
    const gainLevel = 0.45 * volume.value

    // Create noise burst for explosion
    const bufferSize = ctx.sampleRate * duration
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const output = noiseBuffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1
    }

    const noise = ctx.createBufferSource()
    noise.buffer = noiseBuffer

    // Low-pass filter that sweeps down for explosion rumble
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(3000, now)
    filter.frequency.exponentialRampToValueAtTime(80, now + duration)
    filter.Q.value = 1

    // Sharp attack, long decay envelope
    const gainNode = ctx.createGain()
    gainNode.gain.setValueAtTime(0, now)
    gainNode.gain.linearRampToValueAtTime(gainLevel, now + 0.008)
    gainNode.gain.setValueAtTime(gainLevel * 0.9, now + 0.05)
    gainNode.gain.exponentialRampToValueAtTime(gainLevel * 0.4, now + 0.15)
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration)

    // Add distortion for crunchiness
    const distortion = ctx.createWaveShaper()
    const curve = new Float32Array(256)
    for (let i = 0; i < 256; i++) {
      const x = (i / 128) - 1
      curve[i] = Math.tanh(x * 3)
    }
    distortion.curve = curve

    noise.connect(filter)
    filter.connect(distortion)
    distortion.connect(gainNode)
    gainNode.connect(ctx.destination)

    noise.start(now)
    noise.stop(now + duration)

    // Deep impact thump
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(100, now)
    osc.frequency.exponentialRampToValueAtTime(25, now + 0.4)

    const thumpGain = ctx.createGain()
    thumpGain.gain.setValueAtTime(gainLevel * 1.2, now)
    thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4)

    osc.connect(thumpGain)
    thumpGain.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.4)

    // Add crackling mid-frequency layer
    const crackleBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate)
    const crackleData = crackleBuffer.getChannelData(0)
    for (let i = 0; i < crackleData.length; i++) {
      crackleData[i] = (Math.random() * 2 - 1) * (Math.random() > 0.7 ? 1 : 0.2)
    }

    const crackle = ctx.createBufferSource()
    crackle.buffer = crackleBuffer

    const crackleFilter = ctx.createBiquadFilter()
    crackleFilter.type = 'bandpass'
    crackleFilter.frequency.value = 800
    crackleFilter.Q.value = 1

    const crackleGain = ctx.createGain()
    crackleGain.gain.setValueAtTime(gainLevel * 0.5, now + 0.02)
    crackleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25)

    crackle.connect(crackleFilter)
    crackleFilter.connect(crackleGain)
    crackleGain.connect(ctx.destination)

    crackle.start(now)
    crackle.stop(now + 0.3)
  }

  // Watch for new launches appearing
  watch(activeLaunches, (newLaunches) => {
    if (!isPlaying.value) return

    for (const launch of newLaunches) {
      // Only play sound for launches we haven't seen yet
      if (!seenLaunches.has(launch.launch_tag)) {
        seenLaunches.add(launch.launch_tag)

        if (launch.isFailed) {
          playCrash()
        } else {
          playWhoosh(launch.orb_pay)
        }
      }
    }
  }, { deep: true })

  // Reset seen launches when animation resets
  function resetSeenLaunches() {
    seenLaunches.clear()
  }

  function toggleMute() {
    isMuted.value = !isMuted.value
  }

  function setVolume(v: number) {
    volume.value = Math.max(0, Math.min(1, v))
  }

  // Resume audio context on user interaction (browser autoplay policy)
  function resumeAudioContext() {
    if (audioContext?.state === 'suspended') {
      audioContext.resume()
    }
  }

  return {
    isMuted,
    volume,
    toggleMute,
    setVolume,
    resetSeenLaunches,
    resumeAudioContext
  }
}
