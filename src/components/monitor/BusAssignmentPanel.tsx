"use client"

import { useState, useEffect, useCallback } from "react"
import { MonitorConfig, BusAssignment } from "@/types/monitor"
import { subscribeToAllUsers, UserProfile } from "@/lib/users-firebase"
import { doc, updateDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { toast } from "sonner"
import { Users, X, ChevronDown } from "lucide-react"
import { useMonitorStore } from "@/lib/monitor-store"

interface BusAssignmentPanelProps {
    config: MonitorConfig
}

/** Normalize legacy single-assignment to array format. */
function getAssignments(raw: BusAssignment | BusAssignment[] | null | undefined): BusAssignment[] {
    if (!raw) return []
    return Array.isArray(raw) ? raw : [raw]
}

/**
 * Sound engineer panel for assigning musicians to monitor buses.
 * Supports multiple users per bus (e.g., shared wedge monitor).
 * All users with any role appear in the dropdown — admins/superusers included.
 */
export function BusAssignmentPanel({ config }: BusAssignmentPanelProps) {
    const [users, setUsers] = useState<UserProfile[]>([])
    const [openDropdown, setOpenDropdown] = useState<number | null>(null)

    const buses = useMonitorStore(state => state.buses)

    useEffect(() => {
        const unsub = subscribeToAllUsers((all) => {
            // Show everyone — any user might need a monitor bus
            setUsers(all.filter(u => !!u.displayName).sort((a, b) =>
                (a.displayName || "").localeCompare(b.displayName || "")
            ))
        })
        return unsub
    }, [])

    // Close dropdown when clicking outside
    useEffect(() => {
        if (openDropdown === null) return
        const handleClick = () => setOpenDropdown(null)
        document.addEventListener("click", handleClick)
        return () => document.removeEventListener("click", handleClick)
    }, [openDropdown])

    const saveAssignments = useCallback(async (busIdx: number, assignments: BusAssignment[]) => {
        const newAssignments = { ...config.busAssignments }
        newAssignments[String(busIdx)] = assignments.length > 0 ? assignments : null

        try {
            await updateDoc(doc(db, "config", "monitor"), {
                busAssignments: newAssignments,
            })
        } catch {
            toast.error("Failed to update bus assignment")
        }
    }, [config.busAssignments])

    const addUser = useCallback((busIdx: number, user: UserProfile) => {
        const current = getAssignments(config.busAssignments?.[String(busIdx)])
        if (current.some(a => a.userId === user.uid)) return // already assigned
        const next = [...current, { userId: user.uid, userName: user.displayName || "Unknown" }]
        saveAssignments(busIdx, next)
        toast.success(`Added ${user.displayName} to Bus ${busIdx}`)
        setOpenDropdown(null)
    }, [config.busAssignments, saveAssignments])

    const removeUser = useCallback((busIdx: number, userId: string) => {
        const current = getAssignments(config.busAssignments?.[String(busIdx)])
        const removed = current.find(a => a.userId === userId)
        const next = current.filter(a => a.userId !== userId)
        saveAssignments(busIdx, next)
        if (removed) toast.success(`Removed ${removed.userName} from Bus ${busIdx}`)
    }, [config.busAssignments, saveAssignments])

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
            <div className="space-y-3">
                {parsedBuses.map(busIdx => {
                    const assignments = getAssignments(config.busAssignments?.[String(busIdx)])
                    const busName = buses.find(b => b.index === busIdx)?.name
                    const assignedIds = new Set(assignments.map(a => a.userId))
                    const availableUsers = users.filter(u => !assignedIds.has(u.uid))
                    const isOpen = openDropdown === busIdx

                    return (
                        <div key={busIdx} className="space-y-1.5">
                            <div className="flex flex-col shrink-0 text-sm">
                                <span className="font-medium text-foreground">Bus {busIdx}</span>
                                {busName && busName !== `Bus ${busIdx}` && (
                                    <span className="text-xs text-muted-foreground">{busName}</span>
                                )}
                            </div>

                            {/* Assigned user chips */}
                            <div className="flex flex-wrap gap-1.5">
                                {assignments.map(a => (
                                    <span
                                        key={a.userId}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand/15 border border-brand/25 text-sm text-foreground"
                                    >
                                        {a.userName}
                                        <button
                                            onClick={() => removeUser(busIdx, a.userId)}
                                            className="ml-0.5 p-0.5 rounded hover:bg-brand/20 transition-colors"
                                            title={`Remove ${a.userName}`}
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </span>
                                ))}

                                {/* Add user button / dropdown */}
                                <div className="relative">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            setOpenDropdown(isOpen ? null : busIdx)
                                        }}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-dashed border-zinc-600 text-sm text-zinc-400 hover:text-zinc-200 hover:border-zinc-400 transition-colors"
                                    >
                                        Add
                                        <ChevronDown className="w-3 h-3" />
                                    </button>

                                    {isOpen && availableUsers.length > 0 && (
                                        <div
                                            className="absolute top-full left-0 mt-1 z-50 w-56 max-h-48 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg"
                                            onClick={e => e.stopPropagation()}
                                        >
                                            {availableUsers.map(u => (
                                                <button
                                                    key={u.uid}
                                                    onClick={() => addUser(busIdx, u)}
                                                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
                                                >
                                                    {u.displayName}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    {isOpen && availableUsers.length === 0 && (
                                        <div className="absolute top-full left-0 mt-1 z-50 w-56 rounded-lg border border-border bg-popover shadow-lg px-3 py-2 text-sm text-muted-foreground">
                                            All users assigned
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
