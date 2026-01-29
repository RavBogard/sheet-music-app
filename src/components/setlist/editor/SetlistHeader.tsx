import { ChevronLeft, Printer, Globe, Lock, Sparkles, Download, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useChatStore } from "@/lib/chat-store"

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
    onSync
}: SetlistHeaderProps) {
    const { toggle, isOpen: isChatOpen } = useChatStore()

    return (
        <div className="h-20 glass flex items-center px-4 gap-4 z-10 relative">
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

            {/* Edit Mode Toggle */}
            {canEdit && (
                <Button
                    variant={isEditMode ? "default" : "secondary"}
                    onClick={onToggleEditMode}
                    className={`min-w-[80px] ${isEditMode ? 'bg-blue-600 hover:bg-blue-500' : 'bg-zinc-800 text-zinc-300'}`}
                >
                    {isEditMode ? "Done" : "Edit"}
                </Button>
            )}

            {/* AI Toggle */}
            <Button
                size="icon"
                variant="ghost"
                onClick={toggle}
                className={`h-10 w-10 ${isChatOpen ? 'text-blue-400 bg-blue-400/10' : 'text-zinc-400'}`}
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
                    <div className="hidden md:block text-sm text-zinc-500 whitespace-nowrap">
                        {saving ? "Saving..." : lastSaved ? `Saved` : ""}
                    </div>
                </>
            )}
        </div>
    )
}
