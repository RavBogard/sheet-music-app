"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Hand } from "lucide-react"

interface TapTempoButtonProps {
    onBpmChange: (bpm: number) => void
    currentBpm?: number
}

export function TapTempoButton({ onBpmChange, currentBpm: _currentBpm }: TapTempoButtonProps) {
    const [_taps, setTaps] = useState<number[]>([])
    const [calculatedBpm, setCalculatedBpm] = useState<number | null>(null)
    const [tapCount, setTapCount] = useState(0)
    const [pulsing, setPulsing] = useState(false)
    const timeoutRef = useRef<NodeJS.Timeout | null>(null)

    const handleTap = (e: React.MouseEvent) => {
        e.preventDefault()
        const now = Date.now()

        // Visual pulse
        setPulsing(true)
        setTimeout(() => setPulsing(false), 150)

        setTaps(prev => {
            // Reset if it's been a while (2s) since last tap
            if (prev.length > 0 && now - prev[prev.length - 1] > 2000) {
                setTapCount(1)
                return [now]
            }

            const newTaps = [...prev, now]
            setTapCount(newTaps.length)

            // Need at least 2 taps to calculate
            if (newTaps.length >= 2) {
                // Calculate average interval
                const intervals = []
                for (let i = 1; i < newTaps.length; i++) {
                    intervals.push(newTaps[i] - newTaps[i - 1])
                }

                // Average interval in ms
                const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length

                // Convert to BPM
                const bpm = Math.round(60000 / avgInterval)

                // Constrain reasonable limits (30-300)
                const clampedBpm = Math.min(Math.max(bpm, 30), 300)

                setCalculatedBpm(clampedBpm)
                onBpmChange(clampedBpm)

                // Limit history to last 5 taps for responsiveness
                if (newTaps.length > 5) {
                    return newTaps.slice(newTaps.length - 5)
                }
            }
            return newTaps
        })

        // Visual feedback reset
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        timeoutRef.current = setTimeout(() => {
            setTaps([]) // Reset taps after inactivity
            setCalculatedBpm(null)
            setTapCount(0)
        }, 3000)
    }

    return (
        <Button
            type="button"
            variant="outline"
            onClick={handleTap}
            className={`min-w-[80px] transition-all duration-100 ${
                pulsing ? 'scale-110' : 'scale-100'
            } ${calculatedBpm ? 'border-primary text-primary bg-primary/10' : 'border-input hover:bg-accent'}`}
            title="Tap repeatedly to set tempo"
        >
            <Hand className="mr-2 h-4 w-4" />
            {calculatedBpm
                ? `${calculatedBpm}`
                : tapCount === 1
                    ? "Tap..."
                    : "Tap"}
        </Button>
    )
}
