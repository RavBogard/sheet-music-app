import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Calendar as CalendarIcon } from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { useCongregation } from "@/lib/congregation-store"

export interface EditDetailsPatch {
    name: string
    date: Date | null
    rabbi: string
    serviceNotes: string
}

interface EditDetailsProps {
    isOpen: boolean
    onClose: () => void
    initialName: string
    initialDate: Date | null
    initialRabbi: string
    initialServiceNotes: string
    onConfirm: (patch: EditDetailsPatch) => void
}

// Sentinel for the "no rabbi" option — shadcn Select disallows empty-string values.
const NO_RABBI = "__none__"

export function EditDetails({
    isOpen,
    onClose,
    initialName,
    initialDate,
    initialRabbi,
    initialServiceNotes,
    onConfirm,
}: EditDetailsProps) {
    const congregation = useCongregation()
    const rabbiProfiles = congregation?.scheduling?.rabbiProfiles ?? []

    const [name, setName] = useState(initialName)
    const [date, setDate] = useState<Date | undefined>(initialDate ?? undefined)
    const [rabbi, setRabbi] = useState(initialRabbi)
    const [serviceNotes, setServiceNotes] = useState(initialServiceNotes)

    // Re-seed local state every time the modal opens so a stale draft doesn't
    // bleed across Edit Details sessions. Deps are intentionally limited to
    // `isOpen` — including the initial* props would clobber the user's
    // in-progress edits whenever the parent re-rendered with a new Date
    // instance or similar.
    useEffect(() => {
        if (!isOpen) return
        setName(initialName)
        setDate(initialDate ?? undefined)
        setRabbi(initialRabbi)
        setServiceNotes(initialServiceNotes)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen])

    const canSave = name.trim().length > 0

    const handleSave = () => {
        if (!canSave) return
        onConfirm({
            name: name.trim(),
            date: date ?? null,
            rabbi,
            serviceNotes,
        })
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="bg-card border-border text-foreground sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold">Edit Setlist Details</DialogTitle>
                </DialogHeader>

                <div className="py-3 space-y-4">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Name</label>
                        <Input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && canSave) {
                                    e.preventDefault()
                                    handleSave()
                                }
                            }}
                            placeholder="Setlist name"
                            aria-label="Setlist name"
                            className="text-base h-11 bg-background/50 border-border"
                            autoFocus
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-medium text-muted-foreground">Date (optional)</label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        className={cn(
                                            "w-full justify-start text-left font-normal bg-background/50 border-border",
                                            !date && "text-muted-foreground"
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {date ? format(date, "PPP") : "Pick a date"}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0 bg-card border-border" align="start">
                                    <Calendar
                                        mode="single"
                                        selected={date}
                                        onSelect={setDate}
                                        initialFocus
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-medium text-muted-foreground">Rabbi (optional)</label>
                            <Select
                                value={rabbi || NO_RABBI}
                                onValueChange={(v) => setRabbi(v === NO_RABBI ? "" : v)}
                            >
                                <SelectTrigger className="bg-background/50">
                                    <SelectValue placeholder="Select rabbi" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NO_RABBI}>None</SelectItem>
                                    {rabbiProfiles.map((rp) => (
                                        <SelectItem key={rp.name} value={rp.name}>{rp.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Service notes (optional)</label>
                        <Textarea
                            value={serviceNotes}
                            onChange={(e) => setServiceNotes(e.target.value)}
                            placeholder="e.g., Bar Mitzvah for Sam, extra musicians joining…"
                            className="min-h-[80px] bg-background/50 border-border resize-none"
                            maxLength={500}
                        />
                    </div>
                </div>

                <DialogFooter className="flex gap-2 sm:gap-2">
                    <Button onClick={onClose} variant="ghost" className="flex-1 sm:flex-none">Cancel</Button>
                    <Button onClick={handleSave} disabled={!canSave} className="flex-1 sm:flex-none">
                        Save
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
