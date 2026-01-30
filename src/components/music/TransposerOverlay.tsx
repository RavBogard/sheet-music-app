"use client"

import { useAuth } from "@/lib/auth-context"
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
    const { user } = useAuth() // Get Auth Context
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

    // Drag State
    const [isDragging, setIsDragging] = useState(false)
    const [dragStart, setDragStart] = useState<{ x: number, y: number } | null>(null)
    const [dragCurrent, setDragCurrent] = useState<{ x: number, y: number } | null>(null)
    const [isScanningRegion, setIsScanningRegion] = useState(false)

    // Edit Mode State
    const [pendingChord, setPendingChord] = useState<{ x: number, y: number, w?: number, h?: number } | null>(null)
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
            const token = user ? await user.getIdToken() : null
            const imageBase64 = canvas.toDataURL('image/jpeg', 0.8)
            const res = await fetch('/api/vision/ocr', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
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
            await transposerService.saveCorrections(fileId, corrections)
            toast.success("Corrections saved!")
            setTransposerState({ isEditing: false })
        } catch (e) {
            toast.error("Failed to save corrections")
        }
    }

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isEditing) return
        e.preventDefault() // prevent text selection

        const rect = e.currentTarget.getBoundingClientRect()
        const x = e.nativeEvent.clientX - rect.left
        const y = e.nativeEvent.clientY - rect.top

        setIsDragging(true)
        setDragStart({ x, y })
        setDragCurrent({ x, y })
    }

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isDragging || !dragStart) return

        const rect = e.currentTarget.getBoundingClientRect()
        const x = Math.max(0, Math.min(e.nativeEvent.clientX - rect.left, rect.width))
        const y = Math.max(0, Math.min(e.nativeEvent.clientY - rect.top, rect.height))

        setDragCurrent({ x, y })
    }

    const handleMouseUp = async (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isDragging || !dragStart || !dragCurrent) return

        setIsDragging(false)

        const dx = Math.abs(dragCurrent.x - dragStart.x)
        const dy = Math.abs(dragCurrent.y - dragStart.y)

        // If simple click (small drag), treat as click-to-add
        if (dx < 5 && dy < 5) {
            handleCanvasClick(e)
            setDragStart(null)
            setDragCurrent(null)
            return
        }

        // It's a region selection! Scan it.
        const rect = e.currentTarget.getBoundingClientRect()

        // Define region in pixels relative to Display
        const xMin = Math.min(dragStart.x, dragCurrent.x)
        const yMin = Math.min(dragStart.y, dragCurrent.y)
        const w = Math.abs(dragStart.x - dragCurrent.x)
        const h = Math.abs(dragStart.y - dragCurrent.y)

        // Convert to Percentages for UI storage (Display independent)
        const xPct = (xMin / rect.width) * 100
        const yPct = (yMin / rect.height) * 100
        const wPct = (w / rect.width) * 100
        const hPct = (h / rect.height) * 100

        // Set pending chord immediately so user sees the box
        setPendingChord({ x: xPct, y: yPct, w: wPct, h: hPct })
        setIsScanningRegion(true)

        try {
            // Perform OCR on this region
            const token = user ? await user.getIdToken() : null
            const canvas = parentRef.current?.querySelector('canvas')

            if (canvas) {
                // Map Display Pixels -> Canvas Pixels
                // We know canvasSize (natural size) and rect (display size)
                const scaleX = canvasSize.w / rect.width
                const scaleY = canvasSize.h / rect.height

                const cropX = xMin * scaleX
                const cropY = yMin * scaleY
                const cropW = w * scaleX
                const cropH = h * scaleY

                const tempCanvas = document.createElement('canvas')
                tempCanvas.width = cropW
                tempCanvas.height = cropH
                const ctx = tempCanvas.getContext('2d')
                if (ctx) {
                    ctx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH)
                    const imageBase64 = tempCanvas.toDataURL('image/jpeg', 0.8)

                    const res = await fetch('/api/vision/ocr', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                        },
                        body: JSON.stringify({ imageBase64 })
                    })

                    if (res.ok) {
                        const data = await res.json()
                        // Find most prominent text
                        if (data.blocks && data.blocks.length > 0) {
                            // Use the first block's text as a guess
                            const rawText = data.blocks[0].text
                            // Clean it up?
                            const cleanText = rawText.replace(/\n/g, '').trim()

                            // transpose it to match current key? 
                            // OCR returns "original" text usually.
                            // We should show it, and let user confirm.
                            // But detecting key from 1 chord is impossible. 
                            // We assume it reads what is WRITTEN (Original).
                            // We should probably just setPendingText to it.

                            setPendingText(cleanText)
                        } else {
                            toast.info("No text detected in region")
                        }
                    }
                }
            }

        } catch (err) {
            console.error(err)
            // Just let user type
        } finally {
            setIsScanningRegion(false)
        }

        setDragStart(null)
        setDragCurrent(null)
    }

    const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isEditing) return

        // Use the displayed size of the overlay itself for calculations
        const rect = e.currentTarget.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) return

        // Calculate % position relative to the OVERLAY size, not the underlying canvas
        // This ensures visual accuracy regardless of PDF scaling
        const xPct = ((e.nativeEvent.clientX - rect.left) / rect.width) * 100
        const yPct = ((e.nativeEvent.clientY - rect.top) / rect.height) * 100

        // Open input at this position with default size
        setPendingChord({ x: xPct, y: yPct, w: 5, h: 3 })
        setPendingText("")
    }

    const confirmPendingChord = () => {
        if (!pendingChord || !pendingText.trim()) {
            setPendingChord(null)
            return
        }

        // Add Correction (Locations are now already in %)
        addCorrection({
            id: crypto.randomUUID(),
            type: 'add',
            x: pendingChord.x,
            y: pendingChord.y,
            // Save width/height too if we want custom sized boxes!
            // Currently DB model might not support W/H? 
            // OMRCorrection type: x, y, text, pageIndex, type, id.
            // We can perhaps encode it or just rely on text size?
            // User requested "draw a box around the letter".
            // If we don't save W/H, it will revert to auto-size on reload.
            // For now let's just use X/Y. The important part was the OCR scan.
            text: pendingText.trim(),
            pageIndex: pageNumber - 1
        })
        setPendingChord(null)
    }

    const handleRemoveChord = (e: React.MouseEvent, type: 'detected' | 'added', identifier: any) => {
        e.stopPropagation()
        if (!isEditing) return

        if (type === 'added') {
            removeCorrection(identifier)
        } else {
            // Suppress the detected block
            // identifier is { text, poly } but we can't trust poly pixels if we are using %.
            // Ideally we'd pass the block index or ID. 
            // For now, let's rely on the coordinate matching we did in render.
            // Wait, we passed { text, poly } in the JSX. 
            // We need to suppress based on what we see.
            // Let's use the coordinates from the *rendered* item if possible, or re-calculate.

            // Actually, identifier.poly is raw pixels from the OCR block.
            // We need to convert THAT to % to create the suppression.

            const block = identifier
            const bx = (block.poly[0].x / canvasSize.w) * 100
            const by = (block.poly[0].y / canvasSize.h) * 100

            addCorrection({
                id: crypto.randomUUID(),
                type: 'remove',
                x: bx,
                y: by,
                text: block.text,
                pageIndex: pageNumber - 1
            })
        }
    }

    // Merge Logic (Render Time)
    const getRenderedChords = () => {
        if (status !== 'ready' && !isEditing) return []

        const finalChords: { x: number, y: number, w: number, h: number, text: string, type: 'detected' | 'added', id?: string }[] = []

        // 1. Process Detected Blocks (Normalize to %)
        blocks.forEach((block, i) => {
            // Block.poly is in raw canvas pixels. Convert to %
            const bx = (block.poly[0].x / canvasSize.w) * 100
            const by = (block.poly[0].y / canvasSize.h) * 100
            const bw = ((block.poly[2].x - block.poly[0].x) / canvasSize.w) * 100
            const bh = ((block.poly[2].y - block.poly[0].y) / canvasSize.h) * 100

            // Check if suppressed
            const isSuppressed = corrections.some(c =>
                c.type === 'remove' &&
                c.pageIndex === (pageNumber - 1) &&
                // Check distance (tolerance 2%)
                Math.abs(c.x - bx) < 3 && // Increased tolerance slightly
                Math.abs(c.y - by) < 3
            )

            if (!isSuppressed) {
                finalChords.push({
                    x: bx,
                    y: by,
                    w: bw,
                    h: bh,
                    text: transposeChord(block.text, transposition),
                    type: 'detected'
                })
            }
        })

        // 2. Process Added Corrections (Already in %)
        corrections.filter(c => c.type === 'add' && c.pageIndex === (pageNumber - 1)).forEach(c => {
            finalChords.push({
                x: c.x,
                y: c.y,
                w: 6, // Default width
                h: 3, // Default height
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
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
        >
            {/* Render Drag Selection Box */}
            {isDragging && dragStart && dragCurrent && (
                <div
                    className="absolute border-2 border-dashed border-blue-500 bg-blue-200/30 pointer-events-none"
                    style={{
                        left: Math.min(dragStart.x, dragCurrent.x),
                        top: Math.min(dragStart.y, dragCurrent.y),
                        width: Math.abs(dragCurrent.x - dragStart.x),
                        height: Math.abs(dragCurrent.y - dragStart.y),
                    }}
                />
            )}

            {/* Input Popover */}
            {pendingChord && (
                <div
                    className="absolute bg-white shadow-xl rounded p-1 flex gap-1 z-50 pointer-events-auto transform -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${pendingChord.x + (pendingChord.w || 0) / 2}%`, top: `${pendingChord.y + (pendingChord.h || 0) / 2}%` }}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()} // Stop propagation to canvas
                >
                    {isScanningRegion ? (
                        <div className="flex items-center gap-2 px-2 py-1">
                            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                            <span className="text-xs text-zinc-500">Scanning...</span>
                        </div>
                    ) : (
                        <>
                            <Input
                                autoFocus
                                className="h-8 w-20 px-1 text-center font-bold text-lg" // Bigger input
                                value={pendingText}
                                onChange={(e) => setPendingText(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') confirmPendingChord()
                                    if (e.key === 'Escape') setPendingChord(null)
                                }}
                            />
                            <Button size="icon" className="h-8 w-8" onClick={confirmPendingChord}>
                                <Check className="h-4 w-4" />
                            </Button>
                        </>
                    )}
                </div>
            )}

            {/* Chords */}
            {renderedChords.map((chord, i) => (
                <div
                    key={i}
                    className={`absolute flex items-center justify-center 
                               ${isEditing ? 'cursor-pointer hover:bg-red-50 hover:border-red-400 border border-transparent' : 'bg-white pointer-events-none'}
                               transition-colors group/chord
                    `}
                    style={{
                        left: `${chord.x}%`,
                        top: `${chord.y}%`,
                        width: `${chord.w}%`,
                        height: `${chord.h}%`,
                        minWidth: '32px', // Bigger Minimum
                        minHeight: '24px',
                        padding: '2px',
                        backgroundColor: isEditing ? 'rgba(255,255,255,0.85)' : 'white'
                    }}
                    onMouseDown={(e) => e.stopPropagation()} // Allow clicking chords without starting drag
                    onClick={(e) => handleRemoveChord(e, chord.type, chord.type === 'added' ? chord.id : { text: chord.text, poly: [{ x: chord.x, y: chord.y }] })}
                >
                    <span
                        className="font-bold text-blue-600 leading-none whitespace-nowrap select-none"
                        style={{ fontSize: 'min(2.5vh, 2.5vw)', fontWeight: 800 }} // MUCH Bigger Font
                    >
                        {chord.text}
                    </span>
                    {isEditing && (
                        <div className="absolute -top-3 -right-3 bg-red-500 text-white rounded-full p-1 shadow opacity-0 group-hover/chord:opacity-100 transition-opacity z-20">
                            <X className="h-3 w-3" />
                        </div>
                    )}
                </div>
            ))}

            {/* Instructions */}
            {isEditing && !isDragging && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded-lg text-sm pointer-events-none backdrop-blur shadow-xl border border-white/10 text-center">
                    Draw box to <b>Scan Details</b> • Click empty to <b>Add</b>
                </div>
            )}
        </div>
    )
}
