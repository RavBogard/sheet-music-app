import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

import { getFirestore, initAdmin } from "@/lib/firebase-admin"
import { orgFrom, type AuthExtra } from "@/lib/mcp/org-context"
import { forbiddenRoleEnvelope, richError } from "@/lib/mcp/error-envelopes"
import type { RichErrorEnvelope } from "@/lib/mcp/errors"
import { assertEditor } from "@/lib/mcp/server-tracks-write"
import { listTenantMembers, readTenantRole } from "@/lib/org/access"
import type { TenantRole } from "@/lib/org/membership-types"
import type { OrgId } from "@/lib/org/types"
import { changeTenantRole } from "@/lib/org/tenant-role-change"
import { isTestAccount } from "@/lib/people-test-accounts"
import { isErrorEnvelope } from "./result-iserror"

/**
 * People and access from Claude — the /manage People tab over MCP.
 *
 *   list_access_requests  who is waiting for approval (or denied, or everyone)
 *                         in the caller's tenant. Admin or band leader.
 *   set_member_role       approve, deny or change a role. Admin only. Goes
 *                         through changeTenantRole, the same server function
 *                         as POST /api/admin/set-role, so memberships, claims
 *                         and the audit row stay consistent.
 *
 * Tenant wall: both tools read and write only the caller's tenant
 * (orgFrom(extra)); a person with no membership there is "not found".
 */

export type AccessStatus = "pending" | "denied" | "all"

export interface AccessRequestRow {
    uid: string
    name: string | null
    email: string | null
    requestedAt: string | null
    status: TenantRole
}

function iso(v: unknown): string | null {
    if (v == null) return null
    if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.toISOString() : null
    if (typeof v === "string") return v
    if (typeof v === "object" && typeof (v as { toDate?: unknown }).toDate === "function") {
        try {
            return (v as { toDate: () => Date }).toDate().toISOString()
        } catch {
            return null
        }
    }
    return null
}

function str(v: unknown): string | null {
    return typeof v === "string" && v.length > 0 ? v : null
}

export async function listAccessRequests(
    uid: string,
    args: { status?: AccessStatus; includeTestAccounts?: boolean },
    org: OrgId,
): Promise<{ ok: true; org: OrgId; status: AccessStatus; requests: AccessRequestRow[]; count: number } | RichErrorEnvelope> {
    initAdmin()
    const db = getFirestore()
    const gate = await assertEditor(db, uid, org)
    if (!gate.ok) return gate

    const status = args.status ?? "pending"
    const members = await listTenantMembers(org, status === "all" ? { db } : { roles: [status], db })
    const rows: AccessRequestRow[] = members
        .filter((m) => args.includeTestAccounts === true || !isTestAccount({ uid: m.uid }))
        .map((m) => {
            const p = m.profile ?? {}
            return {
                uid: m.uid,
                name: str(p.displayName),
                email: str(p.email),
                requestedAt: iso(m.requestedAt) ?? iso(m.addedAt) ?? iso(p.createdAt),
                status: m.role,
            }
        })
    // Oldest request first: the one that has waited longest is on top.
    rows.sort((a, b) => (a.requestedAt ?? "").localeCompare(b.requestedAt ?? ""))
    return { ok: true, org, status, requests: rows, count: rows.length }
}

export const SETTABLE_ROLES = ["member", "musician", "band_leader", "admin", "denied"] as const
export type SettableRole = (typeof SETTABLE_ROLES)[number]

export interface SetMemberRoleArgs {
    uid: string
    role: SettableRole
    reason?: string
    dryRun?: boolean
    force?: boolean
    confirm?: boolean
}

