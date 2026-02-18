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
    Printer,
    Bell,
    Copy,
    Globe,
    Lock,
    History,
    Download,
    Check,
    ListChecks,
    Sparkles,
    Radio,
    Trash2,
    Clock,
    User,
} from "lucide-react"

interface OverflowMenuProps {
    // Actions
    onPerform?: () => void
    onPrint: () => void
    onPublish?: () => void
    onDuplicate?: () => void
    onTogglePublic: () => void
    onHistory?: () => void
    onSync?: () => void
    onOpenAI: () => void
    onToggleLive?: () => void
    onDelete?: () => void
    onSelectMode?: () => void
    onSetRabbi?: (rabbi: string) => void

    // State
    isPublic: boolean
    isLeader: boolean
    canEdit: boolean
    setlistId?: string
    rabbi?: string
    liveEnabled?: boolean
    isSyncing?: boolean
    isFullyOffline?: boolean
    estimatedMinutes?: number
    songCount?: number
}

export function OverflowMenu({
    onPerform,
    onPrint,
    onPublish,
    onDuplicate,
    onTogglePublic,
    onHistory,
    onSync,
    onOpenAI,
    onToggleLive,
    onDelete,
    onSelectMode,
    onSetRabbi,
    isPublic,
    isLeader,
    canEdit,
    setlistId,
    rabbi,
    liveEnabled,
    isSyncing,
    isFullyOffline,
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

                {/* Sharing & Publishing */}
                <DropdownMenuItem onClick={onPrint}>
                    <Printer className="h-4 w-4 mr-2" />
                    Print Gig Packets
                </DropdownMenuItem>

                {onPublish && isLeader && setlistId && (
                    <DropdownMenuItem onClick={onPublish}>
                        <Bell className="h-4 w-4 mr-2" />
                        Publish & Notify
                    </DropdownMenuItem>
                )}

                {onDuplicate && (
                    <DropdownMenuItem onClick={onDuplicate}>
                        <Copy className="h-4 w-4 mr-2" />
                        Duplicate Setlist
                    </DropdownMenuItem>
                )}

                {canEdit && onSelectMode && (
                    <DropdownMenuItem onClick={onSelectMode}>
                        <ListChecks className="h-4 w-4 mr-2" />
                        Select Items
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
                            {["Daniel", "Karen"].map((r) => (
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

                {canEdit && setlistId && (
                    <DropdownMenuItem onClick={onTogglePublic} disabled={!isPublic && !isLeader}>
                        {isPublic ? <Lock className="h-4 w-4 mr-2" /> : <Globe className="h-4 w-4 mr-2" />}
                        {isPublic ? "Make Private" : "Make Public"}
                    </DropdownMenuItem>
                )}

                {isLeader && setlistId && onHistory && (
                    <DropdownMenuItem onClick={onHistory}>
                        <History className="h-4 w-4 mr-2" />
                        Version History
                    </DropdownMenuItem>
                )}

                {canEdit && onSync && (
                    <DropdownMenuItem onClick={onSync} disabled={isSyncing || isFullyOffline}>
                        {isFullyOffline ? (
                            <Check className="h-4 w-4 mr-2 text-green-500" />
                        ) : (
                            <Download className="h-4 w-4 mr-2" />
                        )}
                        {isSyncing ? "Syncing..." : isFullyOffline ? "Offline Ready" : "Download for Offline"}
                    </DropdownMenuItem>
                )}

                <DropdownMenuSeparator />

                {/* Tools */}
                <DropdownMenuItem onClick={onOpenAI}>
                    <Sparkles className="h-4 w-4 mr-2" />
                    AI Assistant
                </DropdownMenuItem>

                {isLeader && onToggleLive && (
                    <DropdownMenuItem onClick={onToggleLive}>
                        <Radio className={`h-4 w-4 mr-2 ${liveEnabled ? "text-red-500" : ""}`} />
                        {liveEnabled ? "Stop Live Sync" : "Go Live"}
                    </DropdownMenuItem>
                )}

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
