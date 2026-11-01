"use client"

import { updateUserRole, type TenantPerson } from "@/lib/users-firebase"
import { formatError } from "@/lib/format-error"
import { toDate } from "@/lib/firestore-helpers"
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
import { logger } from "@/lib/logger"
import { Headphones, Trash2, Loader2, UserMinus, MoreHorizontal } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
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
import { useOrg, useOrgConfig } from "@/lib/org/org-context"
import { getOrgBranding } from "@/lib/org/branding"
import type { TenantRole } from "@/lib/org/membership-types"
import { useT } from "@/i18n/client"
import { useFormat } from "@/i18n/format-client"
import { useRoleLabel } from "@/components/admin/people/role-labels"

const ROLE_HIERARCHY: Record<string, number> = {
    denied: 0,
    pending: 0,
    member: 1,
    musician: 2,
    band_leader: 3,
    leader: 3, // backward compat
    admin: 4,
}

/** A person's date from the people route (ISO string, millis, or a serialized Timestamp). */
function personDate(v: unknown): Date | null {
    if (!v) return null
    if (typeof v === "object" && v !== null && "_seconds" in v) {
        return new Date(Number((v as { _seconds: number })._seconds) * 1000)
    }
    try {
        return toDate(v as Parameters<typeof toDate>[0])
    } catch {
        return null
    }
}

interface UserRowProps {
    user: TenantPerson
    currentUserUid: string
    /** The viewer's role in this tenant. */
    currentUserRole: string
    isSelected?: boolean
    onSelect?: () => void
    /** Called after any change so the list can be read again. */
    onChanged?: () => void
}

/**
 * One person in /manage People. Multi-tenant phase 2: every role shown and
 * set here is the person's role in THIS tenant (the host); a request
 * (`pending`) is approved with a role or declined (`denied`); "Remove from
 * {tenant}" ends their membership here without touching other tenants.
 */
