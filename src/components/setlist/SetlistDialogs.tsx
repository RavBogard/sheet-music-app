"use client"

import { Loader2 } from "lucide-react"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useT } from "@/i18n/client"

/* ─── Delete Confirmation ─── */

interface DeleteDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    setlistName?: string
    onConfirm: () => void
}

export function DeleteSetlistDialog({ open, onOpenChange, setlistName, onConfirm }: DeleteDialogProps) {
    const t = useT()
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{t("setlist.deleteDialogTitle")}</AlertDialogTitle>
                    <AlertDialogDescription>
                        {t("setlist.deleteDialogQuestion", { name: setlistName })}{" "}{t("setlist.cannotBeUndone")}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>{t("setlist.cancel")}</AlertDialogCancel>
                    <AlertDialogAction onClick={onConfirm} className="bg-red-600 hover:bg-red-700">{t("setlist.delete")}</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}

/* ─── Duplicate Confirmation ─── */

interface DuplicateDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    setlistName?: string
    onConfirm: () => void
}

export function DuplicateSetlistDialog({ open, onOpenChange, setlistName, onConfirm }: DuplicateDialogProps) {
    const t = useT()
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{t("setlist.duplicateDialogTitle")}</AlertDialogTitle>
                    <AlertDialogDescription>
                        {t("setlist.duplicateDialogQuestion", { name: setlistName })}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>{t("setlist.cancel")}</AlertDialogCancel>
                    <AlertDialogAction onClick={onConfirm}>{t("setlist.duplicate")}</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}

/* ─── Transfer Ownership ─── */

interface TransferDialogProps {
    open: boolean
    onClose: () => void
    setlistName?: string
    email: string
    onEmailChange: (email: string) => void
    onConfirm: () => Promise<void> | void
    transferring?: boolean
}

export function TransferSetlistDialog({ open, onClose, setlistName, email, onEmailChange, onConfirm, transferring }: TransferDialogProps) {
    const t = useT()
    return (
        <AlertDialog
            open={open}
            onOpenChange={(next) => {
                if (!next && !transferring) onClose()
            }}
        >
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{t("setlist.transferDialogTitle")}</AlertDialogTitle>
                    <AlertDialogDescription>
                        {t("setlist.transferDialogBody", { name: setlistName })}{" "}{t("setlist.transferDialogLoseAccess")}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <input
                    type="email"
                    placeholder={t("setlist.transferEmailPlaceholder")}
                    className="w-full bg-background border border-border p-3 rounded-lg text-foreground"
                    value={email}
                    onChange={(e) => onEmailChange(e.target.value)}
                    disabled={transferring}
                />
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={transferring}>{t("setlist.cancel")}</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={(e) => {
                            // Prevent the primitive's auto-close so we can stay open
                            // while the async transfer resolves.
                            e.preventDefault()
                            onConfirm()
                        }}
                        disabled={!email || transferring}
                    >
                        {transferring && <Loader2 className="h-4 w-4 animate-spin me-2" />}
                        {transferring ? t("setlist.transferring") : t("setlist.transfer")}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
