"use client"

import { MatrixInfo } from "@/types/monitor"
import { FaderStrip } from "@/components/monitor/FaderStrip"
import { Grid3X3 } from "lucide-react"

interface MatrixPanelProps {
    matrices: MatrixInfo[]
    onFaderChange: (matrixIndex: number, value: number) => void
    onToggle: (matrixIndex: number, on: boolean) => void
}

/**
 * Matrix output level/mute controls.
 * Sound engineers only — controls the X32's 6 matrix outputs.
 * These typically feed house speakers, lobby, stream, recording, etc.
 */
export function MatrixPanel({ matrices, onFaderChange, onToggle }: MatrixPanelProps) {
    if (matrices.length === 0) {
        return (
            <div className="text-center py-4 text-xs text-muted-foreground">
                Matrix data not available — bridge update may be required.
            </div>
        )
    }

    return (
        <div className="bg-card border border-border rounded-xl p-4">
            <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <Grid3X3 className="w-4 h-4" />
                Matrix Outputs
            </h2>
            <div className="space-y-1">
                {matrices.map(mtx => (
                    <FaderStrip
                        key={mtx.index}
                        label={mtx.name || `Matrix ${mtx.index}`}
                        value={mtx.fader}
                        on={mtx.on}
                        onChange={(val) => onFaderChange(mtx.index, val)}
                        onToggle={(on) => onToggle(mtx.index, on)}
                    />
                ))}
            </div>
        </div>
    )
}
