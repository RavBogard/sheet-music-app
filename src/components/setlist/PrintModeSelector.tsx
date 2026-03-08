"use client"

import { User, Users } from "lucide-react"
import { MusicianProfile } from "@/types/models"
import { INSTRUMENT_PRESETS } from "@/lib/musician-profile"

export type PrintMode = "standard" | "just-me" | "select-musicians"

interface PrintModeSelectorProps {
    printMode: PrintMode
    setPrintMode: (mode: PrintMode) => void
    hasMyProfile: boolean
    myLabel: string | null
    musicians: { uid: string; displayName: string; profile: MusicianProfile }[]
    selectedUids: string[]
    setSelectedUids: (uids: string[]) => void
    toggleMusician: (uid: string) => void
}

export function PrintModeSelector({
    printMode, setPrintMode,
    hasMyProfile, myLabel,
    musicians, selectedUids, setSelectedUids, toggleMusician,
}: PrintModeSelectorProps) {
    return (
        <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Print for:</label>

            {/* Standard */}
            <label className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors">
                <input
                    type="radio" name="printMode" value="standard"
                    checked={printMode === "standard"}
                    onChange={() => setPrintMode("standard")}
                    className="accent-blue-500"
                />
                <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">Generic (concert pitch)</span>
                    <span className="text-xs text-muted-foreground ml-2">For guests, no transposition</span>
                </div>
            </label>

            {/* Just Me */}
            {hasMyProfile && (
                <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    printMode === "just-me"
                        ? "border-violet-500/50 bg-violet-500/5"
                        : "border-border hover:bg-muted/50"
                }`}>
                    <input
                        type="radio" name="printMode" value="just-me"
                        checked={printMode === "just-me"}
                        onChange={() => setPrintMode("just-me")}
                        className="accent-violet-500"
                    />
                    <User className="h-4 w-4 text-violet-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium">Personalized (transposed)</span>
                        <span className="text-xs text-muted-foreground ml-2">{myLabel}</span>
                    </div>
                </label>
            )}

            {/* Select Musicians */}
            {musicians.length > 0 && (
                <div className={`rounded-lg border transition-colors ${
                    printMode === "select-musicians"
                        ? "border-violet-500/50 bg-violet-500/5"
                        : "border-border"
                }`}>
                    <label className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30 rounded-t-lg">
                        <input
                            type="radio" name="printMode" value="select-musicians"
                            checked={printMode === "select-musicians"}
                            onChange={() => setPrintMode("select-musicians")}
                            className="accent-violet-500"
                        />
                        <Users className="h-4 w-4 text-violet-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium">Personalized (per musician)</span>
                            {printMode === "select-musicians" && selectedUids.length > 0 && (
                                <span className="text-xs text-violet-500 ml-2">
                                    {selectedUids.length} selected
                                    {selectedUids.length > 1 && " → ZIP"}
                                </span>
                            )}
                        </div>
                    </label>

                    {printMode === "select-musicians" && (
                        <div className="px-3 pb-3 space-y-1">
                            <div className="flex gap-2 mb-2">
                                <button
                                    onClick={() => setSelectedUids(musicians.map(m => m.uid))}
                                    className="text-xs text-muted-foreground hover:text-foreground"
                                >
                                    Select all
                                </button>
                                <span className="text-muted-foreground/30">·</span>
                                <button
                                    onClick={() => setSelectedUids([])}
                                    className="text-xs text-muted-foreground hover:text-foreground"
                                >
                                    Deselect all
                                </button>
                            </div>
                            {musicians.map(m => {
                                const preset = m.profile.instrument ? INSTRUMENT_PRESETS[m.profile.instrument] : null
                                return (
                                    <label key={m.uid} className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-muted/50 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={selectedUids.includes(m.uid)}
                                            onChange={() => toggleMusician(m.uid)}
                                            className="accent-violet-600 w-4 h-4 rounded"
                                        />
                                        <span className="text-sm">{m.displayName}</span>
                                        {preset && <span className="text-xs text-muted-foreground">({preset.label})</span>}
                                    </label>
                                )
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
