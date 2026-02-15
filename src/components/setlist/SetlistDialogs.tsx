"use client"

import { Button } from "@/components/ui/button"
import { Setlist } from "@/lib/setlist-firebase"
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
    onConfirm: () => void
}

export function TransferSetlistDialog({ open, onClose, setlistName, email, onEmailChange, onConfirm }: TransferDialogProps) {
    if (!open) return null

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-card border border-border p-6 rounded-xl max-w-md w-full space-y-4">
                <h3 className="text-xl font-bold">Transfer Ownership</h3>
                <p className="text-muted-foreground">
                    Transferring <strong>{setlistName}</strong> to another user.
                    You will lose access unless they share it back with you.
                </p>
                <input
                    type="email"
                    placeholder="New Owner's Email"
                    className="w-full bg-background border border-border p-3 rounded-lg text-foreground"
                    value={email}
                    onChange={(e) => onEmailChange(e.target.value)}
                />
                <div className="flex justify-end gap-2 mt-4">
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button onClick={onConfirm} disabled={!email}>Transfer</Button>
                </div>
            </div>
        </div>
    )
}
