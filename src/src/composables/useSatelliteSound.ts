import { ref, watch, onUnmounted, type Ref } from 'vue'
import type { ActiveSatellite } from '../types'
import * as THREE from 'three'

// Orbit types from types.ts
const ORBIT_TYPES = ['LEO', 'MEO', 'GEO', 'HEO', 'ESCAPE'] as const
type OrbitType = typeof ORBIT_TYPES[number]

// Expanded Voice Keys to include LEO altitude bands and MEO buckets
// LEO split by altitude: LOW (<700km), MID (700-1200km), HIGH (>1200km)
const VOICE_KEYS = [
  'LEO_LOW', 'LEO_MID', 'LEO_HIGH',
  'MEO_EQ', 'MEO_MID', 'MEO_POLAR',
  'GEO', 'HEO', 'ESCAPE'
] as const
type VoiceKey = typeof VOICE_KEYS[number]

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
  key: VoiceKey
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
  const voices: Map<VoiceKey, Voice> = new Map()

  // Base Frequencies (Root Note A)
  // LEO voices will form a Major Triad (singing chord)
  const BASE_FREQS: Record<OrbitType, number> = {
    'LEO': 440,   // A4 Base
    'MEO': 220,   // A3
    'GEO': 110,   // A2
    'HEO': 55,    // A1
    'ESCAPE': 27.5 // A0
  }

  // Helper to map satellite to VoiceKey
  function getVoiceKey(sat: ActiveSatellite): VoiceKey {
    if (sat.orbitType === 'LEO') {
      const alt = (sat.perigee + sat.apogee) / 2
      if (alt < 700) return 'LEO_LOW'   // Starlink, ISS
      if (alt < 1200) return 'LEO_MID'  // Iridium
      return 'LEO_HIGH'                 // OneWeb, etc
    }
    
    // MEO split by inclination
    if (sat.orbitType === 'MEO') {
      const inc = sat.inc || 0
      if (inc < 30) return 'MEO_EQ'
      if (inc < 60) return 'MEO_MID'
      return 'MEO_POLAR'
    }

    return sat.orbitType as VoiceKey
  }

  function initAudio() {
    if (audioContext || typeof window === 'undefined') return

    audioContext = new AudioContext()
    masterGain = audioContext.createGain()
    masterGain.gain.value = volume.value
    masterGain.connect(audioContext.destination)

    // Initialize all voices
    VOICE_KEYS.forEach(key => {
      if (!audioContext) return

      let orbitType: OrbitType
      let subType: string | null = null

      if (key.startsWith('LEO')) {
        orbitType = 'LEO'
        subType = key.split('_')[1]
      } else if (key.startsWith('MEO')) {
        orbitType = 'MEO'
        subType = key.split('_')[1]
      } else {
        orbitType = key as OrbitType
      }

      let baseFreq = BASE_FREQS[orbitType]

      // OSCILLATOR SETUP
      const osc = audioContext.createOscillator()
      
      // Waveform & Pitch Customization
      if (orbitType === 'LEO') {
        // "Sweet high pitched singing" -> Sine waves forming a chord
        osc.type = 'sine'
        if (subType === 'LOW') baseFreq = 440 // A4
        if (subType === 'MID') baseFreq = 554.37 // C#5 (Major 3rd)
        if (subType === 'HIGH') baseFreq = 659.25 // E5 (Perfect 5th)
      } else if (subType === 'EQ') {
        osc.type = 'sine'
      } else if (subType === 'POLAR') {
        osc.type = 'sine'
      } else {
        osc.type = 'sine'
      }
      
      osc.frequency.value = baseFreq

      // LFO SETUP (Vibrato/Doppler)
      const lfo = audioContext.createOscillator()
      lfo.type = 'sine'
      const lfoGain = audioContext.createGain()
      
      // LFO Rate
      if (orbitType === 'LEO') {
        // Gentle vibrato for singing
        lfo.frequency.value = 4.0 
      } else if (orbitType === 'GEO') {
        lfo.frequency.value = 0.1
      } else {
        lfo.frequency.value = 0.5
      }

      // LFO Depth (Wobble)
      const wobbleDepth = baseFreq * (orbitType === 'LEO' ? 0.015 : 0.005)
      lfoGain.gain.value = wobbleDepth
      
      lfo.connect(lfoGain)
      lfoGain.connect(osc.frequency)

      // FILTER SETUP
      const filter = audioContext.createBiquadFilter()
      filter.type = 'lowpass'
      
      if (orbitType === 'LEO') {
        // Pure tone, let it through
        filter.frequency.value = baseFreq * 4
        filter.Q.value = 0.5
      } else if (subType === 'EQ') {
        filter.frequency.value = baseFreq * 2 // Darker
        filter.Q.value = 0.5
      } else if (subType === 'POLAR') {
        filter.frequency.value = baseFreq * 8 // Open, bright
        filter.Q.value = 2 // Resonant
      } else {
        filter.frequency.value = baseFreq * 4 // Neutral
        filter.Q.value = 1
      }

      // GAIN
      const gain = audioContext.createGain()
      gain.gain.value = 0

      // CONNECT GRAPH
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
        key
      }

      // SUB-OSCILLATORS & HARMONIC WAVES (Deep Orbits)
      if (['GEO', 'HEO', 'ESCAPE'].includes(key)) {
        // Sub 1 (-1 Octave)
        const sub1 = audioContext.createOscillator()
        sub1.type = 'sine'
        sub1.frequency.value = baseFreq * 0.5
        const sub1Gain = audioContext.createGain()
        sub1Gain.gain.value = 0.7
        sub1.connect(sub1Gain)
        sub1Gain.connect(gain)
        sub1.start()
        voice.subOscillator = sub1

        // Sub 2 (-2 Octaves)
        const sub2 = audioContext.createOscillator()
        sub2.type = 'sine'
        sub2.frequency.value = baseFreq * 0.25
        const sub2Gain = audioContext.createGain()
        sub2Gain.gain.value = 0.8
        sub2.connect(sub2Gain)
        sub2Gain.connect(gain)
        sub2.start()
        voice.subOscillator2 = sub2

        // Filter LFO (Harmonic Waves)
        const fLfo = audioContext.createOscillator()
        fLfo.type = 'sine'
        fLfo.frequency.value = 0.28 // ~3.5s period
        const fLfoGain = audioContext.createGain()
        fLfoGain.gain.value = baseFreq * 2
        fLfo.connect(fLfoGain)
        fLfoGain.connect(filter.frequency)
        fLfo.start()
        voice.filterLfo = fLfo
        voice.filterLfoGain = fLfoGain
      }

      voices.set(key, voice)
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
    const maxSatellites = Math.max(1, satellites.length)
    const cameraPos = camera.position
    const distToCenter = cameraPos.length()

    // 1. Reset Counts
    const counts: Record<VoiceKey, number> = {} as any
    VOICE_KEYS.forEach(k => counts[k] = 0)

    // 2. Tally Satellites into Buckets
    satellites.forEach(sat => {
      const key = getVoiceKey(sat)
      counts[key]++
    })

    // 3. Update Voices
    voices.forEach((voice, key) => {
      const count = counts[key]
      
      if (count === 0) {
        voice.gain.gain.setTargetAtTime(0, audioContext!.currentTime, 0.5)
        return
      }

      // Count Factor (Logarithmic)
      const countFactor = Math.log(count + 1) / Math.log(maxSatellites + 1)

      // Distance Attenuation
      let distanceFactor = 1.0
      if (key.startsWith('LEO')) {
        // LEO floor of 0.1 at 25 units
        distanceFactor = Math.max(0.1, 1 - (distToCenter - 5) / 25)
      } else if (key === 'GEO') {
        distanceFactor = Math.max(0.2, 1 - (distToCenter - 10) / 40)
      } else {
        distanceFactor = 0.8
      }

      // Boosts / Deweighting
      let boost = 1.0
      
      // Deep orbit boost
      if (['GEO', 'HEO', 'ESCAPE'].includes(key)) boost *= 3.0
      
      // LEO Deweighting (Significant reduction)
      if (key.startsWith('LEO')) {
        boost *= 0.5 // Reduced from 1.0 to 0.2 to handle massive counts
      }

      // Polar boost
      if (key.includes('POLAR')) boost *= 1.2
      // EQ dampening
      if (key.includes('EQ')) boost *= 0.8

      const targetGain = Math.min(0.8, countFactor * distanceFactor * 0.5 * boost)
      voice.gain.gain.setTargetAtTime(targetGain, audioContext!.currentTime, 0.2)

      // Dynamic LFO Depth based on density
      // For singing LEO, keep it more constant vibrato
      if (key.startsWith('LEO')) {
        // Subtle increase in vibrato depth with count
         voice.lfoGain.gain.setTargetAtTime(voice.baseFreq * 0.015 * (1 + Math.log(count+1)/10), audioContext!.currentTime, 0.5)
      } else {
        const activeWobble = (voice.baseFreq * 0.005) * (1 + Math.log(count + 1) / 5)
        voice.lfoGain.gain.setTargetAtTime(activeWobble, audioContext!.currentTime, 0.5)
      }
      
      // Filter LFO Intensity (Deep Orbits)
      if (voice.filterLfoGain) {
         voice.filterLfoGain.gain.setTargetAtTime(voice.baseFreq * (1 + Math.log(count+1)), audioContext!.currentTime, 0.5)
      }
      
      // Detune (Chorus)
      const detuneAmount = Math.min(count, 50)
      voice.oscillator.detune.setTargetAtTime(detuneAmount, audioContext!.currentTime, 0.1)
    })
  }

  let animationFrame: number
  function loop() {
    if (isPlaying.value) {
      updateSound()
    } else {
      voices.forEach(v => {
        if(audioContext) {
           v.gain.gain.setTargetAtTime(0, audioContext.currentTime, 0.5)
        }
      })
    }
    animationFrame = requestAnimationFrame(loop)
  }

  watch(isPlaying, (playing) => {
    if (playing && !audioContext) initAudio()
  })

  watch(volume, (v) => {
    if (masterGain) masterGain.gain.setTargetAtTime(v, audioContext!.currentTime, 0.1)
  })

  watch(isMuted, (muted) => {
    if (masterGain && audioContext) {
      masterGain.gain.setTargetAtTime(muted ? 0 : volume.value, audioContext.currentTime, 0.1)
    }
  })
  
  loop()

  onUnmounted(() => {
    cancelAnimationFrame(animationFrame)
    if (audioContext) audioContext.close()
  })

  function toggleMute() { isMuted.value = !isMuted.value }
  function setVolume(v: number) { volume.value = Math.max(0, Math.min(1, v)) }
  
  function resumeAudioContext() {
    if (audioContext?.state === 'suspended') audioContext.resume()
    else if (!audioContext && isPlaying.value) initAudio()
  }

  return { isMuted, volume, toggleMute, setVolume, resumeAudioContext }
}
