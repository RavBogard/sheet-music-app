"use client"

import { toast } from "sonner"

import { useEffect, useRef, useState } from "react"
import { Mic, MicOff, Activity } from "lucide-react"
import { Button } from "@/components/ui/button"

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

// Helper: Auto-correlation for pitch detection
function autoCorrelate(buf: Float32Array, sampleRate: number) {
    // Implements the ACF2+ algorithm
    let size = buf.length
    let maxSamples = Math.floor(size / 2)
    let bestOffset = -1
    let bestCorrelation = 0
    let rms = 0
    let foundGoodCorrelation = false
    let correlations = new Array(maxSamples)

    for (let i = 0; i < size; i++) {
        let val = buf[i]
        rms += val * val
    }
    rms = Math.sqrt(rms / size)
    if (rms < 0.01) // not enough signal
        return -1

    let lastCorrelation = 1
    for (let offset = 0; offset < maxSamples; offset++) {
        let correlation = 0

        for (let i = 0; i < maxSamples; i++) {
            correlation += Math.abs((buf[i] - buf[i + offset]))
        }
        correlation = 1 - (correlation / maxSamples)
        correlations[offset] = correlation // store it, for the tweaking we need to do below.
        if ((correlation > 0.9) && (correlation > lastCorrelation)) {
            foundGoodCorrelation = true
            if (correlation > bestCorrelation) {
                bestCorrelation = correlation
                bestOffset = offset
            }
        } else if (foundGoodCorrelation) {
            // short-circuit - we found a good correlation, then a bad one, so we'd just see noise from here.
            // Pad a bit and stop.
            let shift = (correlations[bestOffset + 1] - correlations[bestOffset - 1]) / correlations[bestOffset]
            return sampleRate / (bestOffset + (8 * shift))
        }
        lastCorrelation = correlation
    }
    if (bestCorrelation > 0.01) {
        // console.log("f = " + sampleRate/bestOffset + "Hz (rms: " + rms + " confidence: " + bestCorrelation + ")")
        return sampleRate / bestOffset
    }
    return -1
}

export function Tuner() {
    const [active, setActive] = useState(false)
    const [note, setNote] = useState<string>("-")
    const [cents, setCents] = useState<number>(0)
    const [frequency, setFrequency] = useState<number>(0)

    const audioContextRef = useRef<AudioContext | null>(null)
    const analyserRef = useRef<AnalyserNode | null>(null)
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
    const rafRef = useRef<number | null>(null)

    const startTuner = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

            // Create Context
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
            audioContextRef.current = audioContext

            // Create Analyser
            const analyser = audioContext.createAnalyser()
            analyser.fftSize = 2048
            analyserRef.current = analyser

            // Connect Source
            const source = audioContext.createMediaStreamSource(stream)
            source.connect(analyser)
            sourceRef.current = source

            setActive(true)
            updatePitch()

        } catch (e) {
            console.error("Microphone access denied or error", e)
            toast.error("Could not access microphone for tuner")
        }
    }

    const stopTuner = () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current)
        if (sourceRef.current) sourceRef.current.disconnect()
        if (audioContextRef.current) audioContextRef.current.close()

        setActive(false)
        setNote("-")
        setCents(0)
        setFrequency(0)
    }

    const updatePitch = () => {
        if (!analyserRef.current || !audioContextRef.current) return

        const buf = new Float32Array(2048)
        analyserRef.current.getFloatTimeDomainData(buf)
        const ac = autoCorrelate(buf, audioContextRef.current.sampleRate)

        if (ac !== -1) {
            // Found a pitch
            const pitch = ac
            const noteNum = 12 * (Math.log(pitch / 440) / Math.log(2)) + 69
            const noteIndex = Math.round(noteNum)
            const capturedNote = NOTES[noteIndex % 12]

            // Calculate detune in cents
            const detune = Math.floor((noteNum - noteIndex) * 100)

            setNote(capturedNote)
            setCents(detune)
            setFrequency(Math.round(pitch))
        }

        rafRef.current = requestAnimationFrame(updatePitch)
    }

    // Strobe Animation Logic
    const strobeRef = useRef<HTMLDivElement>(null)
    const phaseRef = useRef(0)

    useEffect(() => {
        if (!active) return

        let animFrame: number

        const animate = () => {
            // Speed depends on how far off we are (cents)
            // If perfect (cents ~ 0), speed is 0.
            // If flat (cents < 0), move left.
            // If sharp (cents > 0), move right.
            // Scale factor: 0.5?
            const speed = cents * 0.15

            phaseRef.current += speed

            // Wrap phase to keep numbers small (0-100 pattern width)
            if (phaseRef.current > 50) phaseRef.current -= 50
            if (phaseRef.current < -50) phaseRef.current += 50

            if (strobeRef.current) {
                strobeRef.current.style.transform = `translateX(${phaseRef.current}px)`
            }
            animFrame = requestAnimationFrame(animate)
        }
        animFrame = requestAnimationFrame(animate)

        return () => cancelAnimationFrame(animFrame)
    }, [active, cents])

    useEffect(() => {
        return () => {
            stopTuner()
        }
    }, [])

    return (
        <div className="flex flex-col items-center gap-4 p-4 w-64">
            <div className="flex items-center justify-between w-full border-b border-zinc-800 pb-2">
                <span className="font-bold text-sm">Strobe Tuner</span>
                {active && <Activity className="h-4 w-4 text-green-500 animate-pulse" />}
            </div>

            {/* Strobe Disc / Window */}
            <div className="w-full h-32 bg-zinc-950 rounded-xl border border-zinc-800 relative overflow-hidden flex items-center justify-center">

                {/* The Moving Strobe Pattern */}
                <div
                    ref={strobeRef}
                    className={`absolute inset-0 flex items-center justify-center ${active ? 'opacity-100' : 'opacity-20'}`}
                    style={{
                        width: '200%', // Extra wide for sliding
                        left: '-50%',
                        // Checkered or Striped Pattern
                        backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 20px, rgba(34,197,94,0.2) 20px, rgba(34,197,94,0.2) 40px)'
                    }}
                >
                    {/* Overlay gradients for "tube" look? */}
                </div>

                {/* Center Target Indicator */}
                <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                    <div className="w-1 h-full bg-white/20" />
                </div>

                <div className="z-20 text-center relative">
                    {/* Note Name */}
                    <div className={`text-6xl font-black transition-colors duration-200 ${active && note !== "-"
                            ? (Math.abs(cents) < 5 ? 'text-green-400 drop-shadow-[0_0_15px_rgba(74,222,128,0.5)]' : 'text-white')
                            : 'text-zinc-700'
                        }`}>
                        {note}
                    </div>

                    {/* Cents / Hz */}
                    {active && note !== "-" && (
                        <div className="text-xs text-zinc-500 mt-2 font-mono bg-black/50 px-2 py-1 rounded">
                            {frequency} Hz
                            <span className={`ml-2 ${Math.abs(cents) < 5 ? 'text-green-400' : (cents > 0 ? 'text-blue-400' : 'text-orange-400')}`}>
                                {cents > 0 ? '+' : ''}{cents}c
                            </span>
                        </div>
                    )}
                </div>
            </div>

            <Button
                variant={active ? "destructive" : "default"}
                className="w-full gap-2"
                onClick={active ? stopTuner : startTuner}
            >
                {active ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                {active ? "Stop Tuner" : "Start Tuner"}
            </Button>

            <p className="text-[10px] text-zinc-500 text-center">
                Strobe moves LEFT if Flat, RIGHT if Sharp. <br /> Stop movement to tune.
            </p>
        </div>
    )
}
