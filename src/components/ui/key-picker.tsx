"use client"

import { useState, useEffect } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"

const NOTES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]
const QUALITIES = ["", "m"] as const // major, minor

interface KeyPickerProps {
    value: string
    onChange: (key: string) => void
    className?: string
}

export function KeyPicker({ value, onChange, className }: KeyPickerProps) {
    const [open, setOpen] = useState(false)

    // Parse current key into note + quality, normalizing casing
    const parseKey = (k: string) => {
        const match = k.match(/^([A-G][b#]?)(m|min|maj)?$/i)
        if (!match) return { note: "", quality: "" as "" | "m" }
        // Normalize: uppercase first letter, preserve b/#
        const rawNote = match[1]
        const note = rawNote.charAt(0).toUpperCase() + rawNote.slice(1)
        return { note, quality: (match[2]?.startsWith("m") ? "m" : "") as "" | "m" }
    }

    const { note: currentNote, quality: currentQuality } = parseKey(value)
    const [quality, setQuality] = useState<"" | "m">(currentQuality)

    // Sync quality when value changes externally (AI, undo, live sync)
    useEffect(() => {
        setQuality(currentQuality)
    }, [currentQuality])

    const handleSelect = (note: string) => {
        const newKey = `${note}${quality}`
        onChange(newKey)
        setOpen(false)
    }

    const handleQualityToggle = (q: "" | "m") => {
        setQuality(q)
        // If a note is already selected, update immediately
        if (currentNote) {
            onChange(`${currentNote}${q}`)
        }
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    className={`h-9 px-3 rounded-md bg-muted/50 border-0 font-mono text-center
                        hover:bg-muted transition-colors cursor-pointer text-sm
                        ${value ? "text-foreground" : "text-muted-foreground"} ${className || ""}`}
                >
                    {value || "Key"}
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="start">
                {/* Major / Minor toggle */}
                <div className="flex gap-1 mb-3">
                    {QUALITIES.map((q) => (
                        <button
                            key={q || "major"}
                            onClick={() => handleQualityToggle(q)}
                            className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
                                quality === q
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            {q === "" ? "Major" : "Minor"}
                        </button>
                    ))}
                </div>

                {/* Note grid — 4x3 */}
                <div className="grid grid-cols-4 gap-1.5">
                    {NOTES.map((note) => {
                        const isSelected = currentNote === note && quality === currentQuality
                        return (
                            <button
                                key={note}
                                onClick={() => handleSelect(note)}
                                className={`py-2 rounded text-sm font-mono transition-colors ${
                                    isSelected
                                        ? "bg-primary text-primary-foreground"
                                        : "bg-muted hover:bg-accent text-foreground"
                                }`}
                            >
                                {note}{quality}
                            </button>
                        )
                    })}
                </div>

                {/* Clear */}
                <Button
                    variant="ghost"
                    size="sm"
                    className="w-full mt-2 text-xs text-muted-foreground"
                    onClick={() => { onChange(""); setOpen(false) }}
                >
                    Clear
                </Button>
            </PopoverContent>
        </Popover>
    )
}
