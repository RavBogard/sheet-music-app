"use client"

import { useEffect, useRef, useState } from "react"
import { useMusicStore } from "@/lib/store"
import { Play, Pause, Repeat, Repeat1, Volume2, VolumeX } from "lucide-react"
import { Button } from "@/components/ui/button"

export function BackingTrackPlayer() {
    const { audio, setAudioState } = useMusicStore()
    const audioRef = useRef<HTMLAudioElement>(null)

    // Sync Store -> Audio Element
    useEffect(() => {
        if (!audioRef.current) return

        if (audio.url) {
            // Only load if different
            const currentSrc = audioRef.current.getAttribute('src')
            if (currentSrc !== audio.url) {
                audioRef.current.src = audio.url
                audioRef.current.load()
            }
        } else {
            audioRef.current.removeAttribute('src')
        }
    }, [audio.url])

    // Sync Play/Pause
    useEffect(() => {
        if (!audioRef.current || !audio.url) return

        if (audio.isPlaying) {
            audioRef.current.play().catch(e => {
                console.error("Playback failed", e)
                setAudioState({ isPlaying: false })
            })
        } else {
            audioRef.current.pause()
        }
    }, [audio.isPlaying, audio.url, setAudioState])

    // Sync Loop
    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.loop = audio.isLooping
        }
    }, [audio.isLooping])

    // Sync Volume
    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = audio.volume
        }
    }, [audio.volume])


    if (!audio.url) return null

    return (
        <div className="flex items-center gap-2 bg-zinc-900/80 rounded-full px-3 py-1 border border-zinc-700">
            <audio
                ref={audioRef}
                onEnded={() => setAudioState({ isPlaying: false })}
                onError={() => setAudioState({ isPlaying: false })}
            />

            <Button
                size="icon"
                variant="ghost"
                className={`h-8 w-8 rounded-full ${audio.isPlaying ? 'text-green-400' : 'text-zinc-300'}`}
                onClick={() => setAudioState({ isPlaying: !audio.isPlaying })}
            >
                {audio.isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>

            <Button
                size="icon"
                variant="ghost"
                className={`h-8 w-8 rounded-full ${audio.isLooping ? 'text-blue-400 bg-blue-400/10' : 'text-zinc-500'}`}
                onClick={() => setAudioState({ isLooping: !audio.isLooping })}
            >
                {audio.isLooping ? <Repeat1 className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}
            </Button>
        </div>
    )
}
