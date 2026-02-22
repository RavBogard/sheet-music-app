"use client"

import { useState, useMemo, useEffect } from "react"
import { useAuth } from "@/lib/auth-context"
import { UserProfile, subscribeToAllUsers, updateUserRole, UserRole } from "@/lib/users-firebase"
import { UserRow } from "@/components/admin/UserRow"
import { notifyRoleChanged } from "@/lib/notification-store"
import { toast } from "sonner"
import { Loader2, Users, Search, FilterX } from "lucide-react"

type FilterRole = 'all' | 'pending' | 'member' | 'musician' | 'band_leader' | 'admin'

export function PeopleSection() {
    const { user, profile, isAdmin, isBandLeader } = useAuth()
    const [users, setUsers] = useState<UserProfile[]>([])
    const [usersLoading, setUsersLoading] = useState(true)
    const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set())

    // Filtering and Search State
    const [searchQuery, setSearchQuery] = useState("")
    const [roleFilter, setRoleFilter] = useState<FilterRole>('all')

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



    const pendingCount = users.filter(u => u.role === "pending").length
    const currentUserRole = (profile?.role || 'member') as UserRole

    // Derived filtered users
    const filteredUsers = useMemo(() => {
        return users.filter(u => {
            const matchesSearch = u.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                u.email?.toLowerCase().includes(searchQuery.toLowerCase())
            const matchesRole = roleFilter === 'all' ||
                (roleFilter === 'pending' && u.role === 'pending') ||
                (roleFilter === 'band_leader' && u.role === 'band_leader') ||
                (u.role === roleFilter)
            return matchesSearch && matchesRole
        })
    }, [users, searchQuery, roleFilter])

    if (!canManagePeople) return null

    const toggleUserSelection = (uid: string) => {
        setSelectedUsers(prev => {
            const next = new Set(prev)
            if (next.has(uid)) next.delete(uid)
            else next.add(uid)
            return next
        })
    }

    const selectAllFiltered = () => {
        const uids = filteredUsers.map(u => u.uid)
        setSelectedUsers(new Set(uids))
    }

    const clearSelection = () => setSelectedUsers(new Set())

    const bulkSetRole = async (role: string) => {
        const uids = Array.from(selectedUsers)
        let success = 0
        for (const uid of uids) {
            try {
                await updateUserRole(uid, role as UserRole)
                notifyRoleChanged(uid, role).catch(() => { })
                success++
            } catch { /* skip failures */ }
        }
        const labels: Record<string, string> = { member: 'Member', musician: 'Musician', band_leader: 'Band Leader' }
        toast.success(`Updated ${success} user${success !== 1 ? 's' : ''} to ${labels[role] || role}`)
        clearSelection()
    }

    return (
        <section className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-violet-500" />
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                        People Management
                    </h2>
                    {pendingCount > 0 && (
                        <span className="text-[10px] font-bold bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 px-1.5 py-0.5 rounded-full ml-2 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
                            {pendingCount} pending requests
                        </span>
                    )}
                </div>

                {/* Bulk Actions Header (visible when items selected) */}
                {selectedUsers.size > 0 && (
                    <div className="flex items-center gap-2 bg-violet-500/10 border border-violet-500/20 px-3 py-1.5 rounded-lg animate-in fade-in slide-in-from-top-2">
                        <span className="text-xs font-semibold text-violet-600 dark:text-violet-400 mr-2">
                            {selectedUsers.size} Selected
                        </span>

                        <div className="flex items-center gap-1.5 border-l border-violet-500/20 pl-3">
                            <button
                                onClick={() => bulkSetRole('member')}
                                className="text-xs bg-background/50 hover:bg-background text-foreground border border-border px-2 py-1 rounded-md font-medium transition-colors"
                            >
                                Make Member
                            </button>
                            <button
                                onClick={() => bulkSetRole('musician')}
                                className="text-xs bg-green-600/10 hover:bg-green-600/20 text-green-600 dark:text-green-400 border border-green-500/20 px-2 py-1 rounded-md font-medium transition-colors"
                            >
                                Make Musician
                            </button>
                            {isAdmin && (
                                <button
                                    onClick={() => bulkSetRole('band_leader')}
                                    className="text-xs bg-blue-600/10 hover:bg-blue-600/20 text-blue-600 dark:text-blue-400 border border-blue-500/20 px-2 py-1 rounded-md font-medium transition-colors"
                                >
                                    Make Band Leader
                                </button>
                            )}
                            <button
                                onClick={() => bulkSetRole('denied')}
                                className="text-xs bg-red-600/10 hover:bg-red-600/20 text-red-600 dark:text-red-400 border border-red-500/20 px-2 py-1 rounded-md font-medium transition-colors ml-2"
                                title="Set role to denied (removes access)"
                            >
                                Deny Access
                            </button>
                            <button onClick={clearSelection} className="text-xs text-muted-foreground hover:text-foreground ml-2 px-1">
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Filters Toolbar */}
            <div className="flex items-center gap-3 p-1">
                <div className="relative flex-1 max-w-xs">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search users..."
                        className="w-full bg-card border border-border rounded-lg pl-9 pr-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500 transition-shadow"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                <div className="flex items-center bg-card border border-border rounded-lg p-0.5 overflow-x-auto min-w-0 hide-scrollbar">
                    {(['all', 'pending', 'member', 'musician', 'band_leader', 'admin'] as const).map((role) => (
                        <button
                            key={role}
                            onClick={() => setRoleFilter(role)}
                            className={`px-3 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${roleFilter === role
                                ? 'bg-violet-500/20 text-violet-600 dark:text-violet-400'
                                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                }`}
                        >
                            {role === 'band_leader' ? 'Leader' : role.charAt(0).toUpperCase() + role.slice(1)}
                        </button>
                    ))}
                </div>

                {(searchQuery || roleFilter !== 'all') && (
                    <button
                        onClick={() => { setSearchQuery(""); setRoleFilter('all') }}
                        className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted flex-shrink-0"
                        title="Clear filters"
                    >
                        <FilterX className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Data Grid list */}
            {usersLoading ? (
                <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : (
                <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
                    {/* Grid Header */}
                    <div className="flex items-center gap-3 px-4 py-3 bg-muted/30">
                        <input
                            type="checkbox"
                            checked={selectedUsers.size === filteredUsers.length && filteredUsers.length > 0}
                            onChange={() => selectedUsers.size > 0 ? clearSelection() : selectAllFiltered()}
                            className="h-4 w-4 rounded border-border accent-violet-600 shrink-0 cursor-pointer"
                        />
                        <div className="min-w-0 flex-1 grid grid-cols-12 gap-4 items-center pl-2">
                            <div className="col-span-12 sm:col-span-5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">User</div>
                            <div className="hidden sm:block col-span-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Attributes</div>
                            <div className="hidden sm:block col-span-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right pr-2">Role Management</div>
                        </div>
                    </div>

                    {/* Grid Rows */}
                    <div className="max-h-[600px] overflow-y-auto">
                        {filteredUsers.length === 0 ? (
                            <div className="p-8 text-center text-muted-foreground text-sm">
                                {users.length === 0 ? "No registered users yet." : "No users match your current filters."}
                            </div>
                        ) : (
                            filteredUsers.map((u) => (
                                <UserRow
                                    key={u.uid}
                                    user={u}
                                    currentUserUid={user?.uid || ""}
                                    currentUserRole={currentUserRole}
                                    isSelected={selectedUsers.has(u.uid)}
                                    onSelect={() => toggleUserSelection(u.uid)}
                                />
                            ))
                        )}
                    </div>
                </div>
            )}
        </section>
    )
}
