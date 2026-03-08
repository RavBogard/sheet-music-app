"use client"

import { ChevronLeft, Undo2, Redo2, Play, Printer } from "lucide-react"
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
    onUndo?: () => void
    onRedo?: () => void
    canUndo?: boolean
    canRedo?: boolean
    onPerform?: () => void
    onPrint?: () => void
    overflowTrigger: React.ReactNode
}

export function SetlistTopBar({
    name,
    onNameChange,
    onBack,
    canEdit,
    saving,
    lastSaved,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
    onPerform,
    onPrint,
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
        <div className="h-14 flex items-center px-3 gap-2 border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 md:top-16 z-30">
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

            {/* Save status dot — optimistic: green unless actively saving */}
            <div className="shrink-0 flex items-center gap-1">
                {lastSaved && !saving && (
                    <div className="h-2 w-2 rounded-full bg-success mr-1" title={`Saved ${lastSaved.toLocaleTimeString()}`} />
                )}
                {saving && (
                    <div className="h-2 w-2 rounded-full bg-success animate-pulse mr-1" title="Saving..." />
                )}
                {!lastSaved && !saving && (
                    <div className="h-2 w-2 rounded-full bg-muted-foreground/30 mr-1" title="Not yet saved" />
                )}

                {/* Undo / Redo */}
                {canEdit && onUndo && (
                    <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={onUndo}
                        disabled={!canUndo}
                        title="Undo"
                    >
                        <Undo2 className="h-4 w-4" />
                    </Button>
                )}
                {canEdit && onRedo && (
                    <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={onRedo}
                        disabled={!canRedo}
                        title="Redo"
                    >
                        <Redo2 className="h-4 w-4" />
                    </Button>
                )}
            </div>

            {/* Gig Packet action */}
            {onPrint && (
                <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
                    onClick={onPrint}
                    title="Generate Gig Packet"
                >
                    <Printer className="h-4 w-4" />
                    <span className="hidden sm:inline">Gig Packet</span>
                </Button>
            )}

            {/* Perform action */}
            {onPerform && (
                <Button
                    size="sm"
                    variant="default"
                    className="h-8 gap-1.5 bg-blue-600 hover:bg-blue-500 text-white shadow-sm"
                    onClick={onPerform}
                >
                    <Play className="h-4 w-4 fill-white" />
                    <span className="hidden sm:inline">Perform</span>
                </Button>
            )}

            {/* Overflow menu trigger */}
            {overflowTrigger}
        </div>
    )
}
