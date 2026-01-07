import { ref, watch, onUnmounted, type Ref } from 'vue'
import type { ActiveSatellite } from '../types'
import * as THREE from 'three'

// Orbit types from types.ts: 'LEO' | 'MEO' | 'GEO' | 'HEO' | 'ESCAPE'
const ORBIT_TYPES = ['LEO', 'MEO', 'GEO', 'HEO', 'ESCAPE'] as const
type OrbitType = typeof ORBIT_TYPES[number]

interface Voice {
  oscillator: OscillatorNode
  subOscillator?: OscillatorNode // -1 Octave
  subOscillator2?: OscillatorNode // -2 Octaves (Deep Bass)
  lfo: OscillatorNode
  lfoGain: GainNode
  filterLfo?: OscillatorNode // Slow filter sweep for texture
  filterLfoGain?: GainNode
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
      // LEO changed to triangle so we can filter it for timbre changes
      osc.type = type === 'LEO' ? 'triangle' : (type === 'ESCAPE' ? 'sawtooth' : 'triangle')
      const baseFreq = FREQUENCIES[type]
      osc.frequency.value = baseFreq

      // LFO Setup (FM Synthesis for Doppler/Orbit effect)
      lfo.type = 'sine'
      lfo.frequency.value = LFO_RATES[type]
      // LFO Depth (how much pitch wobble)
      const wobbleDepth = baseFreq * 0.03 // +/- 3% pitch shift
      lfoGain.gain.value = wobbleDepth

      lfo.connect(lfoGain)
      lfoGain.connect(osc.frequency)

      // Filter setup
      filter.type = 'lowpass'
      // Start closed-ish; we'll open it based on inclination
      filter.frequency.value = baseFreq * 2
      filter.Q.value = 1

      // Gain setup (start silent)
      gain.gain.value = 0

      // Connect graph
      osc.connect(filter)
      filter.connect(gain)
      gain.connect(masterGain!)

      osc.start()
      lfo.start()

      const voice: Voice = {
        oscillator: osc,
        lfo,
        lfoGain,
        gain,
        filter,
        baseFreq,
        type
      }

      // Add Sub-Oscillators for deep orbits (GEO, HEO, ESCAPE) for richness
      if (['GEO', 'HEO', 'ESCAPE'].includes(type)) {
        // Sub 1: -1 Octave
        const subOsc = audioContext.createOscillator()
        subOsc.type = 'sine'
        subOsc.frequency.value = baseFreq * 0.5
        
        const subGain = audioContext.createGain()
        subGain.gain.value = 0.7 // Mix level
        
        subOsc.connect(subGain)
        subGain.connect(gain)
        subOsc.start()
        voice.subOscillator = subOsc

        // Sub 2: -2 Octaves (The "Real Bass")
        const subOsc2 = audioContext.createOscillator()
        subOsc2.type = 'sine'
        subOsc2.frequency.value = baseFreq * 0.25
        
        const subGain2 = audioContext.createGain()
        subGain2.gain.value = 0.8 // Heavy mix
        
        subOsc2.connect(subGain2)
        subGain2.connect(gain)
        subOsc2.start()
        voice.subOscillator2 = subOsc2

        // Filter Sweep LFO: Slow "Harmonic Waves"
        const filterLfo = audioContext.createOscillator()
        filterLfo.type = 'sine'
        filterLfo.frequency.value = 0.15 // Very slow breathing (approx 7s period)
        
        const filterLfoGain = audioContext.createGain()
        filterLfoGain.gain.value = baseFreq * 2 // Sweep range
        
        filterLfo.connect(filterLfoGain)
        filterLfoGain.connect(filter.frequency)
        filterLfo.start()
        
        voice.filterLfo = filterLfo
        voice.filterLfoGain = filterLfoGain
      }

      voices.set(type, voice)
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
      const incFactor = 1 + ((avgInc / 90) * 0.2 - 0.1) // +/- 10%
      
      const targetBaseFreq = voice.baseFreq * incFactor
      
      // Update oscillator frequencies
      voice.oscillator.frequency.setTargetAtTime(targetBaseFreq, audioContext!.currentTime, 0.2)
      if (voice.subOscillator) {
        voice.subOscillator.frequency.setTargetAtTime(targetBaseFreq * 0.5, audioContext!.currentTime, 0.2)
      }
      if (voice.subOscillator2) {
        voice.subOscillator2.frequency.setTargetAtTime(targetBaseFreq * 0.25, audioContext!.currentTime, 0.2)
      }

      // TIMBRE MODULATION (Inclination)
      // For LEO/MEO: High inclination = Brighter/Buzzer sound (Filter Open)
      // Low inclination = Mellow/Dark sound (Filter Closed)
      if (['LEO', 'MEO'].includes(type)) {
         // Map inc (0-90) to multiplier (1x to 8x harmonics)
         const brightness = 1.5 + (avgInc / 90) * 6
         voice.filter.frequency.setTargetAtTime(targetBaseFreq * brightness, audioContext!.currentTime, 0.2)
         // Also bump Q slightly for more character at high inc
         voice.filter.Q.setTargetAtTime(1 + (avgInc/90) * 2, audioContext!.currentTime, 0.2)
      }
      
      // For Deep Orbits: Update Filter Sweep Intensity?
      if (voice.filterLfoGain) {
          // More satellites = wider filter sweep
          voice.filterLfoGain.gain.setTargetAtTime(targetBaseFreq * (1 + Math.log(count+1)), audioContext!.currentTime, 0.5)
      }

      // Update LFO depth
      // Reduced wobble to avoid "sireny" sound (was 0.02 base)
      const activeWobble = (voice.baseFreq * 0.005) * (1 + Math.log(count+1)/5)
      voice.lfoGain.gain.setTargetAtTime(activeWobble, audioContext!.currentTime, 0.5)

      // Calculate desired volume
      const countFactor = Math.log(count + 1) / Math.log(maxSatellites + 1)
      
      // Distance attenuation
      let distanceFactor = 1.0
      if (type === 'LEO') {
        distanceFactor = Math.max(0, 1 - (distToCenter - 5) / 20)
      } else if (type === 'GEO') {
        distanceFactor = Math.max(0.2, 1 - (distToCenter - 10) / 40)
      } else {
        distanceFactor = 0.8
      }

      // Boost volume for deep orbits ("louder on the low end")
      // Increased from 1.5 to 3.0 to compensate for lower satellite counts
      const deepOrbitBoost = ['GEO', 'HEO', 'ESCAPE'].includes(type) ? 3.0 : 1.0

      const targetGain = Math.min(0.8, countFactor * distanceFactor * 0.5 * deepOrbitBoost)

      voice.gain.gain.setTargetAtTime(targetGain, audioContext!.currentTime, 0.2)
      
      // Detune
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
