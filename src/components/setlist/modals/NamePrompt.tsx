import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Calendar as CalendarIcon } from "lucide-react"
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
    initialDate?: Date | null
    /** @deprecated No longer used */
    isBandLeader?: boolean
    onConfirm: (name: string, date: Date | null) => void
}

export function NamePrompt({
    isOpen,
    onClose,
    initialName,
    initialDate,
    onConfirm
}: NamePromptProps) {
    const [name, setName] = useState(initialName)
    const [date, setDate] = useState<Date | undefined>(initialDate || undefined)

    const handleConfirm = () => {
        if (name.trim()) {
            onConfirm(name, date || null)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="bg-card border-border text-foreground sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-bold">Name Your Setlist</DialogTitle>
                </DialogHeader>

                <div className="py-4 space-y-6">
                    <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g., Shabbat Morning, Friday Night..."
                        className="text-xl h-12 bg-background/50 border-border"
                        autoFocus
                        onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
                    />

                    <div className="grid grid-cols-2 gap-4">
                        {/* Date Picker */}
                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-medium text-muted-foreground">Date (Optional)</label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant={"outline"}
                                        className={cn(
                                            "w-full justify-start text-left font-normal bg-background/50 border-border",
                                            !date && "text-muted-foreground"
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {date ? format(date, "PPP") : <span>Pick a date</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0 bg-card border-border" align="start">
                                    <Calendar
                                        mode="single"
                                        selected={date}
                                        onSelect={setDate}
                                        initialFocus
                                        className="text-foreground"
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
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
