"use client"

import { useState, useRef, useEffect } from "react"
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react"
import { Button } from "@/components/ui/button"

interface AudioPlayerProps {
    src: string | null
    title?: string
    onEnded?: () => void
}

export function AudioPlayer({ src, title, onEnded }: AudioPlayerProps) {
    const audioRef = useRef<HTMLAudioElement>(null)
    const [isPlaying, setIsPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [volume, setVolume] = useState(1)
    const [isMuted, setIsMuted] = useState(false)

    useEffect(() => {
        if (src && audioRef.current) {
            audioRef.current.load()
            setIsPlaying(false)
            setCurrentTime(0)
        }
    }, [src])

    const togglePlay = () => {
        if (!audioRef.current) return
        if (isPlaying) {
            audioRef.current.pause()
        } else {
            audioRef.current.play()
        }
        setIsPlaying(!isPlaying)
    }

    const handleTimeUpdate = () => {
        if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime)
        }
    }

    const handleLoadedMetadata = () => {
        if (audioRef.current) {
            setDuration(audioRef.current.duration)
        }
    }

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const time = parseFloat(e.target.value)
        if (audioRef.current) {
            audioRef.current.currentTime = time
            setCurrentTime(time)
        }
    }

    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const vol = parseFloat(e.target.value)
        setVolume(vol)
        if (audioRef.current) {
            audioRef.current.volume = vol
        }
        setIsMuted(vol === 0)
    }

    const toggleMute = () => {
        if (audioRef.current) {
            audioRef.current.muted = !isMuted
            setIsMuted(!isMuted)
        }
    }

    const formatTime = (time: number) => {
        const mins = Math.floor(time / 60)
        const secs = Math.floor(time % 60)
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    const handleEnded = () => {
        setIsPlaying(false)
        onEnded?.()
    }

    if (!src) {
        return (
            <div className="bg-zinc-900 rounded-lg p-4 text-center text-zinc-500">
                Select an audio file to play
            </div>
        )
    }

    return (
        <div className="bg-zinc-900 rounded-lg p-4">
            <audio
                ref={audioRef}
                src={src}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={handleEnded}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
            />

            {/* Title */}
            {title && (
                <div className="text-center font-medium mb-4 truncate">
                    {title}
                </div>
            )}

            {/* Progress Bar */}
            <div className="flex items-center gap-3 mb-4">
                <span className="text-xs text-zinc-500 w-10">{formatTime(currentTime)}</span>
                <input
                    type="range"
                    min="0"
                    max={duration || 0}
                    value={currentTime}
                    onChange={handleSeek}
                    className="flex-1 h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <span className="text-xs text-zinc-500 w-10">{formatTime(duration)}</span>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-4">
                <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                        if (audioRef.current) {
                            audioRef.current.currentTime = Math.max(0, currentTime - 10)
                        }
                    }}
                    className="h-10 w-10"
                >
                    <SkipBack className="h-5 w-5" />
                </Button>

                <Button
                    size="icon"
                    onClick={togglePlay}
                    className="h-14 w-14 rounded-full bg-blue-600 hover:bg-blue-500"
                >
                    {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-1" />}
                </Button>

                <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                        if (audioRef.current) {
                            audioRef.current.currentTime = Math.min(duration, currentTime + 10)
                        }
                    }}
                    className="h-10 w-10"
                >
                    <SkipForward className="h-5 w-5" />
                </Button>

                <div className="flex items-center gap-2 ml-4">
                    <Button size="icon" variant="ghost" onClick={toggleMute} className="h-8 w-8">
                        {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    </Button>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={isMuted ? 0 : volume}
                        onChange={handleVolumeChange}
                        className="w-20 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                </div>
            </div>
        </div>
    )
}
