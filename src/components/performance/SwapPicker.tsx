"use client"

import { useState, useEffect, useMemo, useRef, type KeyboardEvent } from "react"
import { X, Search, Music } from "lucide-react"
import Fuse from "fuse.js"
import { useLibraryStore } from "@/lib/library-store"
import type { SetlistTrack, DriveFile } from "@/types/models"

interface SwapPickerProps {
    open: boolean
    onClose: () => void
    currentTrack: SetlistTrack
    onSelectReplacement: (file: DriveFile) => void
}

export function SwapPicker({ open, onClose, currentTrack, onSelectReplacement }: SwapPickerProps) {
    const [query, setQuery] = useState("")
    const [selectedIndex, setSelectedIndex] = useState(0)
    const inputRef = useRef<HTMLInputElement>(null)
    const listRef = useRef<HTMLDivElement>(null)
    const allFiles = useLibraryStore((s) => s.allFiles)

    const pdfFiles = useMemo(
        () => allFiles.filter((f) => f.mimeType === "application/pdf" && f.id !== currentTrack.fileId),
        [allFiles, currentTrack.fileId]
    )

    const fuse = useMemo(
        () => new Fuse(pdfFiles, { keys: ["name"], threshold: 0.4 }),
        [pdfFiles]
    )

    // v4.3 U04: show top 20 as a "jump-start" but reveal the rest once the
    // user types so large libraries aren't silently truncated.
    const results = useMemo(() => {
        if (!query.trim()) return pdfFiles.slice(0, 20)
        return fuse.search(query).map((r) => r.item)
    }, [query, fuse, pdfFiles])

    useEffect(() => {
        setSelectedIndex(0)
    }, [results])

    // Autofocus: iOS Safari drops focus applied synchronously inside an animated
    // container. setTimeout past the slide-in, then a rAF re-focus, is the
    // known two-step workaround.
    useEffect(() => {
        if (!open) return
        const timer = setTimeout(() => {
            inputRef.current?.focus({ preventScroll: true })
            requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }))
        }, 100)
        return () => clearTimeout(timer)
    }, [open])

    useEffect(() => {
        const el = listRef.current?.querySelector<HTMLElement>(`[data-swap-row="${selectedIndex}"]`)
        el?.scrollIntoView({ block: "nearest" })
    }, [selectedIndex])

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Escape") {
            e.preventDefault()
            onClose()
            return
        }
        if (e.key === "Enter") {
            e.preventDefault()
            const pick = results[selectedIndex]
            if (pick) onSelectReplacement(pick)
            return
        }
        if (results.length === 0) return
        if (e.key === "ArrowDown") {
            e.preventDefault()
            setSelectedIndex((i) => (i + 1) % results.length)
        } else if (e.key === "ArrowUp") {
            e.preventDefault()
            setSelectedIndex((i) => (i - 1 + results.length) % results.length)
        }
    }

    const displayName = (name: string) => name.replace(/\.[^.]+$/, "")

    if (!open) return null

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
            <div
                className="absolute inset-0 bg-black/60"
                onClick={onClose}
            />

            <div className="relative w-full max-w-lg bg-card rounded-t-2xl max-h-[70vh] md:max-h-[85vh] flex flex-col animate-in slide-in-from-bottom duration-200">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
                    <h2 className="text-sm font-semibold text-foreground truncate">
                        Replace: {currentTrack.title}
                    </h2>
                    <button
                        type="button"
                        aria-label="Close"
                        onClick={onClose}
                        className="h-11 w-11 flex items-center justify-center rounded-lg hover:bg-muted transition-colors shrink-0 cursor-pointer"
                    >
                        <X className="h-5 w-5 text-muted-foreground" />
                    </button>
                </div>

                <div className="px-4 py-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Search library..."
                            aria-label="Search replacement song"
                            className="w-full h-11 pl-10 pr-4 bg-muted border border-border rounded-lg text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
                        />
                    </div>
                </div>

                <div ref={listRef} className="flex-1 overflow-y-auto">
                    {results.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                            <Music className="h-8 w-8 mb-2 opacity-30" />
                            <p className="text-sm">No matching songs found</p>
                        </div>
                    )}
                    {results.map((file, i) => (
                        <button
                            key={file.id}
                            type="button"
                            data-swap-row={i}
                            data-selected={i === selectedIndex}
                            onMouseEnter={() => setSelectedIndex(i)}
                            onClick={() => onSelectReplacement(file)}
                            className="w-full flex items-center gap-3 px-4 py-3 min-h-[56px] cursor-pointer border-b border-border/30 transition-colors text-left hover:bg-muted/50 data-[selected=true]:bg-muted data-[selected=true]:ring-1 data-[selected=true]:ring-inset data-[selected=true]:ring-brand/40"
                        >
                            <span className="flex-1 min-w-0 text-sm font-medium text-foreground truncate">
                                {displayName(file.name)}
                            </span>
                            {file.metadata?.key && (
                                <span className="font-mono text-xs bg-brand/15 text-brand px-1.5 rounded shrink-0">
                                    {file.metadata.key}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    )
}
