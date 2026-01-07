import { ref, watch, onUnmounted, type Ref } from 'vue'
import type { ActiveSatellite } from '../types'
import * as THREE from 'three'

// Orbit types from types.ts
const ORBIT_TYPES = ['LEO', 'MEO', 'GEO', 'HEO', 'ESCAPE'] as const
type OrbitType = typeof ORBIT_TYPES[number]

// Expanded Voice Keys to include inclination buckets
const VOICE_KEYS = [
  'LEO_EQ', 'LEO_MID', 'LEO_POLAR',
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

  // Frequencies (Root Note A)
  const BASE_FREQS: Record<OrbitType, number> = {
    'LEO': 440,   // A4
    'MEO': 220,   // A3
    'GEO': 110,   // A2
    'HEO': 55,    // A1
    'ESCAPE': 27.5 // A0
  }

  // Helper to map satellite to VoiceKey
  function getVoiceKey(sat: ActiveSatellite): VoiceKey {
    const inc = sat.inc || 0
    if (sat.orbitType === 'LEO' || sat.orbitType === 'MEO') {
      if (inc < 30) return `${sat.orbitType}_EQ` as VoiceKey
      if (inc < 60) return `${sat.orbitType}_MID` as VoiceKey
      return `${sat.orbitType}_POLAR` as VoiceKey
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

      // Determine OrbitType from Key
      let orbitType: OrbitType
      let inclinationType: 'EQ' | 'MID' | 'POLAR' | null = null

      if (key.startsWith('LEO')) {
        orbitType = 'LEO'
        inclinationType = key.split('_')[1] as any
      } else if (key.startsWith('MEO')) {
        orbitType = 'MEO'
        inclinationType = key.split('_')[1] as any
      } else {
        orbitType = key as OrbitType
      }

      const baseFreq = BASE_FREQS[orbitType]

      // OSCILLATOR SETUP
      const osc = audioContext.createOscillator()
      
      // Waveform & Timbre Customization per Bucket
      if (inclinationType === 'EQ') {
        // Equatorial: Smooth, rounded, steady
        osc.type = 'sine'
      } else if (inclinationType === 'POLAR') {
        // Polar: Sharp, buzzy, urgent
        osc.type = 'sawtooth'
      } else {
        // Mid / Others: Balanced
        osc.type = 'triangle'
      }
      
      osc.frequency.value = baseFreq

      // LFO SETUP (Vibrato/Doppler)
      const lfo = audioContext.createOscillator()
      lfo.type = 'sine'
      const lfoGain = audioContext.createGain()
      
      // LFO Rate
      if (orbitType === 'LEO') {
        // Faster orbits
        if (inclinationType === 'POLAR') lfo.frequency.value = 2.0 // Fast flutter
        else if (inclinationType === 'EQ') lfo.frequency.value = 0.5 // Slow swell
        else lfo.frequency.value = 1.2
      } else if (orbitType === 'GEO') {
        lfo.frequency.value = 0.1
      } else {
        lfo.frequency.value = 0.5
      }

      // LFO Depth (Wobble)
      const wobbleDepth = baseFreq * 0.005
      lfoGain.gain.value = wobbleDepth
      
      lfo.connect(lfoGain)
      lfoGain.connect(osc.frequency)

      // FILTER SETUP
      const filter = audioContext.createBiquadFilter()
      filter.type = 'lowpass'
      
      // Filter Tone
      if (inclinationType === 'EQ') {
        filter.frequency.value = baseFreq * 2 // Darker
        filter.Q.value = 0.5
      } else if (inclinationType === 'POLAR') {
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
      // Note: We use global maxSatellites to normalize, so small buckets are quieter than big ones
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

      // Boosts
      let boost = 1.0
      // Deep orbit boost
      if (['GEO', 'HEO', 'ESCAPE'].includes(key)) boost *= 3.0
      // Polar boost (make them cut through)
      if (key.includes('POLAR')) boost *= 1.2
      // EQ dampening (keep it subtle)
      if (key.includes('EQ')) boost *= 0.8

      const targetGain = Math.min(0.8, countFactor * distanceFactor * 0.5 * boost)
      voice.gain.gain.setTargetAtTime(targetGain, audioContext!.currentTime, 0.2)

      // Dynamic LFO Depth based on density (more chaos with more sats)
      const activeWobble = (voice.baseFreq * 0.005) * (1 + Math.log(count + 1) / 5)
      voice.lfoGain.gain.setTargetAtTime(activeWobble, audioContext!.currentTime, 0.5)
      
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