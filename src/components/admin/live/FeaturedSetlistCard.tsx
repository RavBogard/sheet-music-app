"use client"

import { useState, useEffect, useMemo } from "react"
import { doc, setDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { Star } from "lucide-react"
import { useSafeFirestoreSync } from "@/hooks/use-safe-firestore-sync"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

export function FeaturedSetlistCard({ activeSetlists }: { activeSetlists: any[] }) {
    const [featuredId, setFeaturedId] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    const featuredRef = useMemo(() => doc(db, "config", "featured"), [])
    const { data: featuredData, loading: isFeaturedLoading } = useSafeFirestoreSync<{ setlistId: string }>(featuredRef as any)

    useEffect(() => {
        if (isFeaturedLoading) return
        if (featuredData) {
            setFeaturedId(featuredData.setlistId || null)
        } else {
            setFeaturedId(null)
        }
        setLoading(false)
    }, [featuredData, isFeaturedLoading])

    const handleSetFeatured = async (id: string | null) => {
        setSaving(true)
        try {
            await setDoc(doc(db, "config", "featured"), { setlistId: id, updatedAt: new Date() }, { merge: true })
            if (id) {
                toast.success("Setlist featured globally!")
            } else {
                toast.success("Removed featured setlist.")
            }
        } catch (e) {
            toast.error("Failed to update featured setlist")
        } finally {
            setSaving(false)
        }
    }

    if (loading) return null

    return (
        <div className="bg-card border border-border p-4 rounded-xl space-y-4">
            <h4 className="font-semibold text-sm flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-500" />
                Featured Setlist
            </h4>
            <p className="text-xs text-muted-foreground mt-1">
                Pin a specific public setlist to the top of everyone's homepage.
            </p>

            <div className="space-y-3 pt-2">
                <select
                    className="w-full bg-muted text-sm border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring"
                    value={featuredId || ""}
                    onChange={(e) => handleSetFeatured(e.target.value || null)}
                    disabled={saving}
                >
                    <option value="">-- No setlist featured --</option>
                    {activeSetlists.map(sl => (
                        <option key={sl.id} value={sl.id}>
                            {sl.title} ({sl.date || 'No Date'})
                        </option>
                    ))}
                </select>

                {featuredId && !activeSetlists.find(s => s.id === featuredId) && (
                    <div className="text-xs text-amber-500 bg-amber-500/10 p-2 rounded flex items-center justify-between">
                        <span>Currently featuring an older/private setlist.</span>
                        <Button variant="ghost" size="sm" onClick={() => handleSetFeatured(null)} className="h-6 px-2">
                            Clear
                        </Button>
                    </div>
                )}
            </div>
        </div>
    )
}
