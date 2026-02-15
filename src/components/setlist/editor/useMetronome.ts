import { useState, useRef, useCallback } from "react"

/**
 * Visual metronome blink hook for track BPM preview.
 * Blinks a visual indicator at the given BPM, auto-stops after 10s.
 */
export function useMetronome(bpm?: number) {
    const [isBlinking, setIsBlinking] = useState(false)
    const [blinkState, setBlinkState] = useState(false)
    const blinkIntervalRef = useRef<NodeJS.Timeout | null>(null)
    const blinkTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    const toggle = useCallback((e: React.MouseEvent) => {
        e.stopPropagation()
        if (!bpm) return

        if (isBlinking) {
            // Stop
            setIsBlinking(false)
            setBlinkState(false)
            if (blinkIntervalRef.current) clearInterval(blinkIntervalRef.current)
            if (blinkTimeoutRef.current) clearTimeout(blinkTimeoutRef.current)
        } else {
            // Start
            setIsBlinking(true)
            const intervalMs = 60000 / bpm

            setBlinkState(true) // Immediate flash
            setTimeout(() => setBlinkState(false), 100)

            blinkIntervalRef.current = setInterval(() => {
                setBlinkState(true)
                setTimeout(() => setBlinkState(false), 100)
            }, intervalMs)

            // Auto-stop after 10s
            blinkTimeoutRef.current = setTimeout(() => {
                setIsBlinking(false)
                setBlinkState(false)
                if (blinkIntervalRef.current) clearInterval(blinkIntervalRef.current)
            }, 10000)
        }
    }, [bpm, isBlinking])

    return { isBlinking, blinkState, toggle }
}
