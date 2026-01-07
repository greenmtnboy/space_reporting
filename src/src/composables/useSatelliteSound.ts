import { ref, watch, onUnmounted, type Ref } from 'vue'
import type { ActiveSatellite } from '../types'
import * as THREE from 'three'

// Orbit types from types.ts: 'LEO' | 'MEO' | 'GEO' | 'HEO' | 'ESCAPE'
const ORBIT_TYPES = ['LEO', 'MEO', 'GEO', 'HEO', 'ESCAPE'] as const
type OrbitType = typeof ORBIT_TYPES[number]

interface Voice {
  oscillator: OscillatorNode
  lfo: OscillatorNode
  lfoGain: GainNode
  gain: GainNode
  filter: BiquadFilterNode
  baseFreq: number
  type: OrbitType
}

export function useSatelliteSound(
  activeSatellites: Ref<ActiveSatellite[]>,
  getCamera: () => THREE.Camera,
  isPlaying: Ref<boolean>
) {
  const isMuted = ref(false)
  const volume = ref(0.5)
  const isAudioInitialized = ref(false)

  let audioContext: AudioContext | null = null
  let masterGain: GainNode | null = null
  const voices: Map<OrbitType, Voice> = new Map()

  // Base frequencies for each orbit type (bigger orbit = deeper note)
  const FREQUENCIES: Record<OrbitType, number> = {
    'LEO': 440,   // A4
    'MEO': 220,   // A3
    'GEO': 110,   // A2
    'HEO': 55,    // A1
    'ESCAPE': 27.5 // A0
  }

  // LFO frequencies (Hz) roughly matching orbital periods in 1min=1yr simulation
  // LEO (~1.5h period) -> ~1.5 Hz
  // GEO (~24h period) -> ~0.1 Hz
  const LFO_RATES: Record<OrbitType, number> = {
    'LEO': 1.5,
    'MEO': 0.5,
    'GEO': 0.1,
    'HEO': 0.2, // Elliptical, average
    'ESCAPE': 0.05 // Very slow
  }

  function initAudio() {
    if (audioContext || typeof window === 'undefined') return

    audioContext = new AudioContext()
    masterGain = audioContext.createGain()
    masterGain.gain.value = volume.value
    masterGain.connect(audioContext.destination)

    // Create voices for each orbit type
    ORBIT_TYPES.forEach(type => {
      if (!audioContext) return

      const osc = audioContext.createOscillator()
      const lfo = audioContext.createOscillator()
      const lfoGain = audioContext.createGain()
      const gain = audioContext.createGain()
      const filter = audioContext.createBiquadFilter()

      // Oscillator setup
      osc.type = type === 'LEO' ? 'sine' : (type === 'ESCAPE' ? 'sawtooth' : 'triangle')
      const baseFreq = FREQUENCIES[type]
      osc.frequency.value = baseFreq

      // LFO Setup (FM Synthesis for Doppler/Orbit effect)
      lfo.type = 'sine'
      lfo.frequency.value = LFO_RATES[type]
      // LFO Depth (how much pitch wobble)
      // LEO needs more wobble (faster relative motion)
      const wobbleDepth = baseFreq * 0.03 // +/- 3% pitch shift
      lfoGain.gain.value = wobbleDepth

      lfo.connect(lfoGain)
      lfoGain.connect(osc.frequency)

      // Filter setup to soften the brighter waveforms
      filter.type = 'lowpass'
      filter.frequency.value = baseFreq * 4
      filter.Q.value = 1

      // Gain setup (start silent)
      gain.gain.value = 0

      // Connect graph
      osc.connect(filter)
      filter.connect(gain)
      gain.connect(masterGain!)

      osc.start()
      lfo.start()

      voices.set(type, {
        oscillator: osc,
        lfo,
        lfoGain,
        gain,
        filter,
        baseFreq,
        type
      })
    })

    isAudioInitialized.value = true
  }

  function updateSound() {
    if (!audioContext || !isAudioInitialized.value || isMuted.value) return
    if (audioContext.state === 'suspended') {
      audioContext.resume()
    }

    const satellites = activeSatellites.value
    const camera = getCamera()
    
    // reset counts and inclination accumulator
    const counts: Record<OrbitType, number> = {
      LEO: 0, MEO: 0, GEO: 0, HEO: 0, ESCAPE: 0
    }
    const incSums: Record<OrbitType, number> = {
      LEO: 0, MEO: 0, GEO: 0, HEO: 0, ESCAPE: 0
    }
    
    // Tally up satellites
    satellites.forEach(sat => {
      // Assuming 'orbitType' is populated on ActiveSatellite (it is in types.ts)
      if (counts[sat.orbitType] !== undefined) {
        counts[sat.orbitType]++
        incSums[sat.orbitType] += sat.inc || 0
      }
    })

    // Update each voice
    const maxSatellites = Math.max(1, satellites.length)
    const cameraPos = camera.position
    const distToCenter = cameraPos.length() // Distance from center of earth (0,0,0)

    voices.forEach((voice, type) => {
      const count = counts[type]
      if (count === 0) {
        // Smooth fade out
        voice.gain.gain.setTargetAtTime(0, audioContext!.currentTime, 0.5)
        return
      }

      // Calculate Average Inclination
      const avgInc = incSums[type] / count
      // Map 0-90 degrees to a frequency offset factor (e.g., 0.9 to 1.1)
      // Higher inclination (polar) = slightly higher pitch/tension
      const incFactor = 1 + ((avgInc / 90) * 0.2 - 0.1) // +/- 10%
      
      const targetBaseFreq = voice.baseFreq * incFactor
      
      // Update oscillator frequency (base pitch)
      voice.oscillator.frequency.setTargetAtTime(targetBaseFreq, audioContext!.currentTime, 0.2)
      
      // Update LFO depth based on count? 
      // More satellites = more chaotic "swarm" sound -> higher LFO depth
      const activeWobble = (voice.baseFreq * 0.02) * (1 + Math.log(count+1)/5)
      voice.lfoGain.gain.setTargetAtTime(activeWobble, audioContext!.currentTime, 0.5)

      // Calculate desired volume based on count
      // Logarithmic scaling so 1 satellite makes sound, but 1000 isn't deafening
      const countFactor = Math.log(count + 1) / Math.log(maxSatellites + 1)
      
      // Distance attenuation
      // As camera moves away, global volume might drop, or balance changes?
      // For now, let's make the "Deeper" sounds more prominent when further away
      // and "Higher" sounds more prominent when close?
      // Or just simple distance attenuation for all?
      // Let's try: detailed sounds (LEO) fade out when far. Deep sounds (GEO) stay.
      
      let distanceFactor = 1.0
      if (type === 'LEO') {
        // LEO fades out quickly as you zoom out (radius is ~1 earth radius)
        // Camera starts at z=25. Earth radius = 1.
        distanceFactor = Math.max(0, 1 - (distToCenter - 5) / 20)
      } else if (type === 'GEO') {
        // GEO (radius ~6.6) stays audible longer
        distanceFactor = Math.max(0.2, 1 - (distToCenter - 10) / 40)
      } else {
        distanceFactor = 0.8 // Others are consistent
      }

      const targetGain = Math.min(0.8, countFactor * distanceFactor * 0.5)

      voice.gain.gain.setTargetAtTime(targetGain, audioContext!.currentTime, 0.2)
      
      // Slight detune for chorus effect based on count
      // More satellites = more "wobbly" / thick sound
      const detuneAmount = Math.min(count, 50) 
      voice.oscillator.detune.setTargetAtTime(detuneAmount, audioContext!.currentTime, 0.1)
    })
  }

  // Animation loop for sound updates
  let animationFrame: number
  function loop() {
    if (isPlaying.value) {
      updateSound()
    } else {
      // Fade out if paused
      voices.forEach(v => {
        if(audioContext) {
           v.gain.gain.setTargetAtTime(0, audioContext.currentTime, 0.5)
        }
      })
    }
    animationFrame = requestAnimationFrame(loop)
  }

  // Watch playback state
  watch(isPlaying, (playing) => {
    if (playing && !audioContext) {
      initAudio()
    }
  })

  // Watch volume
  watch(volume, (v) => {
    if (masterGain) {
      masterGain.gain.setTargetAtTime(v, audioContext!.currentTime, 0.1)
    }
  })

  // Watch mute
  watch(isMuted, (muted) => {
    if (masterGain && audioContext) {
      const target = muted ? 0 : volume.value
      masterGain.gain.setTargetAtTime(target, audioContext.currentTime, 0.1)
    }
  })
  
  // Start the loop
  loop()

  onUnmounted(() => {
    cancelAnimationFrame(animationFrame)
    if (audioContext) {
      audioContext.close()
    }
  })

  function toggleMute() {
    isMuted.value = !isMuted.value
  }

  function setVolume(v: number) {
    volume.value = Math.max(0, Math.min(1, v))
  }
  
  function resumeAudioContext() {
    if (audioContext?.state === 'suspended') {
      audioContext.resume()
    } else if (!audioContext && isPlaying.value) {
        initAudio()
    }
  }

  return {
    isMuted,
    volume,
    toggleMute,
    setVolume,
    resumeAudioContext
  }
}
