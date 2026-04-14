"use client"

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    DropdownMenuSub,
    DropdownMenuSubTrigger,
    DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import {
    MoreVertical,
    Play,
    Bell,
    Check,
    Sparkles,
    Trash2,
    Clock,
    User,
    Printer,
    BookmarkPlus,
    Pencil,
} from "lucide-react"
import { useCongregation } from "@/lib/congregation-store"

interface OverflowMenuProps {
    // Actions
    onPerform?: () => void
    onPublish?: () => void
    onOpenAI: () => void
    onDelete?: () => void
    onEditDetails?: () => void
    onSaveAsTemplate?: () => void
    onSetRabbi?: (rabbi: string) => void
    onPrint?: () => void

    // State
    isBandLeader: boolean
    canEdit: boolean
    setlistId?: string
    rabbi?: string
    estimatedMinutes?: number
    songCount?: number
}

export function OverflowMenu({
    onPerform,
    onPublish,
    onOpenAI,
    onDelete,
    onEditDetails,
    onSaveAsTemplate,
    onSetRabbi,
    onPrint,
    isBandLeader,
    canEdit,
    setlistId,
    rabbi,
    estimatedMinutes,
    songCount,
}: OverflowMenuProps) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="h-10 w-10 shrink-0">
                    <MoreVertical className="h-5 w-5" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
                {/* Primary action */}
                {onPerform && setlistId && (
                    <>
                        <DropdownMenuItem onClick={onPerform} className="text-green-600 dark:text-green-400 font-medium">
                            <Play className="h-4 w-4 mr-2" />
                            Perform
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                    </>
                )}

                {/* Info line */}
                {estimatedMinutes !== undefined && estimatedMinutes > 0 && (
                    <>
                        <div className="px-2 py-1.5 text-xs text-muted-foreground flex items-center gap-2">
                            <Clock className="h-3 w-3" />
                            Est. {Math.round(estimatedMinutes)} min · {songCount ?? 0} song{songCount !== 1 ? "s" : ""}
                        </div>
                        <DropdownMenuSeparator />
                    </>
                )}

                {/* Leader actions — Publish / Edit Details / Save as Template */}
                {onPublish && isBandLeader && setlistId && (
                    <DropdownMenuItem onClick={onPublish}>
                        <Bell className="h-4 w-4 mr-2" />
                        Publish & Notify
                    </DropdownMenuItem>
                )}

                {canEdit && onEditDetails && (
                    <DropdownMenuItem onClick={onEditDetails}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit Details
                    </DropdownMenuItem>
                )}

                {canEdit && onSaveAsTemplate && (
                    <DropdownMenuItem onClick={onSaveAsTemplate}>
                        <BookmarkPlus className="h-4 w-4 mr-2" />
                        Save as Template
                    </DropdownMenuItem>
                )}

                <DropdownMenuSeparator />

                {/* Settings */}
                <RabbiSubmenu canEdit={canEdit} rabbi={rabbi} onSetRabbi={onSetRabbi} />

                <DropdownMenuSeparator />

                {/* Tools */}
                {onPrint && (
                    <DropdownMenuItem onClick={onPrint} className="sm:hidden">
                        <Printer className="h-4 w-4 mr-2" />
                        Gig Packet
                    </DropdownMenuItem>
                )}

                <DropdownMenuItem onClick={onOpenAI}>
                    <Sparkles className="h-4 w-4 mr-2" />
                    AI Assistant
                </DropdownMenuItem>

                {/* Danger zone */}
                {canEdit && onDelete && (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={onDelete} className="text-red-500 focus:text-red-500">
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete Setlist
                        </DropdownMenuItem>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

function RabbiSubmenu({
    canEdit,
    rabbi,
    onSetRabbi,
}: {
    canEdit: boolean
    rabbi?: string
    onSetRabbi?: (rabbi: string) => void
}) {
    const congregation = useCongregation()
    const rabbiProfiles = congregation?.scheduling?.rabbiProfiles ?? []

    if (!canEdit || !onSetRabbi) return null

    return (
        <DropdownMenuSub>
            <DropdownMenuSubTrigger>
                <User className="h-4 w-4 mr-2" />
                {rabbi ? `Rabbi: ${rabbi}` : "Assign Rabbi"}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
                {rabbiProfiles.map((rp) => (
                    <DropdownMenuItem key={rp.name} onClick={() => onSetRabbi(rp.name)}>
                        {rabbi === rp.name && <Check className="h-3 w-3 mr-2" />}
                        <span className={rabbi === rp.name ? "font-medium" : ""}>Rabbi {rp.name}</span>
                    </DropdownMenuItem>
                ))}
                {rabbiProfiles.length > 0 && <DropdownMenuSeparator />}
                <DropdownMenuItem onClick={() => onSetRabbi("")}>
                    Clear
                </DropdownMenuItem>
            </DropdownMenuSubContent>
        </DropdownMenuSub>
    )
}
