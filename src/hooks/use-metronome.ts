import { useState, useEffect, useRef, useCallback } from 'react'

export function useMetronome(bpm: number = 100) {
    const [isPlaying, setIsPlaying] = useState(false)
    const [currentBpm, setCurrentBpm] = useState(bpm)

    // Web Audio API refs
    const audioContext = useRef<AudioContext | null>(null)
    const nextNoteTime = useRef(0)
    const timerID = useRef<number | null>(null)
    const lookahead = 25.0 // How frequently to call scheduling function (in milliseconds)
    const scheduleAheadTime = 0.1 // How far ahead to schedule audio (sec)

    // Update internal BPM when prop changes, but only if not deliberately overridden?
    // For now, let's keep them in sync
    useEffect(() => {
        setCurrentBpm(bpm)
    }, [bpm])

    const nextNote = useCallback(() => {
        const secondsPerBeat = 60.0 / currentBpm
        nextNoteTime.current += secondsPerBeat
    }, [currentBpm])

    const playClick = useCallback((time: number) => {
        if (!audioContext.current) return

        const osc = audioContext.current.createOscillator()
        const envelope = audioContext.current.createGain()

        osc.frequency.value = 1000
        envelope.gain.value = 1
        envelope.gain.exponentialRampToValueAtTime(1, time + 0.001)
        envelope.gain.exponentialRampToValueAtTime(0.001, time + 0.02)

        osc.connect(envelope)
        envelope.connect(audioContext.current.destination)

        osc.start(time)
        osc.stop(time + 0.03)
    }, [])

    const scheduler = useCallback(() => {
        // while there are notes that will need to play before the next interval,
        // schedule them and advance the pointer.
        while (nextNoteTime.current < audioContext.current!.currentTime + scheduleAheadTime) {
            playClick(nextNoteTime.current)
            nextNote()
        }
        timerID.current = window.setTimeout(scheduler, lookahead)
    }, [nextNote, playClick])

    const togglePlay = useCallback(() => {
        if (isPlaying) {
            // Stop
            if (timerID.current) window.clearTimeout(timerID.current)
            setIsPlaying(false)
            return
        }

        // Start
        if (!audioContext.current) {
            audioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)()
        }

        // Resume if suspended (browser autopilot policy)
        if (audioContext.current.state === 'suspended') {
            audioContext.current.resume()
        }

        setIsPlaying(true)
        nextNoteTime.current = audioContext.current.currentTime + 0.05
        scheduler()
    }, [isPlaying, scheduler])

    // Cleanup
    useEffect(() => {
        return () => {
            if (timerID.current) window.clearTimeout(timerID.current)
            // We usually don't close AudioContext to reuse it, but pausing is fine
        }
    }, [])

    return {
        isPlaying,
        togglePlay,
        currentBpm,
        setCurrentBpm
    }
}
