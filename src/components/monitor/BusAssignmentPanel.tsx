"use client"

import { useState, useEffect, useCallback } from "react"
import { MonitorConfig, BusAssignment } from "@/types/monitor"
import { subscribeToAllUsers, UserProfile } from "@/lib/users-firebase"
import { doc, updateDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { toast } from "sonner"
import { Users, X, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
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
                            <div className="shrink-0 text-sm font-medium text-foreground">
                                {busName && busName !== `Bus ${busIdx}`
                                    ? `${busName} \u2014 Bus ${busIdx}`
                                    : `Bus ${busIdx}`}
                            </div>

                            {/* Assigned user chips */}
                            <div className="flex flex-wrap gap-1.5">
                                {assignments.map(a => (
                                    <span
                                        key={a.userId}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand/15 border border-brand/25 text-sm text-foreground"
                                    >
                                        {a.userName}
                                        <Button
                                            variant="ghost"
                                            size="icon-xs"
                                            onClick={() => removeUser(busIdx, a.userId)}
                                            className="ml-0.5 h-5 w-5 hover:bg-brand/20"
                                            title={`Remove ${a.userName}`}
                                        >
                                            <X className="w-3 h-3" />
                                        </Button>
                                    </span>
                                ))}

                                {/* Add user button / dropdown */}
                                <div className="relative">
                                    <Button
                                        variant="ghost"
                                        size="xs"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            setOpenDropdown(isOpen ? null : busIdx)
                                        }}
                                        className="px-2.5 py-1 rounded-lg border border-dashed border-zinc-600 text-zinc-400 hover:text-zinc-200 hover:border-zinc-400"
                                    >
                                        Add
                                        <ChevronDown className="w-3 h-3" />
                                    </Button>

                                    {isOpen && availableUsers.length > 0 && (
                                        <div
                                            className="absolute top-full left-0 mt-1 z-50 w-56 max-h-48 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg"
                                            onClick={e => e.stopPropagation()}
                                        >
                                            {availableUsers.map(u => (
                                                <Button
                                                    key={u.uid}
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => addUser(busIdx, u)}
                                                    className="w-full justify-start rounded-none px-3 py-2 h-auto"
                                                >
                                                    {u.displayName}
                                                </Button>
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