export function UserRow({ user, currentUserUid, currentUserRole, isSelected, onSelect, onChanged }: UserRowProps) {
    const org = useOrg()
    const orgConfig = useOrgConfig()
    const tenantName = orgConfig?.name || getOrgBranding(org).shortName
    const t = useT()
    const fmt = useFormat()
    const roleLabel = useRoleLabel()

    const [loading, setLoading] = useState(false)
    const [soundEngLoading, setSoundEngLoading] = useState(false)
    const [deleteLoading, setDeleteLoading] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [pendingRole, setPendingRole] = useState<string | null>(null)
    const [confirmRemove, setConfirmRemove] = useState(false)
    const [approveAs, setApproveAs] = useState<string>("member")

    // v44-06 UX-011: if the parent refreshes and the user's role has changed
    // (either via this confirmation succeeding or an out-of-band update),
    // clear any stale pending-role confirmation so the row returns to idle
    // and the select reflects the latest props.
    useEffect(() => {
        setPendingRole(null)
    }, [user.role])

    const currentLevel = ROLE_HIERARCHY[currentUserRole] ?? 0
    const isCurrentAdmin = currentUserRole === 'admin'
    const isCurrentBandLeaderOrAbove = currentLevel >= ROLE_HIERARCHY.band_leader
    const isSelf = user.uid === currentUserUid
    const name = user.displayName || user.email || t("admin-people.userFallbackName")

    const setRole = async (newRole: TenantRole | null, success: string) => {
        setLoading(true)
        try {
            await updateUserRole(user.uid, newRole, { tenant: org })
            toast.success(success)
            onChanged?.()
        } catch (e) {
            logger.error(e)
            // v4.4 U-001: surface the real reason so admins can act (permission
            // denied? network? server error?).
            toast.error(t("admin-people.roleUpdateFailed", { reason: formatError(e) }))
        } finally {
            setLoading(false)
        }
    }

    const requestRoleChange = (newRole: string) => {
        if (isSelf) {
            toast.error(t("admin-people.cannotChangeOwnRole"))
            return
        }
        const targetLevel = ROLE_HIERARCHY[newRole] ?? 0
        if (targetLevel > currentLevel) {
            toast.error(t("admin-people.roleLimit", { role: roleLabel(currentUserRole) }))
            return
        }
        setPendingRole(newRole)
    }

    const confirmRoleChange = async () => {
        if (!pendingRole) return
        const newRole = pendingRole
        setPendingRole(null)
        await setRole(newRole as TenantRole, t("admin-people.roleUpdated", { personName: user.displayName, role: roleLabel(newRole) }))
    }

    const approve = async () => {
        const targetLevel = ROLE_HIERARCHY[approveAs] ?? 0
        if (targetLevel > currentLevel) {
            toast.error(t("admin-people.roleLimit", { role: roleLabel(currentUserRole) }))
            return
        }
        await setRole(approveAs as TenantRole, t("admin-people.roleUpdated", { personName: user.displayName, role: roleLabel(approveAs) }))
    }

    const decline = async () => {
        await setRole('denied', t("admin-people.roleUpdated", { personName: user.displayName, role: roleLabel("denied") }))
    }

    const confirmRemoveFromTenant = async () => {
        setConfirmRemove(false)
        await setRole(null, t("admin-people.removedFromTenant", { personName: user.displayName, tenantName }))
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
                body: JSON.stringify({ targetUserId: user.uid, soundEngineer: !user.soundEngineer, tenant: org }),
            })
            if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                throw new Error(data.error || t("admin-people.requestFailed", { status: res.status }))
            }
            toast.success(user.soundEngineer ? t("admin-people.soundEngineerRemoved", { personName: user.displayName }) : t("admin-people.soundEngineerEnabled", { personName: user.displayName }))
            onChanged?.()
        } catch (e) {
            logger.error(e)
            // v4.4 U-002: surface the real failure reason
            const msg = formatError(e)
            toast.error(t("admin-people.soundEngineerFailed", { reason: msg }))
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
            if (!currentUser) throw new Error(t("admin-people.notAuthenticated"))
            const token = await currentUser.getIdToken()
            const res = await fetch("/api/admin/delete-user", {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ targetUserId: user.uid }),
            })
            if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                throw new Error(data.error || t("admin-people.failed"))
            }
            toast.success(t("admin-people.removedUser", { personName: user.displayName }))
            onChanged?.()
        } catch (e) {
            logger.error(e)
            // v4.4 U-003: surface the real failure
            const msg = formatError(e)
            toast.error(t("admin-people.removeUserFailed", { reason: msg }))
        } finally {
            setDeleteLoading(false)
            setConfirmDelete(false)
        }
    }

    const effectiveRole = user.role
    const isPending = effectiveRole === 'pending'
    const isDenied = effectiveRole === 'denied'
    const created = personDate(user.createdAt)

    // Roles this user can see/assign (up to their own level)
    const assignableRoles = (['pending', 'member', 'musician', 'band_leader', 'admin'] as const)
        .filter(r => ROLE_HIERARCHY[r] <= currentLevel)
    const approvableRoles = assignableRoles.filter(r => r !== 'pending')

    // Remove from this tenant: admins only, never self, not for open requests
    // (those are declined instead).
    const canRemove = isCurrentAdmin && !isSelf && !isPending

    const roleBadges = (size: "sm" | "xs") => {
        const cls = size === "sm" ? "text-xs h-5 px-1.5" : "text-xs h-4 px-1.5"
        return (
            <>
                {effectiveRole === 'admin' && <Badge variant="default" className={cn("bg-accent text-brand border-brand/40", cls)}>{t("admin-people.badgeAdmin")}</Badge>}
                {effectiveRole === 'band_leader' && <Badge variant="default" className={cn("bg-accent text-brand border-brand/40", cls)}>{t("admin-people.badgeLeader")}</Badge>}
                {effectiveRole === 'musician' && <Badge variant="default" className={cn("bg-success/10 text-success border-success/40", cls)}>{t("admin-people.badgeMusician")}</Badge>}
                {effectiveRole === 'member' && <Badge variant="default" className={cn("bg-muted text-muted-foreground border-border", cls)}>{t("admin-people.badgeMember")}</Badge>}
                {user.soundEngineer && <Badge variant="default" className={cn("bg-success/10 text-success border-success/40", cls)}>{t("admin-people.badgeSound")}</Badge>}
                {isPending && <Badge variant="outline" className={cn("bg-caution/10 text-caution border-caution/40", cls)}>{t("admin-people.badgePending")}</Badge>}
                {isDenied && <Badge variant="outline" className={cn("border-border text-muted-foreground", cls)}>{roleLabel("denied")}</Badge>}
            </>
        )
    }

    const soundButton = (isCurrentBandLeaderOrAbove && !isSelf && !isPending && !isDenied) && (
        <Button
            variant="ghost"
            size="icon"
            onClick={handleSoundEngineerToggle}
            disabled={soundEngLoading}
            className={cn(
                "rounded-md border",
                user.soundEngineer
                    ? "bg-success/20 border-success/40 text-success"
                    : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-accent"
            )}
            title={user.soundEngineer ? t("admin-people.removeSoundEngineer") : t("admin-people.makeSoundEngineer")}
            aria-label={user.soundEngineer ? t("admin-people.removeSoundEngineerRole") : t("admin-people.makeSoundEngineer")}
        >
            {soundEngLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Headphones className="h-4 w-4" />}
        </Button>
    )

    const removeButton = canRemove && (
        <Button
            variant="ghost"
            size="icon"
            onClick={() => setConfirmRemove(true)}
            disabled={loading}
            className="rounded-md border bg-card border-border text-muted-foreground hover:text-destructive hover:bg-destructive/10 hover:border-destructive/20"
            title={t("admin-people.removeFromTenant", { tenantName })}
            aria-label={t("admin-people.removePersonFromTenant", { personName: name, tenantName })}
        >
            <UserMinus className="h-4 w-4" />
        </Button>
    )

    const deleteButton = (isCurrentAdmin && !isSelf) && (
        <Button
            variant="ghost"
            size="icon"
            onClick={handleDelete}
            disabled={deleteLoading}
            className={cn(
                "rounded-md border",
                confirmDelete
                    ? "bg-destructive/20 border-destructive/40 text-destructive"
                    : "bg-card border-border text-muted-foreground hover:text-destructive hover:bg-destructive/10 hover:border-destructive/20"
            )}
            title={confirmDelete ? t("admin-people.tapAgainToConfirm") : t("admin-people.removeUser")}
            aria-label={confirmDelete ? t("admin-people.confirmRemoval", { personName: name }) : t("admin-people.removePerson", { personName: name })}
        >
            {deleteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </Button>
    )

    // A request: approve with a role (default Member) or decline.
    const requestControls = (triggerClass: string) => (
        <>
            <Select disabled={loading} value={approveAs} onValueChange={setApproveAs}>
                <SelectTrigger
                    className={triggerClass}
                    aria-label={t("admin-people.approveAsLabel", { personName: name })}
                >
                    <SelectValue placeholder={t("admin-people.rolePlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                    {approvableRoles.map(role => (
                        <SelectItem key={role} value={role} className="text-xs">
                            {roleLabel(role)}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <Button
                size="sm"
                onClick={approve}
                disabled={loading}
                className="h-11 text-xs"
                aria-label={t("admin-people.approveAsRole", { personName: name, role: roleLabel(approveAs) })}
            >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t("admin-people.approve")}
            </Button>
            <Button
                variant="outline"
                size="sm"
                onClick={decline}
                disabled={loading}
                className="h-11 text-xs bg-destructive/10 hover:bg-destructive/20 text-destructive border-destructive/20"
                aria-label={t("admin-people.declinePerson", { personName: name })}
            >
                {t("admin-people.decline")}
            </Button>
        </>
    )

    const roleSelect = (triggerClass: string) => (
        <Select
            disabled={loading}
            value={effectiveRole}
            onValueChange={requestRoleChange}
        >
            <SelectTrigger className={triggerClass} aria-label={t("admin-people.roleFor", { personName: name })}>
                <SelectValue placeholder={t("admin-people.rolePlaceholder")}>{roleLabel(effectiveRole)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
                {assignableRoles.map(role => (
                    <SelectItem key={role} value={role} className="text-xs">
                        {roleLabel(role)}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    )

    // Requests are approved/declined by admins (the role route is admin-only).
    const showRequestControls = isPending && isCurrentAdmin && !isSelf

    return (
        <>
        {/* Consistency pass: one dense hairline row per person, the same as
            the setlists list. Avatar, name over a muted meta line (email,
            role badges, joined), the person's icon actions, and a compact
            role select on the right. Below sm the icon actions fold into a
            "more" menu so the row stays one line; a request's approve and
            decline controls wrap under it there. */}
        <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 px-2 sm:px-3 py-1.5 min-h-14 bg-card transition-colors hover:bg-accent/50", isSelected && "bg-accent")}>
            <label className="min-h-11 min-w-11 flex items-center justify-center shrink-0 cursor-pointer">
                <input
                    type="checkbox"
                    checked={isSelected || false}
                    onChange={onSelect}
                    aria-label={t("admin-people.selectPerson", { personName: name })}
                    className="h-4 w-4 rounded border-border accent-brand shrink-0 cursor-pointer"
                />
            </label>

            <Avatar className="h-9 w-9 border border-border shrink-0">
                <AvatarImage src={user.photoURL ?? undefined} alt="" />
                <AvatarFallback>{user.displayName?.[0] || "?"}</AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                    <p className="font-semibold text-foreground text-[15px] leading-snug truncate">{user.displayName}</p>
                    {isSelf && <Badge variant="outline" className="border-border text-muted-foreground text-xs h-4 px-1 shrink-0">{t("admin-people.youBadge")}</Badge>}
                </div>
                <div className="tnum flex items-center gap-x-2 gap-y-0.5 flex-wrap text-xs font-medium text-muted-foreground min-w-0">
                    <span className="truncate max-w-full" title={user.email ?? undefined}>{user.email}</span>
                    <span className="hidden sm:inline-flex items-center gap-1.5">
                        {roleBadges("sm")}
                    </span>
                    {created ? (
                        <span className="hidden md:inline" title={fmt.dateTime(created)}>{fmt.relative(created)}</span>
                    ) : null}
                </div>
            </div>

            {/* Icon actions inline from sm */}
            <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                {soundButton}
                {removeButton}
                {deleteButton}
            </div>

            {/* ...and in a "more" menu below sm */}
            {(soundButton || removeButton || deleteButton) ? (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="sm:hidden size-11 shrink-0 text-muted-foreground" aria-label={t("admin-people.moreActions", { personName: name })}>
                            <MoreHorizontal className="h-5 w-5" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        {soundButton ? (
                            <DropdownMenuItem onSelect={() => { void handleSoundEngineerToggle() }}>
                                <Headphones className="me-2 h-4 w-4" />
                                {user.soundEngineer ? t("admin-people.removeSoundEngineer") : t("admin-people.makeSoundEngineer")}
                            </DropdownMenuItem>
                        ) : null}
                        {removeButton ? (
                            <DropdownMenuItem onSelect={() => setConfirmRemove(true)}>
                                <UserMinus className="me-2 h-4 w-4" />
                                {t("admin-people.removeFromTenant", { tenantName })}
                            </DropdownMenuItem>
                        ) : null}
                        {deleteButton ? (
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => { void handleDelete() }}>
                                <Trash2 className="me-2 h-4 w-4" />
                                {confirmDelete ? t("admin-people.tapAgainToConfirm") : t("admin-people.removeUser")}
                            </DropdownMenuItem>
                        ) : null}
                    </DropdownMenuContent>
                </DropdownMenu>
            ) : null}

            {showRequestControls ? (
                <div className="flex items-center gap-2 flex-wrap basis-full sm:basis-auto justify-end shrink-0">
                    {requestControls("w-[7.5rem] h-11 text-sm font-medium bg-card border-border")}
                </div>
            ) : !isSelf ? (
                <div className="shrink-0">
                    {roleSelect("w-[7.5rem] h-11 text-sm font-medium bg-card border-border")}
                </div>
            ) : (
                <span className="shrink-0 text-xs font-semibold text-muted-foreground px-3 py-1.5 border border-border rounded-md bg-muted">
                    {roleLabel(effectiveRole)}
                </span>
            )}
        </div>

        {/* Role change confirmation dialog */}
        <AlertDialog open={!!pendingRole} onOpenChange={(open) => { if (!open) setPendingRole(null) }}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{t("admin-people.changeRoleTitle")}</AlertDialogTitle>
                    <AlertDialogDescription>
                        {t("admin-people.changeRoleBody", { personName: user.displayName, fromRole: roleLabel(effectiveRole), toRole: roleLabel(pendingRole || "") })}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>{t("admin-people.cancel")}</AlertDialogCancel>
                    <AlertDialogAction onClick={confirmRoleChange}>{t("admin-people.changeRoleConfirm")}</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        {/* Remove from this tenant confirmation */}
        <AlertDialog open={confirmRemove} onOpenChange={(open) => { if (!open) setConfirmRemove(false) }}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{t("admin-people.removeFromTenantTitle", { tenantName })}</AlertDialogTitle>
                    <AlertDialogDescription>
                        {t("admin-people.removeFromTenantBody", { personName: user.displayName, tenantName })}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>{t("admin-people.cancel")}</AlertDialogCancel>
                    <AlertDialogAction onClick={confirmRemoveFromTenant}>{t("admin-people.removeFromTenant", { tenantName })}</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        </>
    )
}
