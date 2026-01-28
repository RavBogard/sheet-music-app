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

            {canEdit ? (
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
                className="h-10 w-10"
                title="Print setlist"
            >
                <Printer className="h-5 w-5" />
            </Button>

            {/* Public/Private toggle (clickable for owner or leader) */}
            {canEdit && setlistId ? (
                <button
                    onClick={onTogglePublic}
                    className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm transition-opacity ${isPublic ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'} ${!isPublic && !isLeader ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:opacity-80'}`}
                    title={!isPublic && !isLeader ? "Only Leaders can make setlists public" : "Click to toggle visibility"}
                    disabled={!isPublic && !isLeader}
                >
                    {isPublic ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                    {isPublic ? 'Public' : 'Personal'}
                </button>
            ) : (
                <div className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm ${isPublic ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'
                    }`}>
                    {isPublic ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                    {isPublic ? 'Public' : 'Personal'}
                </div>
            )}

            {!canEdit && (
                <div className="text-sm text-zinc-500">View Only</div>
            )}

            {/* Chat Toggle (Only Editors) */}
            {canEdit && (
                <Button
                    size="sm"
                    variant={isChatOpen ? "default" : "outline"}
                    onClick={toggle}
                    className={`gap-2 ${isChatOpen ? "bg-purple-600 hover:bg-purple-500" : "border-purple-500/50 text-purple-400 hover:bg-purple-500/10"}`}
                >
                    <Sparkles className="h-4 w-4" />
                    <span className="hidden sm:inline">AI Assistant</span>
                </Button>
            )}

            {/* Sync Button */}
            {canEdit && (
                <Button
                    size="sm"
                    variant={isFullyOffline ? "default" : "secondary"}
                    onClick={onSync}
                    disabled={isSyncing || isFullyOffline}
                    className={`gap-2 ${isFullyOffline ? 'bg-green-600 hover:bg-green-700' : ''}`}
                >
                    {isSyncing ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent" />
                    ) : isFullyOffline ? (
                        <Check className="h-4 w-4" />
                    ) : (
                        <Download className="h-4 w-4" />
                    )}
                    {isSyncing ? "Syncing..." : isFullyOffline ? "Offline Ready" : "Download All"}
                </Button>
            )}

            {canEdit && (
                <div className="text-sm text-zinc-500">
                    {saving ? "Saving..." : lastSaved ? `Saved ${lastSaved.toLocaleTimeString()}` : ""}
                </div>
            )}
        </div>
    )
}
