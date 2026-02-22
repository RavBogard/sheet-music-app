"use client"

import { useState, useEffect, useCallback } from "react"
import { MonitorConfig, BusAssignment } from "@/types/monitor"
import { subscribeToAllUsers, UserProfile } from "@/lib/users-firebase"
import { doc, updateDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { toast } from "sonner"
import { Users } from "lucide-react"
import { useMonitorStore } from "@/lib/monitor-store"

interface BusAssignmentPanelProps {
    config: MonitorConfig
}

/**
 * Sound engineer panel for assigning musicians to monitor buses.
 * Shows each configured bus with a dropdown of musicians/band leaders/admins.
 * Saves directly to Firestore — no separate save button needed.
 * Fix #8: Confirms before reassigning a bus from one user to another.
 */
export function BusAssignmentPanel({ config }: BusAssignmentPanelProps) {
    const [users, setUsers] = useState<UserProfile[]>([])
    const [pendingChange, setPendingChange] = useState<{
        busIdx: number
        fromName: string
        toId: string
        toName: string
    } | null>(null)

    const buses = useMonitorStore(state => state.buses)

    useEffect(() => {
        const unsub = subscribeToAllUsers((all) => {
            // Show musicians, band leaders, admins, and explicitly marked sound engineers
            const bandRoles = new Set(["musician", "band_leader", "leader", "admin"])
            setUsers(all.filter(u => u.soundEngineer || (u.role && bandRoles.has(u.role))))
        })
        return unsub
    }, [])

    const doAssign = useCallback(async (busIdx: number, userId: string | null) => {
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
    }, [config.busAssignments, users])

    const handleAssign = useCallback((busIdx: number, userId: string | null) => {
        const currentAssignment = config.busAssignments?.[String(busIdx)]

        // Reassigning from one user to another? Confirm first.
        if (currentAssignment?.userId && userId && currentAssignment.userId !== userId) {
            const toUser = users.find(u => u.uid === userId)
            setPendingChange({
                busIdx,
                fromName: currentAssignment.userName,
                toId: userId,
                toName: toUser?.displayName || "Unknown",
            })
            return
        }

        // Unassigning or assigning empty bus — no confirmation needed
        doAssign(busIdx, userId)
    }, [config.busAssignments, users, doAssign])

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
                    const busName = buses.find(b => b.index === busIdx)?.name
                    return (
                        <div key={busIdx} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 py-1">
                            <div className="flex flex-col shrink-0 sm:w-28 text-sm text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis">
                                <span className="font-medium text-foreground">Bus {busIdx}</span>
                                {busName && busName !== `Bus ${busIdx}` && (
                                    <span className="text-xs text-muted-foreground">{busName}</span>
                                )}
                            </div>
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

            {/* Fix #8: Reassignment confirmation */}
            {pendingChange && (
                <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                    <p className="text-sm text-yellow-200 mb-2">
                        Bus {pendingChange.busIdx} is currently assigned to <strong>{pendingChange.fromName}</strong>.
                        Reassign to <strong>{pendingChange.toName}</strong>?
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={() => {
                                doAssign(pendingChange.busIdx, pendingChange.toId)
                                setPendingChange(null)
                            }}
                            className="px-3 py-1 text-xs font-medium bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/40 rounded-lg transition-colors"
                        >
                            Reassign
                        </button>
                        <button
                            onClick={() => {
                                // Reset dropdown to current assignment
                                setPendingChange(null)
                            }}
                            className="px-3 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
