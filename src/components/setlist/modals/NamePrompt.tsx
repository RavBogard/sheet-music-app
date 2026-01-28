import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Lock, Globe, Calendar as CalendarIcon } from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { format } from "date-fns"
import { cn } from "@/lib/utils"

interface NamePromptProps {
    isOpen: boolean
    onClose: () => void
    initialName: string
    initialIsPublic: boolean
    initialDate?: Date | null
    isLeader: boolean
    onConfirm: (name: string, isPublic: boolean, date: Date | null) => void
}

export function NamePrompt({
    isOpen,
    onClose,
    initialName,
    initialIsPublic,
    initialDate,
    isLeader,
    onConfirm
}: NamePromptProps) {
    const [name, setName] = useState(initialName)
    const [isPublic, setIsPublic] = useState(initialIsPublic)
    const [date, setDate] = useState<Date | undefined>(initialDate || undefined)

    const handleConfirm = () => {
        if (name.trim()) {
            onConfirm(name, isPublic, date || null)
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
                        className="text-xl h-12 bg-zinc-950/50 border-zinc-800"
                        autoFocus
                        onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
                    />

                    <div className="grid grid-cols-2 gap-4">
                        {/* Date Picker */}
                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-medium text-zinc-400">Date (Optional)</label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant={"outline"}
                                        className={cn(
                                            "w-full justify-start text-left font-normal bg-zinc-950/50 border-zinc-800",
                                            !date && "text-muted-foreground"
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {date ? format(date, "PPP") : <span>Pick a date</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0 bg-zinc-900 border-zinc-800" align="start">
                                    <Calendar
                                        mode="single"
                                        selected={date}
                                        onSelect={setDate}
                                        initialFocus
                                        className="text-white"
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>

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
