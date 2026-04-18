"use client"

import { useState, useRef, useCallback } from "react"
import { useDndContext } from "@dnd-kit/core"
import { Trash2 } from "lucide-react"

interface SwipeToDeleteProps {
    children: React.ReactNode
    onDelete: () => void
    enabled: boolean
}

const DELETE_THRESHOLD = -80
const MAX_SWIPE = -120

export function SwipeToDelete({ children, onDelete, enabled }: SwipeToDeleteProps) {
    const [offsetX, setOffsetX] = useState(0)
    const [swiping, setSwiping] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const startX = useRef(0)
    const startY = useRef(0)
    const locked = useRef<"x" | "y" | null>(null)
    const currentOffset = useRef(0)
    const { active } = useDndContext()

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        startX.current = e.touches[0].clientX
        startY.current = e.touches[0].clientY
        locked.current = null
        setSwiping(true)
    }, [])

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        const dx = e.touches[0].clientX - startX.current
        const dy = e.touches[0].clientY - startY.current

        // Direction lock: decide once whether this is a horizontal or vertical gesture
        if (!locked.current) {
            if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
                locked.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y"
            }
            return
        }

        if (locked.current === "y") return

        // Clamp: only allow left swipe, with elastic feel past max
        let clamped = Math.min(0, dx)
        if (clamped < MAX_SWIPE) {
            clamped = MAX_SWIPE + (clamped - MAX_SWIPE) * 0.1
        }
        currentOffset.current = clamped
        setOffsetX(clamped)
    }, [])

    const handleTouchEnd = useCallback(() => {
        setSwiping(false)
        if (currentOffset.current < DELETE_THRESHOLD) {
            // Hold at delete position and show confirmation
            setConfirmDelete(true)
            setOffsetX(DELETE_THRESHOLD)
            currentOffset.current = DELETE_THRESHOLD
            locked.current = null
            return
        }
        currentOffset.current = 0
        setOffsetX(0)
        locked.current = null
    }, [])

    const handleConfirmDelete = useCallback(() => {
        setConfirmDelete(false)
        currentOffset.current = 0
        setOffsetX(0)
        onDelete()
    }, [onDelete])

    const handleCancelDelete = useCallback(() => {
        setConfirmDelete(false)
        currentOffset.current = 0
        setOffsetX(0)
    }, [])

    // Disable swipe when not in edit mode or when a dnd-kit drag is active
    if (!enabled || active) {
        return <>{children}</>
    }

    const bgOpacity = Math.min(1, Math.max(0, Math.abs(offsetX) / 120))
    const iconScale = 0.5 + (Math.min(1, Math.abs(offsetX) / 120) * 0.7)

    return (
        <div className="relative overflow-hidden rounded-lg touch-pan-y">
            {/* Red background revealed on swipe */}
            <div
                className="absolute inset-0 flex items-center justify-end pr-4 bg-red-500 rounded-lg"
                style={{ opacity: confirmDelete ? 1 : bgOpacity }}
            >
                {confirmDelete ? (
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleCancelDelete}
                            className="px-3 py-1.5 text-xs font-medium text-white/90 bg-white/20 rounded-md"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleConfirmDelete}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-white/30 rounded-md"
                        >
                            Delete
                        </button>
                    </div>
                ) : (
                    <Trash2
                        className="h-5 w-5 text-white"
                        style={{ transform: `scale(${iconScale})` }}
                    />
                )}
            </div>

            {/* Swipeable content */}
            <div
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                style={{
                    transform: `translateX(${offsetX}px)`,
                    transition: swiping ? "none" : "transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
                }}
                className={`relative bg-background ${swiping ? "z-10" : ""}`}
            >
                {children}
            </div>
        </div>
    )
}
