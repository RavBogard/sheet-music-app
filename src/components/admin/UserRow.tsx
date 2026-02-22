"use client"

import { UserProfile, UserRole, updateUserRole } from "@/lib/users-firebase"
import { toDate } from "@/lib/firestore-helpers"
import { notifyRoleChanged } from "@/lib/notification-store"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { useState } from "react"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"
import { logger } from "@/lib/logger"
import { doc, deleteDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { Headphones, Trash2 } from "lucide-react"

const ROLE_HIERARCHY: Record<string, number> = {
    pending: 0,
    member: 1,
    musician: 2,
    band_leader: 3,
    leader: 3, // backward compat
    admin: 4,
}

const ROLE_LABELS: Record<string, string> = {
    pending: 'Pending',
    member: 'Member',
    musician: 'Musician',
    band_leader: 'Band Leader',
    admin: 'Admin',
}

interface UserRowProps {
    user: UserProfile
    currentUserUid: string
    currentUserRole: UserRole
    isSelected?: boolean
    onSelect?: () => void
}

export function UserRow({ user, currentUserUid, currentUserRole, isSelected, onSelect }: UserRowProps) {
    const [loading, setLoading] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)

    const currentLevel = ROLE_HIERARCHY[currentUserRole] ?? 0
    const isCurrentAdmin = currentUserRole === 'admin'
    const isCurrentBandLeaderOrAbove = currentLevel >= ROLE_HIERARCHY.band_leader
    const isSelf = user.uid === currentUserUid

    const handleRoleChange = async (newRole: string) => {
        if (isSelf) {
            toast.error("You cannot change your own role here.")
            return
        }

        // Can only assign up to your own level
        const targetLevel = ROLE_HIERARCHY[newRole] ?? 0
        if (targetLevel > currentLevel) {
            toast.error(`You can only assign roles up to ${ROLE_LABELS[currentUserRole]}.`)
            return
        }

        setLoading(true)
        try {
            await updateUserRole(user.uid, newRole as UserRole)
            notifyRoleChanged(user.uid, newRole).catch(() => { })
            toast.success(`Updated ${user.displayName} to ${ROLE_LABELS[newRole] || newRole}`)
        } catch (e) {
            logger.error(e)
            toast.error("Failed to update role")
        } finally {
            setLoading(false)
        }
    }

    const handleSoundEngineerToggle = async () => {
        try {
            const { auth: firebaseAuth } = await import("@/lib/firebase")
            const currentUser = firebaseAuth.currentUser
            if (!currentUser) return
            const token = await currentUser.getIdToken()
            const res = await fetch("/api/admin/set-sound-engineer", {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ targetUserId: user.uid, soundEngineer: !user.soundEngineer }),
            })
            if (!res.ok) throw new Error("Failed")
            toast.success(`${user.displayName}: sound engineer ${user.soundEngineer ? 'removed' : 'enabled'}`)
        } catch (e) {
            logger.error(e)
            toast.error("Failed to update sound engineer flag")
        }
    }

    const handleDelete = async () => {
        if (!confirmDelete) {
            setConfirmDelete(true)
            setTimeout(() => setConfirmDelete(false), 3000)
            return
        }
        try {
            await deleteDoc(doc(db, "users", user.uid))
            toast.success(`Removed ${user.displayName}`)
        } catch (e) {
            logger.error(e)
            toast.error("Failed to remove user")
        }
        setConfirmDelete(false)
    }

    const isPending = user.role === 'pending'
    const effectiveRole = user.role === ('leader' as string) ? 'band_leader' : user.role

    // Roles this user can see/assign (up to their own level)
    const assignableRoles = (['pending', 'member', 'musician', 'band_leader', 'admin'] as const)
        .filter(r => ROLE_HIERARCHY[r] <= currentLevel)

    return (
        <div className={`flex items-center gap-3 px-4 py-3 bg-card transition-colors hover:bg-muted/50 ${isSelected ? 'bg-violet-500/5 hover:bg-violet-500/10' : ''}`}>
            {/* Checkbox Column */}
            <input
                type="checkbox"
                checked={isSelected || false}
                onChange={onSelect}
                className="h-4 w-4 rounded border-border accent-violet-600 shrink-0 cursor-pointer"
            />

            <div className="min-w-0 flex-1 grid grid-cols-12 gap-4 items-center pl-2">
                {/* User Info Column (col-span-12 on mobile, col-span-5 on sm) */}
                <div className="col-span-12 sm:col-span-5 flex items-center gap-3 min-w-0">
                    <Avatar className="h-9 w-9 border border-border shrink-0">
                        <AvatarImage src={user.photoURL} />
                        <AvatarFallback>{user.displayName?.[0] || "?"}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="font-medium text-foreground text-sm truncate">{user.displayName}</p>
                            {isSelf && <Badge variant="default" className="bg-muted-foreground/20 text-muted-foreground border-muted-foreground/30 text-[9px] h-4 px-1">You</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground truncate" title={user.email}>{user.email}</p>
                    </div>
                </div>

                {/* Attributes Column (hidden on mobile, col-span-3 on sm) */}
                <div className="hidden sm:flex col-span-3 items-center gap-1.5 flex-wrap">
                    {effectiveRole === 'admin' && <Badge variant="default" className="bg-purple-500/20 text-purple-300 border-purple-500/50 text-[10px] h-5 px-1.5">Admin</Badge>}
                    {effectiveRole === 'band_leader' && <Badge variant="default" className="bg-blue-500/20 text-blue-300 border-blue-500/50 text-[10px] h-5 px-1.5">Leader</Badge>}
                    {effectiveRole === 'musician' && <Badge variant="default" className="bg-green-500/20 text-green-300 border-green-500/50 text-[10px] h-5 px-1.5">Musician</Badge>}
                    {effectiveRole === 'member' && !isPending && <Badge variant="default" className="bg-muted-foreground/20 text-muted-foreground border-muted-foreground/30 text-[10px] h-5 px-1.5">Member</Badge>}
                    {user.soundEngineer && <Badge variant="default" className="bg-emerald-500/20 text-emerald-300 border-emerald-500/50 text-[10px] h-5 px-1.5">🎧 Sound</Badge>}
                    {isPending && <Badge variant="destructive" className="bg-yellow-500/20 text-yellow-300 border-yellow-500/50 text-[10px] h-5 px-1.5">Pending</Badge>}

                    <span className="text-[10px] text-muted-foreground/50 truncate max-w-[100px]" title={user.createdAt ? toDate(user.createdAt)?.toLocaleString() : ""}>
                        {user.createdAt ? formatDistanceToNow(toDate(user.createdAt) || new Date(), { addSuffix: true }) : ""}
                    </span>
                </div>

                {/* Role Management Column (hidden on mobile, col-span-4 on sm) */}
                <div className="hidden sm:flex col-span-4 items-center justify-end gap-2 pr-2">
                    {/* Sound Engineer toggle */}
                    {isCurrentBandLeaderOrAbove && !isSelf && effectiveRole !== 'pending' && (
                        <button
                            onClick={handleSoundEngineerToggle}
                            className={`p-1.5 rounded-lg border transition-colors ${user.soundEngineer
                                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-500 dark:text-emerald-400'
                                    : 'bg-muted/50 border-border/50 text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted'
                                }`}
                            title={user.soundEngineer ? 'Remove sound engineer' : 'Make sound engineer'}
                        >
                            <Headphones className="h-3.5 w-3.5" />
                        </button>
                    )}

                    {/* Delete (admin only, not self) */}
                    {isCurrentAdmin && !isSelf && (
                        <button
                            onClick={handleDelete}
                            className={`p-1.5 rounded-lg border transition-colors ${confirmDelete
                                    ? 'bg-red-500/20 border-red-500/40 text-red-500 dark:text-red-400'
                                    : 'bg-muted/50 border-border/50 text-muted-foreground/40 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/20'
                                }`}
                            title={confirmDelete ? 'Tap again to confirm' : 'Remove user'}
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </button>
                    )}

                    {/* Role selector */}
                    {!isSelf ? (
                        <Select
                            disabled={loading}
                            value={effectiveRole}
                            onValueChange={handleRoleChange}
                        >
                            <SelectTrigger className="w-[120px] bg-background border-border h-8 text-xs font-medium">
                                <SelectValue placeholder="Role" />
                            </SelectTrigger>
                            <SelectContent>
                                {assignableRoles.map(role => (
                                    <SelectItem key={role} value={role} className="text-xs">
                                        {ROLE_LABELS[role]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : (
                        <span className="text-[11px] font-medium text-muted-foreground/70 px-3 py-1.5 border border-border/50 rounded-md bg-muted/50">
                            {ROLE_LABELS[effectiveRole]}
                        </span>
                    )}
                </div>
            </div>

            {/* Mobile Actions (visible only < sm) */}
            <div className="sm:hidden w-full flex items-center justify-between mt-2 pt-2 border-t border-border/50">
                <div className="flex items-center gap-1.5 flex-wrap flex-1">
                    {effectiveRole === 'admin' && <Badge variant="default" className="bg-purple-500/20 text-purple-300 border-purple-500/50 text-[9px] h-4 px-1.5">Admin</Badge>}
                    {effectiveRole === 'band_leader' && <Badge variant="default" className="bg-blue-500/20 text-blue-300 border-blue-500/50 text-[9px] h-4 px-1.5">Leader</Badge>}
                    {effectiveRole === 'musician' && <Badge variant="default" className="bg-green-500/20 text-green-300 border-green-500/50 text-[9px] h-4 px-1.5">Musician</Badge>}
                    {effectiveRole === 'member' && !isPending && <Badge variant="default" className="bg-muted-foreground/20 text-muted-foreground border-muted-foreground/30 text-[9px] h-4 px-1.5">Member</Badge>}
                    {user.soundEngineer && <Badge variant="default" className="bg-emerald-500/20 text-emerald-300 border-emerald-500/50 text-[9px] h-4 px-1.5">🎧 Sound</Badge>}
                </div>

                <div className="flex items-center gap-1">
                    {!isSelf && (
                        <Select
                            disabled={loading}
                            value={effectiveRole}
                            onValueChange={handleRoleChange}
                        >
                            <SelectTrigger className="w-[100px] bg-background border-border h-7 text-[10px]">
                                <SelectValue placeholder="Role" />
                            </SelectTrigger>
                            <SelectContent>
                                {assignableRoles.map(role => (
                                    <SelectItem key={role} value={role} className="text-xs">
                                        {ROLE_LABELS[role]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                </div>
            </div>
        </div>
    )
}
