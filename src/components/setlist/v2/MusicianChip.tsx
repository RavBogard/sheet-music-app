"use client"

import { RefObject } from "react"
import { UserProfile, SchedulingAssignment } from "@/types/models"
import { INSTRUMENT_PRESETS } from "@/lib/musician-profile"
import { Star, Check, Clock, X, Mail, MailOpen, MailCheck, MailX } from "lucide-react"

interface EmailStatus {
    recipientEmail: string
    status: 'sent' | 'delivered' | 'opened' | 'bounced' | 'complained' | 'delayed'
}

const INSTRUMENT_OPTIONS = Object.entries(INSTRUMENT_PRESETS).map(([key, val]) => ({
    key,
    label: val.label,
}))

interface MusicianChipProps {
    user: UserProfile
    selected: boolean
    instrument: string | undefined
    isDefault: boolean
    schedulingStatus: SchedulingAssignment | undefined
    emailStatus: EmailStatus | null
    canEdit: boolean
    isAdmin: boolean
    showInstrumentPicker: boolean
    instrumentRef: RefObject<HTMLDivElement | null>
    onToggle: () => void
    onEditInstrument: () => void
    onSetInstrument: (instrument: string) => void
    onToggleDefault: () => void
}

export function MusicianChip({
    user,
    selected,
    instrument,
    isDefault,
    schedulingStatus,
    emailStatus,
    canEdit,
    isAdmin,
    showInstrumentPicker,
    instrumentRef,
    onToggle,
    onEditInstrument,
    onSetInstrument,
    onToggleDefault,
}: MusicianChipProps) {
    return (
        <div className="relative">
            <button
                onClick={onToggle}
                disabled={!canEdit}
                className={`
                    inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-sm
                    transition-all duration-150 border
                    ${selected
                        ? 'bg-primary/15 border-primary/40 text-foreground'
                        : 'bg-muted/30 border-border/50 text-muted-foreground hover:border-border'
                    }
                    ${!canEdit ? 'opacity-60 cursor-default' : 'cursor-pointer'}
                `}
            >
                {selected && (
                    <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                )}
                <span>{user.displayName || user.email?.split('@')[0]}</span>
                {instrument ? (
                    <span
                        className={`text-xs text-muted-foreground/60 ${selected && isAdmin ? 'underline decoration-dotted cursor-pointer' : ''}`}
                        onClick={(e) => {
                            if (selected && isAdmin) {
                                e.stopPropagation()
                                onEditInstrument()
                            }
                        }}
                    >
                        {instrument}
                    </span>
                ) : selected && isAdmin ? (
                    <span
                        className="text-xs text-muted-foreground/40 underline decoration-dotted cursor-pointer"
                        onClick={(e) => {
                            e.stopPropagation()
                            onEditInstrument()
                        }}
                    >
                        + instrument
                    </span>
                ) : null}
                {/* Default star — admins only */}
                {isAdmin && (
                    <span
                        className={`ml-0.5 cursor-pointer transition-colors ${isDefault
                            ? 'text-amber-400 hover:text-amber-300'
                            : 'text-muted-foreground/20 hover:text-muted-foreground/50'
                            }`}
                        onClick={(e) => {
                            e.stopPropagation()
                            onToggleDefault()
                        }}
                        title={isDefault ? 'Remove from default band' : 'Add to default band'}
                    >
                        <Star className={`h-3 w-3 ${isDefault ? 'fill-current' : ''}`} />
                    </span>
                )}
                {/* Scheduling status indicator */}
                {selected && schedulingStatus && (
                    <span title={`Scheduling: ${schedulingStatus.status}`}>
                        {schedulingStatus.status === 'confirmed' ? (
                            <Check className="h-3 w-3 text-emerald-500" />
                        ) : schedulingStatus.status === 'pending' ? (
                            <Clock className="h-3 w-3 text-amber-500" />
                        ) : schedulingStatus.status === 'declined' ? (
                            <X className="h-3 w-3 text-red-500" />
                        ) : null}
                    </span>
                )}
                {/* Email delivery status */}
                {selected && (() => {
                    if (!emailStatus) return null
                    const StatusIcon = emailStatus.status === 'opened' ? MailOpen
                        : emailStatus.status === 'delivered' ? MailCheck
                            : emailStatus.status === 'bounced' || emailStatus.status === 'complained' ? MailX
                                : Mail
                    const color = emailStatus.status === 'opened' ? 'text-blue-400'
                        : emailStatus.status === 'delivered' ? 'text-green-400'
                            : emailStatus.status === 'bounced' || emailStatus.status === 'complained' ? 'text-red-400'
                                : 'text-muted-foreground/40'
                    return (
                        <span title={`Email ${emailStatus.status}`}>
                            <StatusIcon className={`h-3 w-3 ${color}`} />
                        </span>
                    )
                })()}
            </button>

            {showInstrumentPicker && (
                <div
                    ref={instrumentRef}
                    className="absolute top-full left-0 mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg p-1 max-h-48 overflow-y-auto w-48"
                >
                    {INSTRUMENT_OPTIONS.map((opt) => (
                        <button
                            key={opt.key}
                            className="w-full text-left px-2.5 py-1.5 text-sm rounded hover:bg-muted/50 transition-colors"
                            onClick={() => onSetInstrument(opt.label)}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
