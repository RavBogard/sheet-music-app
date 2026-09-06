"use client"

import { UserProfile, UserRole, updateUserRole } from "@/lib/users-firebase"
import { formatError } from "@/lib/format-error"
import { ROLE_LABELS } from "@/lib/roles"
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
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"
import { logger } from "@/lib/logger"
import { Headphones, Trash2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import { rowOrgIds } from "@/lib/org/membership"

const ROLE_HIERARCHY: Record<string, number> = {
    pending: 0,
    member: 1,
    musician: 2,
    band_leader: 3,
    leader: 3, // backward compat
    admin: 4,
}

// v11.1-02-02: org-membership tri-state over the two tenants — CRC only /
// Brothers Lazaroff only / Both — mapped to the orgIds claim+doc via
// /api/admin/set-role.
// v11.4-04 (Daniel 2026-06-11): membership applies to EVERYONE, not just the
// authoring tier — leaders' orgIds grant cross-tenant AUTHORING, musicians'/
// members' orgIds govern publish-audience candidacy + notifications. The
// control is therefore shown for all non-pending rows (admin-only). This
// supersedes the earlier "consumers stay host-derived / leaders only" scoping.
const MEMBERSHIP_TO_ORGIDS: Record<string, string[]> = {
    crc: ["crc"],
    bl: ["brotherslazaroff"],
    both: ["crc", "brotherslazaroff"],
}
const MEMBERSHIP_OPTION_LABELS: Record<string, string> = {
    crc: "CRC only",
    bl: "Brothers Lazaroff only",
    both: "Both",
}
const MEMBERSHIP_BADGE_LABELS: Record<string, string> = {
    crc: "CRC",
    bl: "BL",
    both: "CRC + BL",
}
function membershipFromOrgIds(orgIds: string[]): "crc" | "bl" | "both" {
    const hasBl = orgIds.includes("brotherslazaroff")
    const hasCrc = orgIds.includes("crc")
    if (hasBl && hasCrc) return "both"
    if (hasBl) return "bl"
    return "crc"
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
    const [soundEngLoading, setSoundEngLoading] = useState(false)
    const [deleteLoading, setDeleteLoading] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [pendingRole, setPendingRole] = useState<string | null>(null)
    const [pendingMembership, setPendingMembership] = useState<string | null>(null)
    const [membershipLoading, setMembershipLoading] = useState(false)

    // v44-06 UX-011: if the parent refreshes and the user's role has changed
    // (either via this confirmation succeeding or an out-of-band update),
    // clear any stale pending-role confirmation so the row returns to idle
    // and the select reflects the latest props.
    useEffect(() => {
        setPendingRole(null)
    }, [user.role])

    // v11.1-02-02: clear a stale membership confirmation once the doc's orgIds
    // change lands (the select then reflects the latest props). Dep on the
    // joined string so a new array identity per snapshot doesn't loop.
    const orgIdsKey = rowOrgIds(user.orgIds).join(",")
    useEffect(() => {
        setPendingMembership(null)
    }, [orgIdsKey])

    const currentLevel = ROLE_HIERARCHY[currentUserRole] ?? 0
    const isCurrentAdmin = currentUserRole === 'admin'
    const isCurrentBandLeaderOrAbove = currentLevel >= ROLE_HIERARCHY.band_leader
    const isSelf = user.uid === currentUserUid

    const requestRoleChange = (newRole: string) => {
        if (isSelf) {
            toast.error("You cannot change your own role here.")
            return
        }
        const targetLevel = ROLE_HIERARCHY[newRole] ?? 0
        if (targetLevel > currentLevel) {
            toast.error(`You can only assign roles up to ${ROLE_LABELS[currentUserRole]}.`)
            return
        }
        setPendingRole(newRole)
    }

    const confirmRoleChange = async () => {
        if (!pendingRole) return
        const newRole = pendingRole
        setPendingRole(null)

        setLoading(true)
        try {
            await updateUserRole(user.uid, newRole as UserRole)
            notifyRoleChanged(user.uid, newRole).catch(() => { })
            toast.success(`Updated ${user.displayName} to ${ROLE_LABELS[newRole] || newRole}`)
        } catch (e) {
            logger.error(e)
            // v4.4 U-001: surface the real reason so admins can act (permission
            // denied? network? server error?).
            const msg = formatError(e)
            toast.error(`Couldn't update role: ${msg}`)
        } finally {
            setLoading(false)
        }
    }

    const handleSoundEngineerToggle = async () => {
        setSoundEngLoading(true)
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
            if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                throw new Error(data.error || `Request failed (${res.status})`)
            }
            toast.success(`${user.displayName}: sound engineer ${user.soundEngineer ? 'removed' : 'enabled'}`)
        } catch (e) {
            logger.error(e)
            // v4.4 U-002: surface the real failure reason
            const msg = formatError(e)
            toast.error(`Couldn't update sound engineer flag: ${msg}`)
        } finally {
            setSoundEngLoading(false)
        }
    }

    const handleDelete = async () => {
        if (!confirmDelete) {
            setConfirmDelete(true)
            setTimeout(() => setConfirmDelete(false), 3000)
            return
        }
        setDeleteLoading(true)
        try {
            // Use server-side Admin SDK route for proper cleanup
            // (deletes both Firestore doc and Firebase Auth user)
            const { auth: firebaseAuth } = await import("@/lib/firebase")
            const currentUser = firebaseAuth.currentUser
            if (!currentUser) throw new Error("Not authenticated")
            const token = await currentUser.getIdToken()
            const res = await fetch("/api/admin/delete-user", {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ targetUserId: user.uid }),
            })
            if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                throw new Error(data.error || "Failed")
            }
            toast.success(`Removed ${user.displayName}`)
        } catch (e) {
            logger.error(e)
            // v4.4 U-003: surface the real failure
            const msg = formatError(e)
            toast.error(`Couldn't remove user: ${msg}`)
        } finally {
            setDeleteLoading(false)
            setConfirmDelete(false)
        }
    }

    const isPending = user.role === 'pending'
    const effectiveRole = user.role

    // Roles this user can see/assign (up to their own level)
    const assignableRoles = (['pending', 'member', 'musician', 'band_leader', 'admin'] as const)
        .filter(r => ROLE_HIERARCHY[r] <= currentLevel)

    // v11.4-04: org-membership control — admin-only, shown on EVERY non-pending
    // row (musician/member/band_leader/admin). Self is allowed (an admin may set
    // their own 'both'); all three options are non-empty so there's no lockout.
    const isLeaderTier = effectiveRole === 'band_leader' || effectiveRole === 'admin'
    const showOrgMembership = isCurrentAdmin && effectiveRole !== 'pending'
    const membershipValue = membershipFromOrgIds(rowOrgIds(user.orgIds))

    const requestMembershipChange = (next: string) => {
        if (next === membershipValue) return
        setPendingMembership(next)
    }

    const confirmMembershipChange = async () => {
        if (!pendingMembership) return
        const next = pendingMembership
        setPendingMembership(null)
        setMembershipLoading(true)
        try {
            // Pass the CURRENT role unchanged (set-role requires newRole) + the new orgIds.
            await updateUserRole(user.uid, effectiveRole, MEMBERSHIP_TO_ORGIDS[next])
            toast.success(`${user.displayName}: band access → ${MEMBERSHIP_OPTION_LABELS[next]}`)
        } catch (e) {
            logger.error(e)
            toast.error(`Couldn't update band access: ${formatError(e)}`)
        } finally {
            setMembershipLoading(false)
        }
    }

    return (
        <>
        <div className={cn("flex flex-wrap items-center gap-3 px-4 py-3 bg-card transition-colors hover:bg-muted/50", isSelected && "bg-brand/5 hover:bg-brand/10")}>
            {/* Checkbox Column */}
            <label className="min-h-11 min-w-11 flex items-center justify-center shrink-0 cursor-pointer">
                <input
                    type="checkbox"
                    checked={isSelected || false}
                    onChange={onSelect}
                    className="h-4 w-4 rounded border-border accent-brand shrink-0 cursor-pointer"
                />
            </label>

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
                    {effectiveRole === 'admin' && <Badge variant="default" className="bg-brand/20 text-brand border-brand/50 text-[10px] h-5 px-1.5">Admin</Badge>}
                    {effectiveRole === 'band_leader' && <Badge variant="default" className="bg-brand/20 text-brand border-brand/50 text-[10px] h-5 px-1.5">Leader</Badge>}
                    {effectiveRole === 'musician' && <Badge variant="default" className="bg-success/20 text-success border-success/50 text-[10px] h-5 px-1.5">Musician</Badge>}
                    {effectiveRole === 'member' && !isPending && <Badge variant="default" className="bg-muted-foreground/20 text-muted-foreground border-muted-foreground/30 text-[10px] h-5 px-1.5">Member</Badge>}
                    {user.soundEngineer && <Badge variant="default" className="bg-success/20 text-success border-success/50 text-[10px] h-5 px-1.5">🎧 Sound</Badge>}
                    {isPending && <Badge variant="destructive" className="bg-amber-500/20 text-amber-500 border-amber-500/50 text-[10px] h-5 px-1.5">Pending</Badge>}
                    {effectiveRole !== 'pending' && <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-border text-muted-foreground" title="Band access (org membership)">{MEMBERSHIP_BADGE_LABELS[membershipValue]}</Badge>}

                    <span className="text-[10px] text-muted-foreground/50 truncate max-w-[100px]" title={user.createdAt ? toDate(user.createdAt)?.toLocaleString() : ""}>
                        {user.createdAt ? formatDistanceToNow(toDate(user.createdAt) || new Date(), { addSuffix: true }) : ""}
                    </span>
                </div>

                {/* Role Management Column (hidden on mobile, col-span-4 on sm) */}
                <div className="hidden sm:flex col-span-4 items-center justify-end gap-2 pr-2">
                    {/* Sound Engineer toggle */}
                    {isCurrentBandLeaderOrAbove && !isSelf && effectiveRole !== 'pending' && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleSoundEngineerToggle}
                            disabled={soundEngLoading}
                            className={cn(
                                "rounded-lg border",
                                user.soundEngineer
                                    ? "bg-success/20 border-success/40 text-success"
                                    : "bg-muted/50 border-border/50 text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted"
                            )}
                            title={user.soundEngineer ? 'Remove sound engineer' : 'Make sound engineer'}
                            aria-label={user.soundEngineer ? 'Remove sound engineer role' : 'Make sound engineer'}
                        >
                            {soundEngLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Headphones className="h-4 w-4" />}
                        </Button>
                    )}

                    {/* Delete (admin only, not self) */}
                    {isCurrentAdmin && !isSelf && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleDelete}
                            disabled={deleteLoading}
                            className={cn(
                                "rounded-lg border",
                                confirmDelete
                                    ? "bg-destructive/20 border-destructive/40 text-destructive"
                                    : "bg-muted/50 border-border/50 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 hover:border-destructive/20"
                            )}
                            title={confirmDelete ? 'Tap again to confirm' : 'Remove user'}
                            aria-label={confirmDelete ? `Confirm removal of ${user.displayName || user.email || 'user'}` : `Remove ${user.displayName || user.email || 'user'}`}
                        >
                            {deleteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </Button>
                    )}

                    {/* Org membership (admin-only, leaders) */}
                    {showOrgMembership && (
                        <Select
                            disabled={membershipLoading}
                            value={membershipValue}
                            onValueChange={requestMembershipChange}
                        >
                            <SelectTrigger
                                className="w-[150px] bg-background border-border h-11 text-xs font-medium"
                                aria-label={`Band access for ${user.displayName || user.email || 'user'}`}
                            >
                                <SelectValue placeholder="Band access" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="crc" className="text-xs">CRC only</SelectItem>
                                <SelectItem value="bl" className="text-xs">Brothers Lazaroff only</SelectItem>
                                <SelectItem value="both" className="text-xs">Both</SelectItem>
                            </SelectContent>
                        </Select>
                    )}

                    {/* Role selector */}
                    {!isSelf ? (
                        <Select
                            disabled={loading}
                            value={effectiveRole}
                            onValueChange={requestRoleChange}
                        >
                            <SelectTrigger className="w-[120px] bg-background border-border h-11 text-xs font-medium">
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
            <div className="sm:hidden basis-full flex items-center justify-between px-2 pt-2 mt-1 border-t border-border/50">
                <div className="flex items-center gap-1.5 flex-wrap flex-1">
                    {effectiveRole === 'admin' && <Badge variant="default" className="bg-brand/20 text-brand border-brand/50 text-[9px] h-4 px-1.5">Admin</Badge>}
                    {effectiveRole === 'band_leader' && <Badge variant="default" className="bg-brand/20 text-brand border-brand/50 text-[9px] h-4 px-1.5">Leader</Badge>}
                    {effectiveRole === 'musician' && <Badge variant="default" className="bg-success/20 text-success border-success/50 text-[9px] h-4 px-1.5">Musician</Badge>}
                    {effectiveRole === 'member' && !isPending && <Badge variant="default" className="bg-muted-foreground/20 text-muted-foreground border-muted-foreground/30 text-[9px] h-4 px-1.5">Member</Badge>}
                    {user.soundEngineer && <Badge variant="default" className="bg-success/20 text-success border-success/50 text-[9px] h-4 px-1.5">🎧 Sound</Badge>}
                    {isPending && <Badge variant="destructive" className="bg-amber-500/20 text-amber-500 border-amber-500/50 text-[9px] h-4 px-1.5">Pending</Badge>}
                    {effectiveRole !== 'pending' && <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-border text-muted-foreground" title="Band access (org membership)">{MEMBERSHIP_BADGE_LABELS[membershipValue]}</Badge>}
                </div>

                <div className="flex items-center gap-1">
                    {/* Sound Engineer toggle (mobile) */}
                    {isCurrentBandLeaderOrAbove && !isSelf && effectiveRole !== 'pending' && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleSoundEngineerToggle}
                            disabled={soundEngLoading}
                            className={cn(
                                "rounded-lg border",
                                user.soundEngineer
                                    ? "bg-success/20 border-success/40 text-success"
                                    : "bg-muted/50 border-border/50 text-muted-foreground/40"
                            )}
                            title={user.soundEngineer ? 'Remove sound engineer' : 'Make sound engineer'}
                            aria-label={user.soundEngineer ? 'Remove sound engineer role' : 'Make sound engineer'}
                        >
                            {soundEngLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Headphones className="h-4 w-4" />}
                        </Button>
                    )}

                    {/* Delete (mobile, admin only) */}
                    {isCurrentAdmin && !isSelf && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleDelete}
                            disabled={deleteLoading}
                            className={cn(
                                "rounded-lg border",
                                confirmDelete
                                    ? "bg-destructive/20 border-destructive/40 text-destructive"
                                    : "bg-muted/50 border-border/50 text-muted-foreground/40"
                            )}
                            title={confirmDelete ? 'Tap again to confirm' : 'Remove user'}
                            aria-label={confirmDelete ? `Confirm removal of ${user.displayName || user.email || 'user'}` : `Remove ${user.displayName || user.email || 'user'}`}
                        >
                            {deleteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </Button>
                    )}

                    {showOrgMembership && (
                        <Select
                            disabled={membershipLoading}
                            value={membershipValue}
                            onValueChange={requestMembershipChange}
                        >
                            <SelectTrigger
                                className="w-[120px] bg-background border-border h-11 text-[10px]"
                                aria-label={`Band access for ${user.displayName || user.email || 'user'}`}
                            >
                                <SelectValue placeholder="Access" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="crc" className="text-xs">CRC only</SelectItem>
                                <SelectItem value="bl" className="text-xs">Brothers Lazaroff only</SelectItem>
                                <SelectItem value="both" className="text-xs">Both</SelectItem>
                            </SelectContent>
                        </Select>
                    )}

                    {!isSelf && (
                        <Select
                            disabled={loading}
                            value={effectiveRole}
                            onValueChange={requestRoleChange}
                        >
                            <SelectTrigger className="w-[100px] bg-background border-border h-11 text-[10px]">
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

        {/* Role change confirmation dialog */}
        <AlertDialog open={!!pendingRole} onOpenChange={(open) => { if (!open) setPendingRole(null) }}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Change Role?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Change {user.displayName}&apos;s role from {ROLE_LABELS[effectiveRole]} to {ROLE_LABELS[pendingRole || ''] || pendingRole}?
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={confirmRoleChange}>Change Role</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        {/* v11.1-02-02: Org-membership change confirmation */}
        <AlertDialog open={!!pendingMembership} onOpenChange={(open) => { if (!open) setPendingMembership(null) }}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Change band access?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Set {user.displayName}&apos;s band access to {MEMBERSHIP_OPTION_LABELS[pendingMembership || ''] || pendingMembership}? This controls which band(s) they belong to — for leaders, which band(s) they can author setlists &amp; charts for; for musicians, which band(s)&apos; setlists &amp; notifications they&apos;re part of.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={confirmMembershipChange}>Update access</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        </>
    )
}