export async function setMemberRole(
    callerUid: string,
    args: SetMemberRoleArgs,
    org: OrgId,
): Promise<Record<string, unknown> | RichErrorEnvelope> {
    initAdmin()
    const db = getFirestore()
    const callerRole = await readTenantRole(db, callerUid, org)
    if (callerRole !== "admin") {
        return forbiddenRoleEnvelope({
            callerRole: callerRole ?? null,
            requiredRoles: ["admin"],
            message: "Changing a person's access requires an admin of this tenant.",
            hint: "Ask an admin of this tenant to make the change.",
        })
    }
    if (!(SETTABLE_ROLES as readonly string[]).includes(args.role)) {
        return richError("invalid_role", `role must be one of ${SETTABLE_ROLES.join(", ")}.`, { role: args.role })
    }

    const base = {
        orgId: org,
        targetUid: args.uid,
        newRole: args.role as TenantRole,
        actorUid: callerUid,
        actorEmail: str((await db.collection("users").doc(callerUid).get()).data()?.email) ?? "unknown",
        strict: true,
        memberOnly: true,
        note: args.reason?.trim() || undefined,
        via: "mcp",
    }

    const plan = await changeTenantRole({ ...base, dryRun: true })
    if (!plan.ok) return refusal(plan.code, plan.message, args)

    const profile = (await db.collection("users").doc(args.uid).get()).data() ?? {}
    const person = { uid: args.uid, name: str(profile.displayName), email: str(profile.email) }
    const needsConfirm = args.role === "admin"
    const report = {
        org,
        person,
        before: plan.before,
        after: plan.after,
        changed: plan.changed,
        ...(needsConfirm ? { requiresConfirm: true } : {}),
        notification: "in-app only (the bell); no email, SMS or push",
    }

    if (args.dryRun !== false) return { ok: true, dryRun: true, ...report }
    if (args.force !== true) {
        return richError(
            "force_required",
            "Pass force:true with dryRun:false to change this person's access.",
            { dryRunPlan: report },
            "Show Daniel the before/after first; then re-call with dryRun:false, force:true.",
        )
    }
    if (needsConfirm && args.confirm !== true) {
        return richError(
            "confirm_required",
            "Making someone an admin also needs confirm:true.",
            { errorCode: 400, dryRunPlan: report },
            "Admins can change everyone's access. Re-call with confirm:true only if Daniel said so.",
        )
    }

    const done = await changeTenantRole({ ...base, dryRun: false })
    if (!done.ok) return refusal(done.code, done.message, args)
    return {
        ok: true,
        dryRun: false,
        org,
        person,
        before: done.before,
        after: done.after,
        changed: done.changed,
        notified: done.notified,
    }
}

function refusal(code: string, message: string, args: SetMemberRoleArgs): RichErrorEnvelope {
    if (code === "SELF_CHANGE") {
        return richError("self_change_refused", "Nobody can change their own role.", { errorCode: 400, uid: args.uid }, "Ask another admin of this tenant.")
    }
    if (code === "LAST_ADMIN") {
        return richError(
            "last_admin",
            "This person is the tenant's last admin; demoting them would leave nobody able to manage access.",
            { errorCode: 409, uid: args.uid },
            "Make someone else an admin first.",
        )
    }
    return richError("user_not_found", message === "User not found" ? "No such person in this tenant." : message, { uid: args.uid }, "Use list_access_requests (status:'all') or find_user to get the uid.")
}

function jsonResult(result: unknown) {
    return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: result as Record<string, unknown>,
        isError: isErrorEnvelope(result),
    }
}

function uidFrom(extra: AuthExtra): string {
    const uid = extra.authInfo?.extra?.uid
    if (typeof uid !== "string" || !uid) throw new Error("Unauthenticated MCP request")
    return uid
}

export function registerPeopleAccessTools(server: McpServer): void {
    server.registerTool(
        "list_access_requests",
        {
            description:
                "Admin/band_leader only — people asking to join this tenant, as on the /manage People tab. Default status 'pending' (waiting for approval); 'denied' lists declined requests; 'all' lists everyone in the tenant with their role. Oldest request first. Test accounts are hidden unless includeTestAccounts:true. Returns {ok, requests:[{uid, name, email, requestedAt, status}], count}. Approve or deny with set_member_role.",
            inputSchema: {
                status: z.enum(["pending", "denied", "all"]).optional().describe("Default 'pending'."),
                includeTestAccounts: z.boolean().optional(),
            },
        },
        async (args, extra) => jsonResult(await listAccessRequests(uidFrom(extra), args, orgFrom(extra))),
    )

    server.registerTool(
        "set_member_role",
        {
            description:
                "Admin only — approve, deny or change a person's role in this tenant, as the /manage People tab does. role: 'member' | 'musician' | 'band_leader' | 'admin' approves or changes; 'denied' declines the request. Dry run by default: returns the person and their role before and after, and writes nothing. To apply, pass dryRun:false and force:true after Daniel has seen the dry run; making someone an admin also needs confirm:true. Refuses changing your own role and demoting the tenant's last admin. Applying writes the membership, its claims and an audit row, and leaves an in-app notification; it sends no email, SMS or push.",
            inputSchema: {
                uid: z.string().min(1).describe("The person's uid (from list_access_requests or find_user)."),
                role: z.enum(SETTABLE_ROLES),
                reason: z.string().max(500).optional().describe("Recorded on the audit row."),
                dryRun: z.boolean().optional().describe("Default true."),
                force: z.boolean().optional(),
                confirm: z.boolean().optional().describe("Required with role 'admin'."),
            },
        },
        async (args, extra) => jsonResult(await setMemberRole(uidFrom(extra), args, orgFrom(extra))),
    )
}
