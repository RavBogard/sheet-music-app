import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Lock, Globe } from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from "@/components/ui/dialog"

interface NamePromptProps {
    isOpen: boolean
    onClose: () => void
    initialName: string
    initialIsPublic: boolean
    isLeader: boolean
    onConfirm: (name: string, isPublic: boolean) => void
}

export function NamePrompt({
    isOpen,
    onClose,
    initialName,
    initialIsPublic,
    isLeader,
    onConfirm
}: NamePromptProps) {
    const [name, setName] = useState(initialName)
    const [isPublic, setIsPublic] = useState(initialIsPublic)

    const handleConfirm = () => {
        if (name.trim()) {
            onConfirm(name, isPublic)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="bg-zinc-900 border-zinc-800 text-white sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-bold">Name Your Setlist</DialogTitle>
                </DialogHeader>

                <div className="py-4 space-y-6">
                    <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g., Shabbat Morning, Friday Night..."
                        className="text-xl h-12"
                        autoFocus
                        onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
                    />

                    {/* Public/Private Toggle */}
                    <div className="flex items-center gap-4 p-4 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
                        <button
                            onClick={() => setIsPublic(false)}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg transition-colors ${!isPublic ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-zinc-400 hover:text-white hover:bg-zinc-700/50'
                                }`}
                        >
                            <Lock className="h-4 w-4" />
                            Personal
                        </button>
                        {isLeader ? (
                            <button
                                onClick={() => setIsPublic(true)}
                                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg transition-colors ${isPublic ? 'bg-green-600 text-white shadow-lg shadow-green-900/20' : 'text-zinc-400 hover:text-white hover:bg-zinc-700/50'
                                    }`}
                            >
                                <Globe className="h-4 w-4" />
                                Public
                            </button>
                        ) : (
                            <div className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-zinc-600 cursor-not-allowed opacity-50" title="Only Leaders can create Public Setlists">
                                <Globe className="h-4 w-4" />
                                Public
                            </div>
                        )}
                    </div>
                </div>

                <DialogFooter className="flex gap-2 sm:gap-0">
                    <Button onClick={onClose} variant="ghost" className="flex-1 sm:flex-none">Cancel</Button>
                    <Button onClick={handleConfirm} className="flex-1 sm:flex-none" disabled={!name.trim()}>
                        Continue
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
