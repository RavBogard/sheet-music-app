"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/lib/auth-context"
import { UserProfile, subscribeToAllUsers, updateUserRole, UserRole } from "@/lib/users-firebase"
import { UserRow } from "@/components/admin/UserRow"
import { CollapsibleSection } from "@/components/admin/CollapsibleSection"
import { notifyRoleChanged } from "@/lib/notification-store"
import { toast } from "sonner"
import { Loader2, Users } from "lucide-react"

export function PeopleSection() {
    const { user, profile, isAdmin, isBandLeader } = useAuth()
    const [users, setUsers] = useState<UserProfile[]>([])
    const [usersLoading, setUsersLoading] = useState(true)
    const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set())

    // Band leaders and admins can see the people section
    const canManagePeople = isBandLeader

    useEffect(() => {
        if (!canManagePeople) return
        const unsub = subscribeToAllUsers(
            (data) => { setUsers(data); setUsersLoading(false) },
            () => setUsersLoading(false)
        )
        return unsub
    }, [canManagePeople])

    if (!canManagePeople) return null

    const pendingCount = users.filter(u => u.role === "pending").length
    const currentUserRole = (profile?.role || 'member') as UserRole

    const toggleUserSelection = (uid: string) => {
        setSelectedUsers(prev => {
            const next = new Set(prev)
            if (next.has(uid)) next.delete(uid)
            else next.add(uid)
            return next
        })
    }

    const selectAllPending = () => {
        const pendingUids = users.filter(u => u.role === 'pending').map(u => u.uid)
        setSelectedUsers(new Set(pendingUids))
    }

    const clearSelection = () => setSelectedUsers(new Set())

    const bulkSetRole = async (role: string) => {
        const uids = Array.from(selectedUsers)
        let success = 0
        for (const uid of uids) {
            try {
                await updateUserRole(uid, role as UserRole)
                notifyRoleChanged(uid, role).catch(() => {})
                success++
            } catch { /* skip failures */ }
        }
        const labels: Record<string, string> = { member: 'Member', musician: 'Musician', band_leader: 'Band Leader' }
        toast.success(`Updated ${success} user${success !== 1 ? 's' : ''} to ${labels[role] || role}`)
        clearSelection()
    }

    return (
        <CollapsibleSection
            icon={<Users className="w-4 h-4 text-violet-500" />}
            title="People"
            badge={pendingCount > 0 ? (
                <span className="text-[10px] font-bold bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 px-1.5 py-0.5 rounded-full">
                    {pendingCount} pending
                </span>
            ) : undefined}
            defaultOpen={pendingCount > 0}
        >
            {usersLoading ? (
                <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : (
                <div className="space-y-2">
                    {pendingCount > 0 && (
                        <div className="flex items-center gap-2 flex-wrap pb-2">
                            <button
                                onClick={selectedUsers.size > 0 ? clearSelection : selectAllPending}
                                className="text-xs text-violet-500 hover:text-violet-400 font-medium"
                            >
                                {selectedUsers.size > 0 ? 'Clear selection' : `Select all pending (${pendingCount})`}
                            </button>
                            {selectedUsers.size > 0 && (
                                <>
                                    <span className="text-xs text-muted-foreground">
                                        {selectedUsers.size} selected
                                    </span>
                                    <button
                                        onClick={() => bulkSetRole('member')}
                                        className="text-xs bg-muted-foreground/20 hover:bg-muted-foreground/30 text-foreground px-2.5 py-1 rounded-md font-medium transition-colors"
                                    >
                                        Approve as Member
                                    </button>
                                    <button
                                        onClick={() => bulkSetRole('musician')}
                                        className="text-xs bg-green-600 hover:bg-green-500 text-white px-2.5 py-1 rounded-md font-medium transition-colors"
                                    >
                                        Approve as Musician
                                    </button>
                                    {isAdmin && (
                                        <button
                                            onClick={() => bulkSetRole('band_leader')}
                                            className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1 rounded-md font-medium transition-colors"
                                        >
                                            Approve as Band Leader
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                    {users.map((u) => (
                        <div key={u.uid} className="flex items-center gap-2">
                            {u.role === 'pending' && (
                                <input
                                    type="checkbox"
                                    checked={selectedUsers.has(u.uid)}
                                    onChange={() => toggleUserSelection(u.uid)}
                                    className="h-4 w-4 rounded border-border accent-violet-600 shrink-0"
                                />
                            )}
                            <div className="flex-1 min-w-0">
                                <UserRow user={u} currentUserUid={user?.uid || ""} currentUserRole={currentUserRole} />
                            </div>
                        </div>
                    ))}
                    {users.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">No registered users yet.</p>}
                </div>
            )}
        </CollapsibleSection>
    )
}
