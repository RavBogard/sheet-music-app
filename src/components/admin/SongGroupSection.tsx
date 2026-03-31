"use client"

import { useState } from "react"
import { useSongGroups } from "@/hooks/use-song-groups"
import { Button } from "@/components/ui/button"
import { Loader2, Music, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { logger } from "@/lib/logger"

export function SongGroupSection() {
    const { allGroups, loading, error } = useSongGroups()
    const [seeding, setSeeding] = useState(false)

    const handleSeed = async () => {
        setSeeding(true)
        try {
            const { auth: firebaseAuth } = await import("@/lib/firebase")
            const currentUser = firebaseAuth.currentUser
            if (!currentUser) return
            const token = await currentUser.getIdToken()
            const res = await fetch("/api/admin/seed-song-groups", {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            })
            if (!res.ok) throw new Error("Failed")
            const data = await res.json()
            toast.success(`Seeded ${data.seededCount} groups (${data.totalGroups} total, ${data.taggedSongs} songs tagged)`)
        } catch (e) {
            logger.error(e)
            toast.error("Failed to seed song groups")
        } finally {
            setSeeding(false)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (error) {
        return (
            <div className="text-sm text-destructive p-4 border border-destructive/20 rounded-lg">
                Error loading song groups: {error.message}
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold text-foreground">Song Groups</h3>
                    <p className="text-sm text-muted-foreground">
                        Liturgical slot groupings for live song swapping
                    </p>
                </div>
                <Button
                    onClick={handleSeed}
                    disabled={seeding}
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                >
                    {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Seed from Templates
                </Button>
            </div>

            {allGroups.length === 0 ? (
                <div className="border border-border rounded-lg p-8 text-center">
                    <Music className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">
                        No song groups configured. Click &quot;Seed from Templates&quot; to auto-populate
                        groups from liturgical service templates.
                    </p>
                </div>
            ) : (
                <div className="space-y-2">
                    {allGroups.map((group) => (
                        <div
                            key={group.id}
                            className="border border-border rounded-lg px-4 py-3"
                        >
                            <div className="flex items-center justify-between mb-1">
                                <span className="font-medium text-sm text-foreground">{group.label}</span>
                                <span className="text-xs text-muted-foreground">
                                    {group.songs.length} song{group.songs.length !== 1 ? 's' : ''}
                                </span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                                {group.songs.map(s => s.title).join(', ') || 'No songs'}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
