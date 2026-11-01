"use client"

import { User, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MusicianProfile } from "@/types/models"
import { INSTRUMENT_PRESETS } from "@/lib/musician-profile"
import { instrumentLabel } from "@/lib/instrument-labels"
import { useT } from "@/i18n/client"

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
    const t = useT()
    return (
        <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">{t("setlistPrint.printFor")}</label>

            {/* Standard */}
            <label className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors">
                <input
                    type="radio" name="printMode" value="standard"
                    checked={printMode === "standard"}
                    onChange={() => setPrintMode("standard")}
                    className="accent-primary"
                />
                <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{t("setlistPrint.modeGeneric")}</span>
                    <span className="text-xs text-muted-foreground ms-2">{t("setlistPrint.modeGenericHint")}</span>
                </div>
            </label>

            {/* Just Me */}
            {hasMyProfile && (
                <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    printMode === "just-me"
                        ? "border-brand/50 bg-brand/5"
                        : "border-border hover:bg-muted/50"
                }`}>
                    <input
                        type="radio" name="printMode" value="just-me"
                        checked={printMode === "just-me"}
                        onChange={() => setPrintMode("just-me")}
                        className="accent-brand"
                    />
                    <User className="h-4 w-4 text-brand shrink-0" />
                    <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium">{t("setlistPrint.modeJustMe")}</span>
                        <span className="text-xs text-muted-foreground ms-2">{myLabel}</span>
                    </div>
                </label>
            )}

            {/* Select Musicians */}
            {musicians.length > 0 && (
                <div className={`rounded-lg border transition-colors ${
                    printMode === "select-musicians"
                        ? "border-brand/50 bg-brand/5"
                        : "border-border"
                }`}>
                    <label className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30 rounded-t-lg">
                        <input
                            type="radio" name="printMode" value="select-musicians"
                            checked={printMode === "select-musicians"}
                            onChange={() => setPrintMode("select-musicians")}
                            className="accent-brand"
                        />
                        <Users className="h-4 w-4 text-brand shrink-0" />
                        <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium">{t("setlistPrint.modePerMusician")}</span>
                            {printMode === "select-musicians" && selectedUids.length > 0 && (
                                <span className="text-xs text-brand ms-2">
                                    {selectedUids.length > 1
                                        ? t("setlistPrint.selectedCountZip", { count: selectedUids.length })
                                        : t("setlistPrint.selectedCount", { count: selectedUids.length })}
                                </span>
                            )}
                        </div>
                    </label>

                    {printMode === "select-musicians" && (
                        <div className="px-3 pb-3 space-y-1">
                            <div className="flex gap-2 mb-2">
                                <Button
                                    variant="link"
                                    size="xs"
                                    onClick={() => setSelectedUids(musicians.map(m => m.uid))}
                                    className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
                                >
                                    {t("setlistPrint.selectAll")}
                                </Button>
                                <span className="text-muted-foreground/30">·</span>
                                <Button
                                    variant="link"
                                    size="xs"
                                    onClick={() => setSelectedUids([])}
                                    className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
                                >
                                    {t("setlistPrint.deselectAll")}
                                </Button>
                            </div>
                            {musicians.map(m => {
                                const preset = m.profile.instrument ? INSTRUMENT_PRESETS[m.profile.instrument] : null
                                return (
                                    <label key={m.uid} className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-muted/50 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={selectedUids.includes(m.uid)}
                                            onChange={() => toggleMusician(m.uid)}
                                            className="accent-brand w-4 h-4 rounded"
                                        />
                                        <span className="text-sm">{m.displayName}</span>
                                        {preset && m.profile.instrument && <span className="text-xs text-muted-foreground">({instrumentLabel(m.profile.instrument, t)})</span>}
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
