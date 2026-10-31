"use client"

import { useState, useMemo, useEffect, useCallback, useRef } from "react"
import { useAuth } from "@/lib/auth-context"
import { fetchTenantPeople, updateUserRole, type TenantPerson } from "@/lib/users-firebase"
import { UserRow } from "@/components/admin/UserRow"
import { useOrg } from "@/lib/org/org-context"
import type { TenantRole } from "@/lib/org/membership-types"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Loader2, Search, FilterX } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import { useT } from "@/i18n/client"
import { useRoleLabel } from "@/components/admin/people/role-labels"
import { isTestAccount } from "@/lib/people-test-accounts"

type FilterRole = 'all' | 'pending' | 'member' | 'musician' | 'band_leader' | 'admin' | 'denied'

/** Filter tab labels (literal keys, so the catalogue test sees them). */
const FILTER_LABEL_KEYS = {
    all: "admin-people.filterAll",
    pending: "admin-people.filterRequests",
    member: "admin-people.filterMember",
    musician: "admin-people.filterMusician",
    band_leader: "admin-people.filterLeader",
    admin: "admin-people.filterAdmin",
    denied: "admin-people.roleDenied",
} as const satisfies Record<FilterRole, string>

/** Re-read the list this often while the page is visible. */
const REFRESH_MS = 30_000

/**
 * /manage People. Multi-tenant phase 2: lists the people of THIS tenant (the
 * host) through GET /api/tenant/people, with each person's role here.
 * "Requests" are people waiting for approval (`pending`).
 */
