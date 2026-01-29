import { useState, useEffect, useRef, useCallback } from 'react'

export function useMetronome(initialBpm: number = 100) {
    const [isPlaying, setIsPlaying] = useState(false)
    const [bpm, setBpm] = useState(initialBpm)
    const [isBeat, setIsBeat] = useState(false) // State for visual blink

    const intervalRef = useRef<NodeJS.Timeout | null>(null)
    const blinkTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    // Stop on unmount
    useEffect(() => {
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current)
            if (blinkTimeoutRef.current) clearTimeout(blinkTimeoutRef.current)
        }
    }, [])

    const stop = useCallback(() => {
        setIsPlaying(false)
        setIsBeat(false)
        if (intervalRef.current) clearInterval(intervalRef.current)
        if (blinkTimeoutRef.current) clearTimeout(blinkTimeoutRef.current)
        intervalRef.current = null
    }, [])

    const start = useCallback(() => {
        if (intervalRef.current) clearInterval(intervalRef.current)

        setIsPlaying(true)

        // Initial beat
        setIsBeat(true)
        if (blinkTimeoutRef.current) clearTimeout(blinkTimeoutRef.current)
        blinkTimeoutRef.current = setTimeout(() => setIsBeat(false), 100)

        const intervalMs = 60000 / bpm

        intervalRef.current = setInterval(() => {
            setIsBeat(true)
            if (blinkTimeoutRef.current) clearTimeout(blinkTimeoutRef.current)
            blinkTimeoutRef.current = setTimeout(() => setIsBeat(false), 100)
        }, intervalMs)
    }, [bpm])

    const togglePlay = useCallback(() => {
        if (isPlaying) {
            stop()
        } else {
            start()
        }
    }, [isPlaying, start, stop])

    // Update interval if BPM changes while playing
    useEffect(() => {
        if (isPlaying) {
            start()
        }
    }, [bpm, isPlaying, start])

    return {
        isPlaying,
        currentBpm: bpm,
        setCurrentBpm: setBpm,
        togglePlay,
        isBeat
    }
}
