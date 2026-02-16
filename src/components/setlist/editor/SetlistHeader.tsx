import { ChevronLeft, Printer, Globe, Lock, Sparkles, Download, Check, RotateCcw, RotateCw, Radio } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useChatStore } from "@/lib/chat-store"
import type { PresenceEntry } from "@/lib/setlist-live"

interface SetlistHeaderProps {
    name: string
    onNameChange: (name: string) => void
    onBack: () => void
    onPrint: () => void
    canEdit: boolean
    isEditMode: boolean
    onToggleEditMode: () => void
    isPublic: boolean
    onTogglePublic: () => void
    isLeader: boolean
    setlistId?: string
    saving: boolean
    lastSaved: Date | null
    isSyncing: boolean
    isFullyOffline: boolean
    onSync: () => void
    undo?: () => void
    redo?: () => void
    canUndo?: boolean
    canRedo?: boolean
    presence?: PresenceEntry[]
    liveEnabled?: boolean
    onToggleLive?: () => void
}

export function SetlistHeader({
    name,
    onNameChange,
    onBack,
    onPrint,
    canEdit,
    isEditMode,
    onToggleEditMode,
    isPublic,
    onTogglePublic,
    isLeader,
    setlistId,
    saving,
    lastSaved,
    isSyncing,
    isFullyOffline,
    onSync,
    undo,
    redo,
    canUndo,
    canRedo,
    presence = [],
    liveEnabled,
    onToggleLive
}: SetlistHeaderProps) {
    const { toggle, isOpen: isChatOpen } = useChatStore()

    return (
        <div className="h-20 glass flex items-center px-4 gap-3 z-10 relative">
            <Button size="icon" variant="ghost" className="h-12 w-12" onClick={onBack}>
                <ChevronLeft className="h-8 w-8" />
            </Button>

            {isEditMode ? (
                <Input
                    value={name}
                    onChange={(e) => onNameChange(e.target.value)}
                    className="text-2xl font-bold bg-transparent border-0 flex-1 h-auto focus-visible:ring-0"
                    placeholder="Setlist name"
                />
            ) : (
                <h1 className="text-2xl font-bold flex-1">{name}</h1>
            )}

            {/* Presence Avatars */}
            {presence.length > 0 && (
                <div className="flex items-center -space-x-2 shrink-0" aria-label={`${presence.length} ${presence.length === 1 ? 'person' : 'people'} viewing: ${presence.map(p => p.displayName).join(", ")}`} role="status">
                    {presence.slice(0, 4).map(p => (
                        <div key={p.uid} className="w-7 h-7 rounded-full bg-violet-500/20 border-2 border-background flex items-center justify-center text-[10px] font-bold text-violet-400">
                            {p.displayName.charAt(0).toUpperCase()}
                        </div>
                    ))}
                    {presence.length > 4 && (
                        <div className="w-7 h-7 rounded-full bg-muted border-2 border-background flex items-center justify-center text-[10px] font-medium text-muted-foreground">
                            +{presence.length - 4}
                        </div>
                    )}
                </div>
            )}

            {/* Live Toggle (leaders only) */}
            {isLeader && onToggleLive && (
                <Button
                    size="sm"
                    variant={liveEnabled ? "default" : "outline"}
                    onClick={onToggleLive}
                    aria-pressed={liveEnabled}
                    aria-label={liveEnabled ? "Disable live sync" : "Enable live sync"}
                    className={`gap-1.5 shrink-0 ${liveEnabled ? "bg-red-600 hover:bg-red-500 text-white" : ""}`}
                >
                    <Radio className={`h-3.5 w-3.5 ${liveEnabled ? "animate-pulse" : ""}`} />
                    <span className="text-xs font-semibold">{liveEnabled ? "LIVE" : "Go Live"}</span>
                </Button>
            )}

            {/* Print Button */}
            <Button
                size="icon"
                variant="ghost"
                onClick={onPrint}
                className="h-10 w-10 hidden sm:flex"
                title="Print setlist"
            >
                <Printer className="h-5 w-5" />
            </Button>

            {/* Undo/Redo - Edit Mode Only */}
            {isEditMode && (
                <div className="flex items-center gap-1 bg-muted rounded-lg p-1 mr-2">
                    <Button
                        size="icon"
                        variant="ghost"
                        onClick={undo}
                        disabled={!canUndo}
                        className="h-8 w-8 hover:bg-accent"
                        title="Undo"
                    >
                        <RotateCcw className="h-4 w-4" />
                    </Button>
                    <Button
                        size="icon"
                        variant="ghost"
                        onClick={redo}
                        disabled={!canRedo}
                        className="h-8 w-8 hover:bg-accent"
                        title="Redo"
                    >
                        <RotateCw className="h-4 w-4" />
                    </Button>
                </div>
            )}

            {/* Edit Mode Toggle */}
            {canEdit && (
                <Button
                    variant={isEditMode ? "default" : "secondary"}
                    onClick={onToggleEditMode}
                    className={`min-w-[80px] ${isEditMode ? 'bg-blue-600 hover:bg-blue-500' : 'bg-muted text-foreground'}`}
                >
                    {isEditMode ? "Done" : "Edit"}
                </Button>
            )}

            {/* AI Toggle */}
            <Button
                size="icon"
                variant="ghost"
                onClick={toggle}
                className={`h-10 w-10 ${isChatOpen ? 'text-blue-400 bg-blue-400/10' : 'text-muted-foreground'}`}
                title="AI Assistant"
            >
                <Sparkles className="h-5 w-5" />
            </Button>

            {/* Public/Private - Only show in Edit Mode or if Leader */}
            {(isEditMode && setlistId) || (isLeader && !isEditMode && setlistId) ? (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onTogglePublic}
                    className={`gap-2 rounded-full transition-colors hidden sm:flex ${isPublic ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'} ${!isPublic && !isLeader ? 'opacity-50 cursor-not-allowed' : ''}`}
                    disabled={!isPublic && !isLeader}
                >
                    {isPublic ? <Globe className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                    <span className="hidden lg:inline">{isPublic ? 'Public' : 'Personal'}</span>
                </Button>
            ) : null}


            {/* Sync Button - Only in Edit Mode */}
            {isEditMode && (
                <Button
                    size="sm"
                    variant={isFullyOffline ? "default" : "secondary"}
                    onClick={onSync}
                    disabled={isSyncing || isFullyOffline}
                    className={`gap-2 hidden sm:flex ${isFullyOffline ? 'bg-green-600 hover:bg-green-700' : ''}`}
                >
                    {isSyncing ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent" />
                    ) : isFullyOffline ? (
                        <Check className="h-4 w-4" />
                    ) : (
                        <Download className="h-4 w-4" />
                    )}
                    <span className="hidden lg:inline">{isSyncing ? "Syncing..." : isFullyOffline ? "Offline Ready" : "Download"}</span>
                </Button>
            )}

            {/* Save Status - Only in Edit Mode */}
            {isEditMode && (
                <>
                    <div className="hidden md:block text-sm text-muted-foreground whitespace-nowrap">
                        {saving ? "Saving..." : lastSaved ? `Saved` : ""}
                    </div>
                </>
            )}
        </div>
    )
}
