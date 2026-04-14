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
} from "lucide-react"

interface OverflowMenuProps {
    // Actions
    onPerform?: () => void
    onPublish?: () => void
    onOpenAI: () => void
    onDelete?: () => void
    onEditDetails?: () => void
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

                {onPublish && isBandLeader && setlistId && (
                    <DropdownMenuItem onClick={onPublish}>
                        <Bell className="h-4 w-4 mr-2" />
                        Publish & Notify
                    </DropdownMenuItem>
                )}

                {canEdit && onEditDetails && (
                    <DropdownMenuItem onClick={onEditDetails}>
                        <MoreVertical className="h-4 w-4 mr-2" />
                        Edit Details
                    </DropdownMenuItem>
                )}

                <DropdownMenuSeparator />

                {/* Settings */}
                {canEdit && onSetRabbi && (
                    <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                            <User className="h-4 w-4 mr-2" />
                            {rabbi ? `Rabbi: ${rabbi}` : "Assign Rabbi"}
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                            {["Daniel", "Karen", "Randy"].map((r) => (
                                <DropdownMenuItem key={r} onClick={() => onSetRabbi(r)}>
                                    {rabbi === r && <Check className="h-3 w-3 mr-2" />}
                                    <span className={rabbi === r ? "font-medium" : ""}>Rabbi {r}</span>
                                </DropdownMenuItem>
                            ))}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => onSetRabbi("")}>
                                Clear
                            </DropdownMenuItem>
                        </DropdownMenuSubContent>
                    </DropdownMenuSub>
                )}

                <DropdownMenuSeparator />

                {/* Tools */}
                {onPrint && (
                    <DropdownMenuItem onClick={onPrint} className="sm:hidden">
                        <Printer className="h-4 w-4 mr-2" />
                        Print Gig Packet
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
