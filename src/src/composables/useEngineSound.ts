import { ref, watch, type Ref, type ComputedRef } from 'vue'
import type { EngineMetadata } from './useEngines'

// Matches ActiveFlare from EnginesView
interface ActiveFlare {
    launchKey: string
    name: string
    count: number
}

export function useEngineSound(
    coreFlares: ComputedRef<ActiveFlare[]>,
    secondFlares: ComputedRef<ActiveFlare[]>,
    upperFlares: ComputedRef<ActiveFlare[]>,
    engineMetadata: Ref<Map<string, EngineMetadata>>,
    isPlaying: Ref<boolean>
) {
    const isMuted = ref(false)
    const volume = ref(0.5)

    let audioContext: AudioContext | null = null
    const seenFlares = new Set<string>()

    function getAudioContext(): AudioContext {
        if (!audioContext) {
            audioContext = new AudioContext()
        }
        return audioContext
    }

    // Get thrust for an engine, with defaults for unknown engines
    function getThrust(engineName: string): number {
        const meta = engineMetadata.value.get(engineName)
        return meta?.engine_thrust || 500 // Default to 500 kN if unknown
    }

    /**
     * Play engine firing sound
     * - thrust: kN (affects frequency and volume - bigger = deeper & louder)
     * - stage: 0-1 core, 2 second, 3+ upper (affects harmonic base)
     * - count: number of engines (affects chorus/layering)
     */
    function playEngineRoar(thrust: number, stage: number, count: number) {
        if (isMuted.value) return

        const ctx = getAudioContext()
        const now = ctx.currentTime

        // Normalize thrust (10-2500 kN typical range) to 0-1
        const normalizedThrust = Math.min(Math.max(thrust, 10), 2500) / 2500

        // Stage-based harmonic offset (creates chord-like effect)
        // Core: root note, Second: 5th, Upper: octave
        const stageHarmonicMultiplier = stage <= 1 ? 1.0 : stage === 2 ? 1.5 : 2.0

        // Base frequency: high thrust = DEEP (low frequency)
        // Range: 400Hz (small) to 80Hz (massive like Raptor)
        const baseFreq = (350 - normalizedThrust * 270) / stageHarmonicMultiplier

        // Duration: bigger engines sustain longer
        const duration = 0.8 + normalizedThrust * 0.6 + count * 0.03

        // Volume: bigger = louder
        const gainLevel = (0.06 + normalizedThrust * 0.25) * volume.value

        // Count-based detune spread for chorus effect
        const detuneSpread = Math.min(count, 9) * 5 // cents

        // === NOISE LAYER (white noise filtered to roar) ===
        const bufferSize = ctx.sampleRate * duration
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
        const output = noiseBuffer.getChannelData(0)
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1
        }

        const noise = ctx.createBufferSource()
        noise.buffer = noiseBuffer

        // Low-pass for roar foundation
        const lowPass = ctx.createBiquadFilter()
        lowPass.type = 'lowpass'
        lowPass.frequency.setValueAtTime(baseFreq * 6, now)
        lowPass.frequency.exponentialRampToValueAtTime(baseFreq * 8, now + duration * 0.15)
        lowPass.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, now + duration)
        lowPass.Q.value = 0.7

        // High-pass to remove sub-bass mud
        const highPass = ctx.createBiquadFilter()
        highPass.type = 'highpass'
        highPass.frequency.value = 25

        // Resonant peak for "roar" character
        const peakFilter = ctx.createBiquadFilter()
        peakFilter.type = 'peaking'
        peakFilter.frequency.setValueAtTime(baseFreq * 2, now)
        peakFilter.frequency.exponentialRampToValueAtTime(baseFreq * 4, now + duration * 0.2)
        peakFilter.frequency.exponentialRampToValueAtTime(baseFreq, now + duration)
        peakFilter.Q.value = 1.8
        peakFilter.gain.value = 10

        // Envelope
        const noiseGain = ctx.createGain()
        noiseGain.gain.setValueAtTime(0, now)
        noiseGain.gain.linearRampToValueAtTime(gainLevel * 0.7, now + 0.015)
        noiseGain.gain.setValueAtTime(gainLevel * 0.7, now + duration * 0.35)
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration)

        noise.connect(highPass)
        highPass.connect(lowPass)
        lowPass.connect(peakFilter)
        peakFilter.connect(noiseGain)
        noiseGain.connect(ctx.destination)

        noise.start(now)
        noise.stop(now + duration)

        // === RUMBLE LAYER (low oscillator for big engines) ===
        if (normalizedThrust > 0.2) {
            const rumble = ctx.createOscillator()
            rumble.type = 'sawtooth'
            rumble.frequency.setValueAtTime(35 + normalizedThrust * 30, now)
            rumble.detune.value = detuneSpread
            rumble.frequency.exponentialRampToValueAtTime(20, now + duration * 0.7)

            const rumbleGain = ctx.createGain()
            const rumbleLevel = (0.04 + normalizedThrust * 0.18) * volume.value
            rumbleGain.gain.setValueAtTime(0, now)
            rumbleGain.gain.linearRampToValueAtTime(rumbleLevel, now + 0.02)
            rumbleGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.6)

            const rumbleFilter = ctx.createBiquadFilter()
            rumbleFilter.type = 'lowpass'
            rumbleFilter.frequency.value = 90

            rumble.connect(rumbleFilter)
            rumbleFilter.connect(rumbleGain)
            rumbleGain.connect(ctx.destination)

            rumble.start(now)
            rumble.stop(now + duration)
        }

        // === SUB-BASS THUMP for MASSIVE engines (Starship etc) ===
        if (normalizedThrust > 0.7) {  // > ~1750 kN
            const thump = ctx.createOscillator()
            thump.type = 'sine'
            thump.frequency.setValueAtTime(50, now)
            thump.frequency.exponentialRampToValueAtTime(25, now + 0.3)

            const thumpGain = ctx.createGain()
            const thumpLevel = (normalizedThrust - 0.7) * 0.5 * volume.value
            thumpGain.gain.setValueAtTime(thumpLevel, now)
            thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35)

            thump.connect(thumpGain)
            thumpGain.connect(ctx.destination)

            thump.start(now)
            thump.stop(now + 0.4)
        }
    }

    // Process new flares for a given stage
    function processFlares(flares: ActiveFlare[], stageNum: number) {
        for (const flare of flares) {
            if (!seenFlares.has(flare.launchKey)) {
                seenFlares.add(flare.launchKey)
                const thrust = getThrust(flare.name)
                // Multiply thrust by count for total stage thrust effect
                const totalThrust = thrust * Math.min(flare.count, 9)
                playEngineRoar(totalThrust, stageNum, flare.count)
            }
        }
    }

    // Watch for new flares on each stage
    watch(coreFlares, (flares) => {
        if (!isPlaying.value) return
        processFlares(flares, 1)
    }, { deep: true })

    watch(secondFlares, (flares) => {
        if (!isPlaying.value) return
        processFlares(flares, 2)
    }, { deep: true })

    watch(upperFlares, (flares) => {
        if (!isPlaying.value) return
        processFlares(flares, 3)
    }, { deep: true })

    function resetSeenFlares() {
        seenFlares.clear()
    }

    function toggleMute() {
        isMuted.value = !isMuted.value
    }

    function setVolume(v: number) {
        volume.value = Math.max(0, Math.min(1, v))
    }

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
        resetSeenFlares,
        resumeAudioContext
    }
}
