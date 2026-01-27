"use client"

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
            alert("Could not access microphone for tuner")
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

    useEffect(() => {
        return () => {
            stopTuner()
        }
    }, [])

    return (
        <div className="flex flex-col items-center gap-4 p-4 w-64">
            <div className="flex items-center justify-between w-full border-b border-zinc-800 pb-2">
                <span className="font-bold text-sm">Chromatic Tuner</span>
                {active && <Activity className="h-4 w-4 text-green-500 animate-pulse" />}
            </div>

            <div className="flex flex-col items-center justify-center h-32 w-full bg-zinc-900 rounded-xl border border-zinc-800 relative overflow-hidden">
                {/* Visual Gauge */}
                <div className="absolute top-0 bottom-0 w-0.5 bg-zinc-700 left-1/2 z-0" /> {/* Center line */}

                {/* Moving Needle */}
                {active && note !== "-" && (
                    <div
                        className={`absolute top-2 bottom-2 w-1 rounded-full z-10 transition-all duration-100 ease-out ${Math.abs(cents) < 10 ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.8)]' : 'bg-red-500'}`}
                        style={{ left: `calc(50% + ${cents}px)` }} // Simple pixel offset for now
                    />
                )}

                <div className="z-20 text-center">
                    <div className={`text-5xl font-black ${Math.abs(cents) < 10 && active ? 'text-green-400' : 'text-white'}`}>
                        {note}
                    </div>
                    {active && note !== "-" && (
                        <div className="text-xs text-zinc-500 mt-1 font-mono">
                            {frequency} Hz
                            <span className="ml-2">({cents > 0 ? '+' : ''}{cents}c)</span>
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
                Microphone access required. optimized for Guitar/Voice.
            </p>
        </div>
    )
}
