"use client"

import { useRef, useCallback, useState } from "react"
import { useAnnotationStore } from "@/lib/annotation-store"
import type { Annotation } from "@/types/annotations"
import { v4 as uuid } from "uuid"

interface AnnotationLayerProps {
    pageNumber: number
    width: number
    height: number
}

/**
 * Transparent SVG overlay that renders annotations and captures drawing input.
 * All coordinates are stored normalized (0-1) relative to page dimensions.
 */
export function AnnotationLayer({ pageNumber, width, height }: AnnotationLayerProps) {
    const {
        pageAnnotations,
        isAnnotating,
        activeTool,
        activeColor,
        strokeWidth,
        addAnnotation,
    } = useAnnotationStore()

    const svgRef = useRef<SVGSVGElement>(null)
    const [currentPath, setCurrentPath] = useState<string>("")
    const [isDrawing, setIsDrawing] = useState(false)
    const [textInput, setTextInput] = useState<{ x: number; y: number } | null>(null)

    const annotations = pageAnnotations[String(pageNumber)] || []

    // Convert client coordinates to normalized 0-1 space
    const toNormalized = useCallback(
        (clientX: number, clientY: number) => {
            if (!svgRef.current) return { x: 0, y: 0 }
            const rect = svgRef.current.getBoundingClientRect()
            return {
                x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
                y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
            }
        },
        []
    )

    const handlePointerDown = useCallback(
        (e: React.PointerEvent) => {
            if (!isAnnotating) return

            const { x, y } = toNormalized(e.clientX, e.clientY)

            if (activeTool === "text") {
                setTextInput({ x, y })
                return
            }

            if (activeTool === "freehand" || activeTool === "highlight") {
                setIsDrawing(true)
                setCurrentPath(`M ${x} ${y}`)
                ;(e.target as Element).setPointerCapture(e.pointerId)
            }
        },
        [isAnnotating, activeTool, toNormalized]
    )

    const handlePointerMove = useCallback(
        (e: React.PointerEvent) => {
            if (!isDrawing) return
            const { x, y } = toNormalized(e.clientX, e.clientY)
            setCurrentPath((prev) => `${prev} L ${x} ${y}`)
        },
        [isDrawing, toNormalized]
    )

    const handlePointerUp = useCallback(() => {
        if (!isDrawing || !currentPath) return
        setIsDrawing(false)

        const annotation: Annotation = {
            id: uuid(),
            type: activeTool === "highlight" ? "highlight" : "freehand",
            path: currentPath,
            color: activeColor,
            strokeWidth: activeTool === "highlight" ? 12 : strokeWidth,
            pageNumber,
            createdAt: Date.now(),
        }
        addAnnotation(annotation)
        setCurrentPath("")
    }, [isDrawing, currentPath, activeTool, activeColor, strokeWidth, pageNumber, addAnnotation])

    const handleTextSubmit = useCallback(
        (text: string) => {
            if (!textInput || !text.trim()) {
                setTextInput(null)
                return
            }
            const annotation: Annotation = {
                id: uuid(),
                type: "text",
                text: text.trim(),
                x: textInput.x,
                y: textInput.y,
                color: activeColor,
                pageNumber,
                createdAt: Date.now(),
            }
            addAnnotation(annotation)
            setTextInput(null)
        },
        [textInput, activeColor, pageNumber, addAnnotation]
    )

    return (
        <div
            className="absolute inset-0"
            style={{
                pointerEvents: isAnnotating ? "auto" : "none",
                touchAction: isAnnotating ? "none" : "auto",
            }}
        >
            <svg
                ref={svgRef}
                viewBox="0 0 1 1"
                preserveAspectRatio="none"
                className="absolute inset-0 w-full h-full"
                aria-label={isAnnotating ? "Annotation drawing area" : `Chart annotations (${annotations.length})`}
                role="img"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                style={{ cursor: isAnnotating ? "crosshair" : "default" }}
            >
                {/* Existing annotations */}
                {annotations.map((a) => {
                    if (a.type === "freehand" && a.path) {
                        return (
                            <path
                                key={a.id}
                                d={a.path}
                                stroke={a.color}
                                strokeWidth={(a.strokeWidth || 3) / Math.max(width, height)}
                                fill="none"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                vectorEffect="non-scaling-stroke"
                            />
                        )
                    }
                    if (a.type === "highlight" && a.path) {
                        return (
                            <path
                                key={a.id}
                                d={a.path}
                                stroke={a.color}
                                strokeWidth={(a.strokeWidth || 12) / Math.max(width, height)}
                                fill="none"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                opacity={0.3}
                                vectorEffect="non-scaling-stroke"
                            />
                        )
                    }
                    if (a.type === "text" && a.text && a.x != null && a.y != null) {
                        return (
                            <text
                                key={a.id}
                                x={a.x}
                                y={a.y}
                                fill={a.color}
                                fontSize={14 / Math.max(width, height)}
                                fontFamily="sans-serif"
                                fontWeight="600"
                            >
                                {a.text}
                            </text>
                        )
                    }
                    return null
                })}

                {/* Active drawing preview */}
                {isDrawing && currentPath && (
                    <path
                        d={currentPath}
                        stroke={activeColor}
                        strokeWidth={(activeTool === "highlight" ? 12 : strokeWidth) / Math.max(width, height)}
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity={activeTool === "highlight" ? 0.3 : 1}
                        vectorEffect="non-scaling-stroke"
                    />
                )}
            </svg>

            {/* Text input popup */}
            {textInput && (
                <div
                    className="absolute z-10"
                    style={{
                        left: `${textInput.x * 100}%`,
                        top: `${textInput.y * 100}%`,
                    }}
                >
                    <input
                        autoFocus
                        type="text"
                        placeholder="Note..."
                        className="bg-zinc-800 text-white text-sm px-2 py-1 rounded border border-zinc-600 outline-none min-w-[120px]"
                        onKeyDown={(e) => {
                            if (e.key === "Enter") handleTextSubmit((e.target as HTMLInputElement).value)
                            if (e.key === "Escape") setTextInput(null)
                        }}
                        onBlur={(e) => handleTextSubmit(e.target.value)}
                    />
                </div>
            )}
        </div>
    )
}
