import { useEffect, useState } from "react"
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
import { useT, useFormat } from "@/i18n/client"
import { cn } from "@/lib/utils"

interface NamePromptProps {
    isOpen: boolean
    onClose: () => void
    initialName: string
    initialDate?: Date | null
    onConfirm: (name: string, date: Date | null) => void
}

export function NamePrompt({
    isOpen,
    onClose,
    initialName,
    initialDate,
    onConfirm
}: NamePromptProps) {
    const t = useT()
    const fmt = useFormat()
    const [name, setName] = useState(initialName)
    const [date, setDate] = useState<Date | undefined>(initialDate || undefined)

    // Re-seed on every false -> true open transition so a prior session's
    // typed-but-not-confirmed draft doesn't bleed into a new setlist name.
    // Deps intentionally limited to `isOpen` to avoid clobbering in-progress
    // edits when the parent re-renders.
    useEffect(() => {
        if (!isOpen) return
        setName(initialName)
        setDate(initialDate || undefined)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen])

    const handleConfirm = () => {
        if (name.trim()) {
            onConfirm(name, date || null)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="bg-card border-border text-foreground sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-bold">{t("setlistModals.nameYourSetlist")}</DialogTitle>
                </DialogHeader>

                <div className="py-4 space-y-6">
                    <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={t("setlistModals.namePromptPlaceholder")}
                        aria-label={t("setlistModals.setlistNameAria")}
                        className="text-xl h-12 bg-background/50 border-border"
                        autoFocus
                        onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
                    />

                    <div className="grid grid-cols-2 gap-4">
                        {/* Date Picker */}
                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-medium text-muted-foreground">{t("setlistModals.dateOptionalLabelTitle")}</label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant={"outline"}
                                        className={cn(
                                            "w-full justify-start text-start font-normal bg-background/50 border-border",
                                            !date && "text-muted-foreground"
                                        )}
                                    >
                                        <CalendarIcon className="me-2 h-4 w-4" />
                                        {date ? fmt.pattern(date, "PPP") : <span>{t("setlistModals.pickDate")}</span>}
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
                    <Button onClick={onClose} variant="ghost" className="flex-1 sm:flex-none">{t("setlistModals.cancel")}</Button>
                    <Button onClick={handleConfirm} className="flex-1 sm:flex-none" disabled={!name.trim()}>
                        {t("setlistModals.continue")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
