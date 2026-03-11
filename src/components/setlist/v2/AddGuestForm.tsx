"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface AddGuestFormProps {
    onAdd: (name: string, email: string, instrument?: string) => void
    onCancel: () => void
}

export function AddGuestForm({ onAdd, onCancel }: AddGuestFormProps) {
    const [guestName, setGuestName] = useState("")
    const [guestEmail, setGuestEmail] = useState("")
    const [guestInstrument, setGuestInstrument] = useState("")

    const handleSubmit = () => {
        if (!guestName.trim() || !guestEmail.trim()) return
        onAdd(guestName.trim(), guestEmail.trim(), guestInstrument.trim() || undefined)
        setGuestName("")
        setGuestEmail("")
        setGuestInstrument("")
    }

    return (
        <div className="space-y-2 p-3 bg-muted/30 rounded-lg border border-border/50">
            <p className="text-xs font-medium text-muted-foreground">Add Guest</p>
            <div className="grid grid-cols-2 gap-2">
                <Input
                    placeholder="Name"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    className="h-8 text-sm"
                />
                <Input
                    placeholder="Instrument"
                    value={guestInstrument}
                    onChange={(e) => setGuestInstrument(e.target.value)}
                    className="h-8 text-sm"
                />
            </div>
            <Input
                placeholder="Email"
                type="email"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                className="h-8 text-sm"
            />
            <div className="flex gap-2">
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel}>
                    Cancel
                </Button>
                <Button
                    size="sm"
                    className="h-7 text-xs"
                    onClick={handleSubmit}
                    disabled={!guestName.trim() || !guestEmail.trim()}
                >
                    Add
                </Button>
            </div>
        </div>
    )
}
