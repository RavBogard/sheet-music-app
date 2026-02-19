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
}

export function UserRow({ user, currentUserUid, currentUserRole }: UserRowProps) {
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
            notifyRoleChanged(user.uid, newRole).catch(() => {})
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
        <div className="p-3 sm:p-4 bg-muted border border-border rounded-xl transition-all hover:bg-card space-y-3">
            {/* Top row: avatar + info */}
            <div className="flex items-center gap-3">
                <Avatar className="h-9 w-9 border border-border shrink-0">
                    <AvatarImage src={user.photoURL} />
                    <AvatarFallback>{user.displayName?.[0] || "?"}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-medium text-foreground text-sm truncate">{user.displayName}</p>
                        {isSelf && <Badge variant="default" className="bg-muted-foreground/20 text-muted-foreground border-muted-foreground/30 text-[9px] h-4 px-1">You</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                </div>
            </div>

            {/* Bottom row: badges + controls */}
            <div className="flex items-center gap-2 flex-wrap">
                {/* Role & status badges */}
                {effectiveRole === 'admin' && <Badge variant="default" className="bg-purple-500/20 text-purple-300 border-purple-500/50 text-[10px] h-5 px-1.5">Admin</Badge>}
                {effectiveRole === 'band_leader' && <Badge variant="default" className="bg-blue-500/20 text-blue-300 border-blue-500/50 text-[10px] h-5 px-1.5">Band Leader</Badge>}
                {effectiveRole === 'musician' && <Badge variant="default" className="bg-green-500/20 text-green-300 border-green-500/50 text-[10px] h-5 px-1.5">Musician</Badge>}
                {effectiveRole === 'member' && !isPending && <Badge variant="default" className="bg-muted-foreground/20 text-muted-foreground border-muted-foreground/30 text-[10px] h-5 px-1.5">Member</Badge>}
                {user.soundEngineer && <Badge variant="default" className="bg-emerald-500/20 text-emerald-300 border-emerald-500/50 text-[10px] h-5 px-1.5">🎧 Sound</Badge>}
                {isPending && <Badge variant="destructive" className="bg-yellow-500/20 text-yellow-300 border-yellow-500/50 text-[10px] h-5 px-1.5">Pending</Badge>}

                <span className="text-[10px] text-muted-foreground/50">
                    {user.createdAt ? formatDistanceToNow(toDate(user.createdAt) || new Date(), { addSuffix: true }) : ""}
                </span>

                {/* Spacer */}
                <div className="flex-1" />

                {/* Sound Engineer toggle — band leaders and admins */}
                {isCurrentBandLeaderOrAbove && !isSelf && effectiveRole !== 'pending' && (
                    <button
                        onClick={handleSoundEngineerToggle}
                        className={`p-1.5 rounded-lg border transition-colors ${
                            user.soundEngineer
                                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                                : 'bg-muted/50 border-border/50 text-muted-foreground/30 hover:text-muted-foreground/60'
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
                        className={`p-1.5 rounded-lg border transition-colors ${
                            confirmDelete
                                ? 'bg-red-500/20 border-red-500/40 text-red-400'
                                : 'bg-muted/50 border-border/50 text-muted-foreground/20 hover:text-red-400/60'
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
                        <SelectTrigger className="w-[120px] bg-background border-border h-7 text-[11px]">
                            <SelectValue placeholder="Role" />
                        </SelectTrigger>
                        <SelectContent>
                            {assignableRoles.map(role => (
                                <SelectItem key={role} value={role}>
                                    {ROLE_LABELS[role]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ) : (
                    <span className="text-[11px] text-muted-foreground/50 px-2 py-1 border border-border/50 rounded-md bg-background/50">
                        {ROLE_LABELS[effectiveRole]}
                    </span>
                )}
            </div>
        </div>
    )
}

