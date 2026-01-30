"use client"

import { useState, useEffect, useRef } from "react"
import { Loader2, Wand2, Pencil, Save, X, Trash2, Check, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { transposeChord, identifyChords } from "@/lib/transposer-logic"
import { useMusicStore } from "@/lib/store"
import { transposerService } from "@/lib/transposer-service"
import { toast } from "sonner"
import { OMRCorrection } from "@/types/models"

interface TransposerOverlayProps {
    parentRef: React.RefObject<HTMLDivElement>
    pageNumber: number
    transposition: number // Global transposition state
    startScanning?: boolean
}

export function TransposerOverlay({ parentRef, pageNumber, transposition, startScanning = true }: TransposerOverlayProps) {
    const {
        playbackQueue,
        queueIndex,
        aiTransposer,
        setTransposerState,
        addCorrection,
        removeCorrection,
        resetTransposer
    } = useMusicStore()

    const fileId = playbackQueue[queueIndex]?.fileId
    const { isEditing, corrections, status } = aiTransposer

    const [blocks, setBlocks] = useState<{ text: string, poly: any }[]>([])
    const [detectedKey, setDetectedKey] = useState<string>('C')
    const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 })

    // Edit Mode State
    const [pendingChord, setPendingChord] = useState<{ x: number, y: number } | null>(null)
    const [pendingText, setPendingText] = useState("")

    // On mount or when available, try to find the canvas size
    const updateCanvasSize = () => {
        if (!parentRef.current) return false
        const canvas = parentRef.current.querySelector('canvas')
        if (canvas) {
            setCanvasSize({ w: canvas.width, h: canvas.height })
            return true
        }
        return false
    }

    // Effect: Update size when editing starts
    useEffect(() => {
        if (isEditing) {
            // Try immediately, then retry for safety
            if (!updateCanvasSize()) {
                const t = setTimeout(updateCanvasSize, 500)
                return () => clearTimeout(t)
            }
        }
    }, [isEditing])

    // Effect: Auto-Scan when activated AND page rendered
    useEffect(() => {
        if (aiTransposer.isVisible && aiTransposer.status === 'idle' && startScanning) {
            // Wait a tick for layout?
            const t = setTimeout(() => scanPage(), 100)
            return () => clearTimeout(t)
        }
    }, [aiTransposer.isVisible, aiTransposer.status, startScanning])

    const scanPage = async () => {
        if (!parentRef.current) return

        // Retry loop to find canvas (React-PDF renders async)
        let canvas: HTMLCanvasElement | null = null
        for (let i = 0; i < 10; i++) {
            canvas = parentRef.current.querySelector('canvas')
            if (canvas) break
            await new Promise(r => setTimeout(r, 200))
        }

        if (!canvas) {
            console.error("No canvas found for OCR after retries")
            setTransposerState({ status: 'error' })
            return
        }

        // Save true dimensions for mapping
        setCanvasSize({ w: canvas.width, h: canvas.height })

        setTransposerState({ status: 'scanning', isVisible: true })

        try {
            const imageBase64 = canvas.toDataURL('image/jpeg', 0.8)
            const res = await fetch('/api/vision/ocr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageBase64 })
            })

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}))
                throw new Error(errData.details || errData.error || `HTTP ${res.status}`)
            }
            const data = await res.json()

            const { chordBlocks, detectedKey } = identifyChords(data.blocks)
            // Restore file-saved corrections as well if we have them
            // Actually, we should probably fetch them or rely on them being passed in if we want persistence.
            // For now, let's just get the chords.

            const chords = chordBlocks.map(b => ({
                text: b.text,
                poly: b.poly,
                type: 'detected' as const,
                id: `detected-${b.poly[0].x}-${b.poly[0].y}`
            }))

            setBlocks(chords)
            setDetectedKey(detectedKey)
            setTransposerState({ status: 'ready', detectedKey })

            // If we have corrections in the store, they will automatically apply via getRenderedChords

        } catch (e: any) {
            console.error("Scan Error:", e)
            setTransposerState({ status: 'error' })
            toast.error(`Scan Failed: ${e.message}`)
        }
    }

    const handleSaveCorrections = async () => {
        if (!fileId) return
        try {
            // Filter corrections for effectively current page if we tracked pages?
            // Currently assuming single-page or global corrections.
            // But store corrections are global. We'll save the whole array.
            await transposerService.saveCorrections(fileId, corrections)
            toast.success("Corrections saved!")
            setTransposerState({ isEditing: false })
        } catch (e) {
            toast.error("Failed to save corrections")
        }
    }

    const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isEditing) return
        if (!canvasSize.w) return

        // If we clicked a chord box, event propagation stopped there.
        // So this is a click on empty space -> Add Chord.

        const rect = e.currentTarget.getBoundingClientRect()
        const x = e.nativeEvent.offsetX
        const y = e.nativeEvent.offsetY

        // Open input at this position
        setPendingChord({ x, y })
        setPendingText("")
    }

    const confirmPendingChord = () => {
        if (!pendingChord || !pendingText.trim()) {
            setPendingChord(null)
            return
        }

        // Add Correction
        addCorrection({
            id: crypto.randomUUID(),
            type: 'add',
            x: (pendingChord.x / canvasSize.w) * 100, // Store as %
            y: (pendingChord.y / canvasSize.h) * 100,
            text: pendingText.trim(),
            pageIndex: pageNumber - 1 // 0-indexed
        })
        setPendingChord(null)
    }

    const handleRemoveChord = (e: React.MouseEvent, type: 'detected' | 'added', identifier: any) => {
        e.stopPropagation()
        if (!isEditing) return

        if (type === 'added') {
            // Remove the manual addition
            removeCorrection(identifier) // identifier is ID
        } else {
            // Suppress the detected block
            // We create a REMOVE correction nearby
            const block = identifier // block object
            const x = block.poly[0].x
            const y = block.poly[0].y

            addCorrection({
                id: crypto.randomUUID(),
                type: 'remove',
                x: (x / canvasSize.w) * 100,
                y: (y / canvasSize.h) * 100,
                text: block.text, // original text just in case
                pageIndex: pageNumber - 1
            })
        }
    }

    // Merge Logic (Render Time)
    const getRenderedChords = () => {
        if (status !== 'ready' && !isEditing) return []

        const finalChords: { x: number, y: number, w: number, h: number, text: string, type: 'detected' | 'added', id?: string }[] = []

        // 1. Process Detected Blocks
        blocks.forEach((block, i) => {
            const bx = block.poly[0].x
            const by = block.poly[0].y

            // Check if suppressed
            const isSuppressed = corrections.some(c =>
                c.type === 'remove' &&
                c.pageIndex === (pageNumber - 1) &&
                // Check distance (tolerance 2% of width?)
                Math.abs(c.x - (bx / canvasSize.w * 100)) < 2 &&
                Math.abs(c.y - (by / canvasSize.h * 100)) < 2
            )

            if (!isSuppressed) {
                finalChords.push({
                    x: bx,
                    y: by,
                    w: block.poly[2].x - block.poly[0].x,
                    h: block.poly[2].y - block.poly[0].y,
                    text: transposeChord(block.text, transposition),
                    type: 'detected'
                })
            }
        })

        // 2. Process Added Corrections
        corrections.filter(c => c.type === 'add' && c.pageIndex === (pageNumber - 1)).forEach(c => {
            // Convert % back to pixels
            const px = (c.x / 100) * canvasSize.w
            const py = (c.y / 100) * canvasSize.h

            finalChords.push({
                x: px,
                y: py,
                w: 40, // default size for manual
                h: 20,
                text: transposeChord(c.text, transposition),
                type: 'added',
                id: c.id
            })
        })

        return finalChords
    }

    const renderedChords = getRenderedChords()

    // Overlay UI (Just the layer)
    return (
        <div
            className={`absolute inset-0 z-10 overflow-hidden ${isEditing ? 'cursor-crosshair bg-black/5 pointer-events-auto' : 'pointer-events-none'}`}
            onClick={handleCanvasClick}
        >
            {/* Input Popover */}
            {pendingChord && (
                <div
                    className="absolute bg-white shadow-xl rounded p-1 flex gap-1 z-50 pointer-events-auto"
                    style={{ left: pendingChord.x, top: pendingChord.y }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <Input
                        autoFocus
                        className="h-7 w-16 px-1 text-center font-bold"
                        value={pendingText}
                        onChange={(e) => setPendingText(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') confirmPendingChord()
                            if (e.key === 'Escape') setPendingChord(null)
                        }}
                    />
                    <Button size="icon" className="h-7 w-7" onClick={confirmPendingChord}>
                        <Check className="h-3 w-3" />
                    </Button>
                </div>
            )}

            {/* Chords */}
            {renderedChords.map((chord, i) => (
                <div
                    key={i}
                    className={`absolute flex items-center justify-center 
                               ${isEditing ? 'cursor-pointer hover:bg-red-50 hover:border-red-400 border border-transparent' : 'bg-white pointer-events-none'}
                               transition-colors
                    `}
                    style={{
                        left: chord.x,
                        top: chord.y,
                        width: chord.w + 4,
                        height: chord.h + 2,
                        padding: '2px', // Whiteout padding
                        backgroundColor: isEditing ? 'rgba(255,255,255,0.7)' : 'white'
                    }}
                    onClick={(e) => handleRemoveChord(e, chord.type, chord.type === 'added' ? chord.id : { text: chord.text, poly: [{ x: chord.x, y: chord.y }] })}
                >
                    <span
                        className="font-bold text-blue-600 leading-none whitespace-nowrap"
                        style={{ fontSize: chord.h * 0.9 }}
                    >
                        {chord.text}
                    </span>
                    {isEditing && (
                        <div className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 shadow">
                            <X className="h-2 w-2" />
                        </div>
                    )}
                </div>
            ))}

            {/* Explainer Toast for Edit Mode */}
            {isEditing && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded-lg text-sm pointer-events-none backdrop-blur animate-in fade-in slide-in-from-bottom-2">
                    Click empty space to <b>Add</b> • Click chord to <b>Remove</b>
                </div>
            )}
        </div>
    )
}
