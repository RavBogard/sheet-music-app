"use client"

import { useState, useEffect } from "react"
import { MonitorConfig, BusAssignment } from "@/types/monitor"
import { subscribeToAllUsers, UserProfile } from "@/lib/users-firebase"
import { doc, updateDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { toast } from "sonner"
import { Users } from "lucide-react"

interface BusAssignmentPanelProps {
    config: MonitorConfig
}

/**
 * Sound engineer panel for assigning musicians to monitor buses.
 * Shows each configured bus with a dropdown of musicians/band leaders/admins.
 * Saves directly to Firestore — no separate save button needed.
 */
export function BusAssignmentPanel({ config }: BusAssignmentPanelProps) {
    const [users, setUsers] = useState<UserProfile[]>([])

    useEffect(() => {
        const unsub = subscribeToAllUsers((all) => {
            // Show musicians, band leaders, admins (not plain members or pending)
            const bandRoles = new Set(["musician", "band_leader", "leader", "admin"])
            setUsers(all.filter(u => u.role && bandRoles.has(u.role)))
        })
        return unsub
    }, [])

    const handleAssign = async (busIdx: number, userId: string | null) => {
        const newAssignments: Record<string, BusAssignment | null> = { ...config.busAssignments }

        if (!userId) {
            newAssignments[String(busIdx)] = null
        } else {
            const user = users.find(u => u.uid === userId)
            newAssignments[String(busIdx)] = {
                userId,
                userName: user?.displayName || "Unknown",
            }
        }

        try {
            await updateDoc(doc(db, "config", "monitor"), {
                busAssignments: newAssignments,
            })
            const name = userId ? users.find(u => u.uid === userId)?.displayName : "nobody"
            toast.success(`Bus ${busIdx} → ${name || "unassigned"}`)
        } catch {
            toast.error("Failed to update bus assignment")
        }
    }

    const parsedBuses = config.monitorBuses || []

    if (parsedBuses.length === 0) {
        return null
    }

    return (
        <div className="bg-card border border-border rounded-xl p-4">
            <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <Users className="w-4 h-4" />
                Bus Assignments
            </h2>
            <div className="space-y-2">
                {parsedBuses.map(busIdx => {
                    const assignment = config.busAssignments?.[String(busIdx)]
                    return (
                        <div key={busIdx} className="flex items-center gap-3">
                            <span className="text-sm font-medium w-14 shrink-0 text-muted-foreground">Bus {busIdx}</span>
                            <select
                                value={assignment?.userId || ""}
                                onChange={e => handleAssign(busIdx, e.target.value || null)}
                                className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                            >
                                <option value="">Unassigned</option>
                                {users.map(u => (
                                    <option key={u.uid} value={u.uid}>{u.displayName}</option>
                                ))}
                            </select>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