export function PeopleSection() {
    const { user, role: myRole, isAdmin, isBandLeader } = useAuth()
    const org = useOrg()
    const t = useT()
    const roleLabel = useRoleLabel()
    const [users, setUsers] = useState<TenantPerson[]>([])
    const [usersLoading, setUsersLoading] = useState(true)
    const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set())
    const [bulkLoading, setBulkLoading] = useState(false)

    // Filtering and Search State
    const [searchQuery, setSearchQuery] = useState("")
    const [roleFilter, setRoleFilter] = useState<FilterRole>('all')

    // Band leaders and admins can see the people section
    const canManagePeople = isBandLeader

    const mounted = useRef(true)
    useEffect(() => () => { mounted.current = false }, [])

    const reload = useCallback(async () => {
        try {
            const { people } = await fetchTenantPeople()
            if (mounted.current) setUsers(people)
        } catch {
            // Keep the last list; a later refresh may succeed.
        } finally {
            if (mounted.current) setUsersLoading(false)
        }
    }, [])

    useEffect(() => {
        if (!canManagePeople) return
        void reload()
        const timer = setInterval(() => {
            if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
            void reload()
        }, REFRESH_MS)
        return () => clearInterval(timer)
    }, [canManagePeople, reload, org])

    // WEB-15: synthetic test accounts never show in the real people list.
    const [showTestAccounts, setShowTestAccounts] = useState(false)
    const testAccountCount = useMemo(() => users.filter(isTestAccount).length, [users])
    const visibleUsers = useMemo(
        () => (showTestAccounts ? users : users.filter(u => !isTestAccount(u))),
        [users, showTestAccounts],
    )
    const pendingCount = visibleUsers.filter(u => u.role === "pending").length
    const currentUserRole = myRole || 'member'

    // Derived filtered users
    const filteredUsers = useMemo(() => {
        return visibleUsers.filter(u => {
            const matchesSearch = u.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                u.email?.toLowerCase().includes(searchQuery.toLowerCase())
            const matchesRole = roleFilter === 'all' ||
                (roleFilter === 'pending' && u.role === 'pending') ||
                (roleFilter === 'band_leader' && u.role === 'band_leader') ||
                (u.role === roleFilter)
            return matchesSearch && matchesRole
        })
    }, [visibleUsers, searchQuery, roleFilter])

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
        setBulkLoading(true)
        try {
            const uids = Array.from(selectedUsers)
            let success = 0
            let failed = 0
            for (const uid of uids) {
                try {
                    await updateUserRole(uid, role as TenantRole, { tenant: org })
                    success++
                } catch {
                    failed++
                }
            }
            // The bulk toast names member/musician/band leader; any other role shows as stored.
            const label = role === 'member' || role === 'musician' || role === 'band_leader' ? roleLabel(role) : role
            if (failed === 0) {
                toast.success(t("admin-people.bulkUpdated", { count: success, role: label }))
            } else if (success > 0) {
                toast.warning(t("admin-people.bulkPartial", { count: success, failed }))
            } else {
                toast.error(t("admin-people.bulkFailed", { count: failed }))
            }
            clearSelection()
            void reload()
        } finally {
            setBulkLoading(false)
        }
    }

    return (
        <section className="space-y-4">
            {/* Pending badge + Bulk Actions */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-2">
                    {pendingCount > 0 && (
                        <span className="text-xs font-bold bg-caution/10 text-caution border border-caution/25 px-2 py-0.5 rounded-md flex items-center gap-1.5">
                            <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-caution" />
                            {t("admin-people.pendingRequests", { count: pendingCount })}
                        </span>
                    )}
                </div>

                {/* Bulk Actions Header (visible when items selected) */}
                {selectedUsers.size > 0 && (
                    <div className="flex items-center gap-2 bg-brand/10 border border-brand/20 px-3 py-1.5 rounded-lg animate-in fade-in slide-in-from-top-2">
                        <span className="text-xs font-semibold text-brand me-2">
                            {t("admin-people.selectedCount", { count: selectedUsers.size })}
                        </span>

                        <div className="flex items-center gap-1.5 border-s border-brand/20 ps-3">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => bulkSetRole('member')}
                                disabled={bulkLoading}
                                className="text-xs bg-background/50 hover:bg-background text-foreground"
                            >
                                {bulkLoading ? <Spinner size="sm" /> : null}
                                {t("admin-people.makeMember")}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => bulkSetRole('musician')}
                                disabled={bulkLoading}
                                className="text-xs bg-success/10 hover:bg-success/20 text-success border-success/20"
                            >
                                {bulkLoading ? <Spinner size="sm" /> : null}
                                {t("admin-people.makeMusician")}
                            </Button>
                            {isAdmin && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => bulkSetRole('band_leader')}
                                    disabled={bulkLoading}
                                    className="text-xs bg-brand/10 hover:bg-brand/20 text-foreground border-brand/20"
                                >
                                    {bulkLoading ? <Spinner size="sm" /> : null}
                                    {t("admin-people.makeBandLeader")}
                                </Button>
                            )}
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => bulkSetRole('denied')}
                                disabled={bulkLoading}
                                className="text-xs bg-destructive/10 hover:bg-destructive/20 text-destructive border-destructive/20 ms-2"
                                title={t("admin-people.denyAccessTitle")}
                                aria-label={t("admin-people.denyAccessLabel")}
                            >
                                {bulkLoading ? <Spinner size="sm" /> : null}
                                {t("admin-people.denyAccess")}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={clearSelection} className="text-xs text-muted-foreground hover:text-foreground ms-2">
                                {t("admin-people.cancel")}
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {testAccountCount > 0 && (
                <button
                    type="button"
                    data-testid="people-test-accounts-toggle"
                    aria-pressed={showTestAccounts}
                    onClick={() => setShowTestAccounts(v => !v)}
                    className="min-h-11 px-1 text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
                >
                    {showTestAccounts
                        ? t("admin-people.testAccountsHide")
                        : t("admin-people.testAccountsHidden", { count: testAccountCount })}
                </button>
            )}

            {/* Filters Toolbar */}
            <div className="flex items-center gap-3 p-1">
                <div className="relative flex-1 max-w-xs">
                    <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder={t("admin-people.searchPlaceholder")}
                        className="w-full bg-card border border-border rounded-lg ps-9 pe-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring transition-shadow min-h-11"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                <div className="flex items-center bg-card border border-border rounded-lg p-0.5 overflow-x-auto min-w-0 hide-scrollbar">
                    {(['all', 'pending', 'member', 'musician', 'band_leader', 'admin', 'denied'] as const).map((role) => (
                        <Button
                            key={role}
                            variant="ghost"
                            size="sm"
                            onClick={() => setRoleFilter(role)}
                            className={cn(
                                "text-xs font-medium rounded-md min-h-11",
                                roleFilter === role
                                    ? "bg-accent text-foreground font-semibold ring-1 ring-inset ring-brand"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}
                        >
                            {t(FILTER_LABEL_KEYS[role])}
                        </Button>
                    ))}
                </div>

                {(searchQuery || roleFilter !== 'all') && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => { setSearchQuery(""); setRoleFilter('all') }}
                        className="text-muted-foreground hover:text-foreground flex-shrink-0"
                        title={t("admin-people.clearFilters")}
                        aria-label={t("admin-people.clearFilters")}
                    >
                        <FilterX className="w-4 h-4" />
                    </Button>
                )}
            </div>

            {/* Data Grid list */}
            {usersLoading ? (
                <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : (
                <div className="bg-card border border-rule rounded-lg overflow-hidden divide-y divide-rule">
                    {/* Grid Header */}
                    <div className="flex items-center gap-3 px-4 py-2 bg-muted">
                        <label className="min-h-11 min-w-11 flex items-center justify-center shrink-0 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={selectedUsers.size === filteredUsers.length && filteredUsers.length > 0}
                                onChange={() => selectedUsers.size > 0 ? clearSelection() : selectAllFiltered()}
                                className="h-5 w-5 rounded border-border accent-brand shrink-0 cursor-pointer"
                            />
                        </label>
                        <div className="min-w-0 flex-1 grid grid-cols-12 gap-4 items-center ps-2">
                            <div className="col-span-12 sm:col-span-5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("admin-people.columnUser")}</div>
                            <div className="hidden sm:block col-span-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("admin-people.columnAttributes")}</div>
                            <div className="hidden sm:block col-span-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-end pe-2">{t("admin-people.columnRoleManagement")}</div>
                        </div>
                    </div>

                    {/* Grid Rows */}
                    <div className="max-h-[600px] overflow-y-auto">
                        {filteredUsers.length === 0 ? (
                            <div className="p-8 text-center text-muted-foreground text-sm">
                                {users.length === 0 ? t("admin-people.emptyNoUsers") : t("admin-people.emptyNoMatches")}
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
                                    onChanged={() => { void reload() }}
                                />
                            ))
                        )}
                    </div>
                </div>
            )}
        </section>
    )
}
