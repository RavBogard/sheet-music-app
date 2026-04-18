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

/* ─── Delete Confirmation ─── */

interface DeleteDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    setlistName?: string
    onConfirm: () => void
}

export function DeleteSetlistDialog({ open, onOpenChange, setlistName, onConfirm }: DeleteDialogProps) {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Delete Setlist?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Are you sure you want to delete &quot;{setlistName}&quot;? This action cannot be undone.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onConfirm} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
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
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Duplicate Setlist</AlertDialogTitle>
                    <AlertDialogDescription>
                        Create a personal copy of &quot;{setlistName}&quot;?
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onConfirm}>Duplicate</AlertDialogAction>
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
    return (
        <AlertDialog
            open={open}
            onOpenChange={(next) => {
                if (!next && !transferring) onClose()
            }}
        >
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Transfer Ownership</AlertDialogTitle>
                    <AlertDialogDescription>
                        Transferring <strong>{setlistName}</strong> to another user.
                        You will lose access unless they share it back with you.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <input
                    type="email"
                    placeholder="New Owner's Email"
                    className="w-full bg-background border border-border p-3 rounded-lg text-foreground"
                    value={email}
                    onChange={(e) => onEmailChange(e.target.value)}
                    disabled={transferring}
                />
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={transferring}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={(e) => {
                            // Prevent the primitive's auto-close so we can stay open
                            // while the async transfer resolves.
                            e.preventDefault()
                            onConfirm()
                        }}
                        disabled={!email || transferring}
                    >
                        {transferring && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        {transferring ? "Transferring..." : "Transfer"}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
