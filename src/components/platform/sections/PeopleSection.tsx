"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { Invite, TenantDetail, TenantMember, WriteResult } from "@/lib/platform/tenants"
import type { TenantRole } from "@/lib/org/membership-types"
import { errorText, platformApi } from "../api"
import { ConfirmDialog, CopyButton, DiffList, DiffPreview, ErrorLine, PlatformCard, ROLE_LABELS, selectClass, useDryRun } from "../shared"

const MEMBER_ROLES: Array<Exclude<TenantRole, "denied" | "pending">> = ["admin", "band_leader", "musician", "member"]
const INVITE_ROLES: Array<Invite["role"]> = ["admin", "band_leader"]

const who = (m: TenantMember) => m.name || m.email || m.uid

export function PeopleSection({ detail }: { detail: TenantDetail }) {
    const orgId = detail.summary.orgId
    const tenantName = detail.summary.name
    const [members, setMembers] = useState<TenantMember[] | null>(null)
    const [invites, setInvites] = useState<Invite[]>([])
    const [loadError, setLoadError] = useState<string | null>(null)
    const [pendingRemove, setPendingRemove] = useState<{ member: TenantMember; result: WriteResult<TenantMember> } | null>(null)
    const [removeError, setRemoveError] = useState<string | null>(null)
    const [inviteEmail, setInviteEmail] = useState("")
    const [inviteRole, setInviteRole] = useState<Invite["role"]>("admin")
    const [newLink, setNewLink] = useState<string | null>(null)

    const load = useCallback(async () => {
        setLoadError(null)
        try {
            const [m, i] = await Promise.all([platformApi.listMembers(orgId), platformApi.listInvites(orgId)])
            setMembers(m)
            setInvites(i)
        } catch (e) {
            setLoadError(errorText(e))
            setMembers((cur) => cur ?? [])
        }
    }, [orgId])

    useEffect(() => { void load() }, [load])

    const roleRun = useDryRun<TenantMember>(() => void load())
    const inviteRun = useDryRun<Invite>((r) => {
        setNewLink(r.after?.link ?? null)
        setInviteEmail("")
        void load()
    })

    const startRemove = async (m: TenantMember) => {
        setRemoveError(null)
        try {
            const result = await platformApi.removeMember(orgId, m.uid, true)
            setPendingRemove({ member: m, result })
        } catch (e) {
            setRemoveError(errorText(e))
        }
    }

    const confirmRemove = async () => {
        const p = pendingRemove
        setPendingRemove(null)
        if (!p) return
        try {
            await platformApi.removeMember(orgId, p.member.uid, false)
            await load()
        } catch (e) {
            setRemoveError(errorText(e))
        }
    }

    const active = (members ?? []).filter((m) => m.role !== "pending" && m.role !== "denied")
    const pending = (members ?? []).filter((m) => m.role === "pending")
    const openInvites = invites.filter((i) => !i.acceptedAt)

    return (
        <PlatformCard id="people" title="People" description="Members of this tenant and their roles.">
            {members === null ? (
                <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading people…</p>
            ) : (
                <>
                    <ErrorLine error={loadError} />
                    {active.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No members yet.</p>
                    ) : (
                        <ul className="divide-y divide-border">
                            {active.map((m) => (
                                <li key={m.uid} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium truncate">{who(m)}</p>
                                        {m.email && m.name && <p className="text-xs text-muted-foreground truncate">{m.email}</p>}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <select
                                            aria-label={`Role for ${who(m)}`}
                                            className={selectClass}
                                            value={m.role}
                                            disabled={roleRun.busy || !!roleRun.result}
                                            onChange={(e) => {
                                                const role = e.target.value as Exclude<TenantRole, "denied">
                                                void roleRun.preview((dry) => platformApi.setMemberRole(orgId, { uid: m.uid }, role, dry))
                                            }}
                                        >
                                            {MEMBER_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                                        </select>
                                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => void startRemove(m)}>
                                            Remove
                                        </Button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                    <ErrorLine error={roleRun.error} />
                    {roleRun.result && (
                        <DiffPreview result={roleRun.result} busy={roleRun.busy} onApply={() => void roleRun.apply()} onCancel={roleRun.cancel} />
                    )}

                    <div className="space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Waiting for approval</p>
                        {pending.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No requests.</p>
                        ) : (
                            <ul className="divide-y divide-border">
                                {pending.map((m) => (
                                    <li key={m.uid} className="flex flex-wrap items-center justify-between gap-2 py-2">
                                        <span className="text-sm">{who(m)}</span>
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                disabled={roleRun.busy || !!roleRun.result}
                                                onClick={() => void roleRun.preview((dry) => platformApi.setMemberRole(orgId, { uid: m.uid }, "musician", dry))}
                                            >
                                                Approve as musician
                                            </Button>
                                            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => void startRemove(m)}>
                                                Decline
                                            </Button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    <ErrorLine error={removeError} />
                </>
            )}

            <div className="space-y-3 border-t border-border pt-4">
                <form
                    className="flex flex-wrap items-end gap-2"
                    onSubmit={(e) => {
                        e.preventDefault()
                        setNewLink(null)
                        const email = inviteEmail.trim()
                        void inviteRun.preview((dry) => platformApi.invite(orgId, email, inviteRole, dry))
                    }}
                >
                    <div className="space-y-1.5">
                        <Label htmlFor="invite-email">Invite admin</Label>
                        <Input id="invite-email" type="email" className="w-64" placeholder="name@example.org" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
                    </div>
                    <select aria-label="Invite as" className={selectClass} value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Invite["role"])}>
                        {INVITE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                    <Button type="submit" variant="outline" disabled={inviteRun.busy || !!inviteRun.result || !inviteEmail.includes("@")}>
                        Make invite link
                    </Button>
                </form>
                <ErrorLine error={inviteRun.error} />
                {inviteRun.result && (
                    <DiffPreview result={inviteRun.result} busy={inviteRun.busy} applyLabel="Create invite" onApply={() => void inviteRun.apply()} onCancel={inviteRun.cancel} />
                )}
                {newLink && (
                    <div className="rounded-lg border border-border p-3 space-y-2">
                        <p className="text-sm">Send this link. It works once, after they sign in at {tenantName}&apos;s address.</p>
                        <div className="flex flex-wrap items-center gap-2">
                            <code className="text-xs break-all bg-muted/50 rounded px-2 py-1">{newLink}</code>
                            <CopyButton text={newLink} label="Copy link" />
                        </div>
                    </div>
                )}
                {openInvites.length > 0 && (
                    <div className="space-y-1">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pending invites</p>
                        <ul className="text-sm space-y-1">
                            {openInvites.map((i) => (
                                <li key={i.id} className="flex flex-wrap items-center gap-2">
                                    <span>{i.email}</span>
                                    <span className="text-muted-foreground">{ROLE_LABELS[i.role]}, expires {new Date(i.expiresAt).toLocaleDateString()}</span>
                                    <CopyButton text={i.link} label="Copy link" />
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            <ConfirmDialog
                open={pendingRemove !== null}
                onOpenChange={(o) => !o && setPendingRemove(null)}
                title={pendingRemove ? `Remove ${who(pendingRemove.member)} from ${tenantName}?` : ""}
                description={`They lose access to ${tenantName}. Their account and other tenants are not touched.`}
                confirmLabel="Remove"
                onConfirm={() => void confirmRemove()}
            >
                {pendingRemove && pendingRemove.result.diff.length > 0 && <DiffList diff={pendingRemove.result.diff} />}
            </ConfirmDialog>
        </PlatformCard>
    )
}
