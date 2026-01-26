"use client"

import { useState, useEffect } from "react"
import { Loader2, Wand2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { transposeChord, identifyChords } from "@/lib/transposer-logic"

interface TransposerOverlayProps {
    parentRef: React.RefObject<HTMLDivElement>
    pageNumber: number
    transposition: number // Global transposition state
}

export function TransposerOverlay({ parentRef, pageNumber, transposition }: TransposerOverlayProps) {
    const [enabled, setEnabled] = useState(false)
    const [status, setStatus] = useState<'idle' | 'scanning' | 'ready' | 'error'>('idle')
    const [blocks, setBlocks] = useState<{ text: string, poly: any }[]>([])
    const [detectedKey, setDetectedKey] = useState<string>('C')
    const [targetKey, setTargetKey] = useState<string>('C')

    // On mount or when enabled, try to find the canvas
    const scanPage = async () => {
        if (!parentRef.current) return

        const canvas = parentRef.current.querySelector('canvas')
        if (!canvas) {
            console.error("No canvas found for OCR")
            setStatus('error')
            return
        }

        setStatus('scanning')

        try {
            // Get image data
            const imageBase64 = canvas.toDataURL('image/jpeg', 0.8)

            // Send to OCR API
            const res = await fetch('/api/vision/ocr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageBase64 })
            })

            if (!res.ok) throw new Error("OCR Failed")

            const data = await res.json()

            // Process Chords
            const { chordBlocks, detectedKey } = identifyChords(data.blocks)

            setBlocks(chordBlocks)
            setDetectedKey(detectedKey)
            setTargetKey(detectedKey) // Initialize target same as detected
            setStatus('ready')

        } catch (e) {
            console.error("Transposer Scan Error:", e)
            setStatus('error')
        }
    }

    // Effect: If transposition changes, update target key automatically? 
    // Actually, store transposition is semitones (+-).
    // So we just transpose relative to detected key.

    if (!enabled) {
        return (
            <div className="absolute top-2 right-2 z-10">
                <Button
                    size="sm"
                    variant="secondary"
                    className="gap-2 bg-white/90 text-black hover:bg-white shadow-lg backdrop-blur"
                    onClick={() => { setEnabled(true); scanPage(); }}
                >
                    <Wand2 className="h-4 w-4 text-purple-600" />
                    Transpose (Beta)
                </Button>
            </div>
        )
    }

    // Overlay UI
    return (
        <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
            {/* Status / Controls Bar */}
            <div className="absolute top-2 right-2 pointer-events-auto flex items-center gap-2">
                {status === 'scanning' && (
                    <div className="bg-black/80 text-white px-3 py-1 rounded-full text-sm flex items-center gap-2 backdrop-blur">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Scanning...
                    </div>
                )}

                {status === 'ready' && (
                    <div className="bg-white/90 text-black p-1 rounded-lg shadow-xl flex items-center gap-2 backdrop-blur">
                        <div className="px-2 text-xs font-bold text-purple-600 uppercase tracking-wider">
                            {detectedKey} <span className="text-zinc-400">→</span> {transposeChord(detectedKey, transposition)}
                        </div>
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 rounded-full hover:bg-zinc-100"
                            onClick={() => setEnabled(false)}
                        >
                            <span className="sr-only">Close</span>
                            ×
                        </Button>
                    </div>
                )}
            </div>

            {/* Rendered Chords */}
            {status === 'ready' && blocks.map((block, i) => {
                // Calculate position relative to the image size
                // Vision API returns vertices relative to the *original image sent*.
                // Since we sent the canvas content, the coordinates map 1:1 to the canvas size.
                // However, CSS might scale the canvas. We need to be careful with scaling.
                // Assuming the overlay `div` is exactly the same size as the canvas.

                const vertices = block.poly
                if (!vertices || vertices.length < 4) return null

                const x = vertices[0].x
                const y = vertices[0].y
                const w = vertices[2].x - vertices[0].x
                const h = vertices[2].y - vertices[0].y

                // Transpose Logic
                const newChord = transposeChord(block.text, transposition)

                return (
                    <div
                        key={i}
                        className="absolute flex items-center justify-center bg-white"
                        style={{
                            left: x,
                            top: y,
                            width: w + 4, // Add a little padding to cover messy scan
                            height: h + 2,
                            // Simplistic resizing: Assume canvas pixels match CSS pixels if zoom is handled by parent scale
                            // But usually canvas width != css width
                        }}
                    >
                        <span className="font-bold text-blue-600 leading-none whitespace-nowrap"
                            style={{ fontSize: h * 0.9 }}>
                            {newChord}
                        </span>
                    </div>
                )
            })}
        </div>
    )
}
