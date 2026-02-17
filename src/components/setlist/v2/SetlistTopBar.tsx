"use client"

import { ChevronLeft, MoreVertical } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useState, useRef, useEffect } from "react"

interface SetlistTopBarProps {
    name: string
    onNameChange: (name: string) => void
    onBack: () => void
    canEdit: boolean
    saving: boolean
    lastSaved: Date | null
    overflowTrigger: React.ReactNode
}

export function SetlistTopBar({
    name,
    onNameChange,
    onBack,
    canEdit,
    saving,
    lastSaved,
    overflowTrigger,
}: SetlistTopBarProps) {
    const [editing, setEditing] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (editing && inputRef.current) {
            inputRef.current.focus()
            inputRef.current.select()
        }
    }, [editing])

    return (
        <div className="h-14 flex items-center px-3 gap-2 border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-30">
            <Button size="icon" variant="ghost" className="h-10 w-10 shrink-0" onClick={onBack}>
                <ChevronLeft className="h-6 w-6" />
            </Button>

            <div className="flex-1 min-w-0">
                {editing && canEdit ? (
                    <Input
                        ref={inputRef}
                        value={name}
                        onChange={(e) => onNameChange(e.target.value)}
                        onBlur={() => setEditing(false)}
                        onKeyDown={(e) => e.key === "Enter" && setEditing(false)}
                        className="text-lg font-semibold bg-transparent border-0 p-0 h-auto focus-visible:ring-0"
                        placeholder="Setlist name"
                    />
                ) : (
                    <button
                        className="text-lg font-semibold truncate block w-full text-left hover:text-foreground/80 transition-colors"
                        onClick={() => canEdit && setEditing(true)}
                        title={canEdit ? "Tap to rename" : undefined}
                    >
                        {name || "Untitled Setlist"}
                    </button>
                )}
            </div>

            {/* Save status dot */}
            <div className="shrink-0 flex items-center gap-2">
                {saving && (
                    <div className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse" title="Saving..." />
                )}
                {!saving && lastSaved && (
                    <div className="h-2 w-2 rounded-full bg-green-500" title={`Saved ${lastSaved.toLocaleTimeString()}`} />
                )}
            </div>

            {/* Overflow menu trigger */}
            {overflowTrigger}
        </div>
    )
}
