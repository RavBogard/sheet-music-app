"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

export interface TransposedChord {
    x: number      // X percentage (0-100) or pixels? Pixels are safer if we match page dims.
    y: number      // Y percentage or pixels
    width: number
    height: number
    original: string
    transposed: string
}

interface TransposerLayerProps {
    width: number
    height: number // Total height of all pages + gaps
    scale: number
    chords: TransposedChord[]
    visible: boolean
}

export function TransposerLayer({ width, height, scale, chords, visible }: TransposerLayerProps) {
    if (!visible) return null

    return (
        <div
            className="absolute top-0 left-0 pointer-events-none z-10"
            style={{
                width: width,
                height: height
            }}
        >
            {chords.map((chord, i) => (
                <div
                    key={i}
                    className="absolute flex items-center justify-center bg-white shadow-sm border border-zinc-100/50 z-20"
                    style={{
                        left: chord.x * scale,
                        top: chord.y * scale,
                        width: chord.width * scale,
                        height: chord.height * scale,
                        // Padding to ensure we cover any slight drift or descenders
                        padding: '2px',
                        boxSizing: 'content-box',
                        transform: 'translate(-2px, -2px)' // Slight nudge to center the "whiteout" coverage
                    }}
                >
                    <span
                        className="font-bold text-blue-600 leading-none whitespace-nowrap"
                        style={{
                            // Make font slightly larger than the box height for readability
                            fontSize: (chord.height * scale) * 1.0,
                            // Use a font that looks good for chords
                            fontFamily: 'monospace'
                        }}
                    >
                        {chord.transposed}
                    </span>
                </div>
            ))}
        </div>
    )
}
