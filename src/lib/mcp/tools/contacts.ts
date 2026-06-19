import { FieldValue } from "firebase-admin/firestore"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { assertEditor } from "@/lib/mcp/server-tracks-write"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import { rowOrg } from "@/lib/mcp/org-context"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"

/**
 * v11.4-03 (D8 item 3) — contacts: a leader's address book of remembered
 * ad-hoc recipients (people with NO account — name + email/phone). Org-scoped,
 * leader-gated. Sending to a contact reuses the existing publish path (pass it
 * as a `recipients[]` entry on publish_setlist); these tools only persist +
 * surface them. SMS is held this milestone — `phone` is stored for the future.
 */

export interface ContactView {
    id: string
    name: string
    email: string | null
    phone: string | null
}

export interface ListContactsResult {
    ok: true
    contacts: ContactView[]
}

export interface CreateContactArgs {
    name?: string
    email?: string
    phone?: string
}

export interface CreateContactResult {
    ok: true
    /** false when an existing same-org contact with this email was returned (dedupe). */
    created: boolean
    contact: ContactView
}

export interface DeleteContactArgs {
    id?: string
}

export interface DeleteContactResult {
    ok: true
    deletedId: string
}

function toView(id: string, d: Record<string, unknown>): ContactView {
    return {
        id,
        name: typeof d.name === "string" ? d.name : "",
        email: typeof d.email === "string" ? d.email : null,
        phone: typeof d.phone === "string" ? d.phone : null,
    }
}

export async function listContacts(
    callerUid: string,
    _args: Record<string, never>,
    org: OrgId = DEFAULT_ORG_ID,
): Promise<ListContactsResult | RichErrorEnvelope> {
    initAdmin()
    const db = getFirestore()
    const editor = await assertEditor(db, callerUid)
    if (!editor.ok) return editor

    const snap = await db.collection("contacts").where("orgId", "==", org).get()
    const contacts = snap.docs
        .map((doc) => toView(doc.id, doc.data() as Record<string, unknown>))
        .sort((a, b) => a.name.localeCompare(b.name))
    return { ok: true, contacts }
}

export interface FindContactArgs {
    email?: string
    nameContains?: string
}

export interface FindContactResult {
    ok: true
    contacts: ContactView[]
    count: number
}

/**
 * v11.7-04: the read partner to create_contact/delete_contact — look up a saved
 * contact by email (case-insensitive exact) or name (case-insensitive substring)
 * so an agent doesn't have to list_contacts and scan. Org-scoped + assertEditor-gated
 * like its siblings (contacts are PII/people). In-org scan + in-memory filter,
 * matching createContact's dedupe approach (small address book — no email index).
 */
export async function findContact(
    callerUid: string,
    args: FindContactArgs,
    org: OrgId = DEFAULT_ORG_ID,
): Promise<FindContactResult | RichErrorEnvelope> {
    const email = args.email?.trim() || undefined
    const nameContains = args.nameContains?.trim() || undefined
    if (!email && !nameContains) {
        return richError(
            "invalid_argument",
            "Pass `email` or `nameContains` to look up a contact.",
            { fields: ["email", "nameContains"] },
            "email matches exactly (case-insensitive); nameContains is a case-insensitive substring.",
        )
    }

    initAdmin()
    const db = getFirestore()
    const editor = await assertEditor(db, callerUid)
    if (!editor.ok) return editor

    const emailLower = email?.toLowerCase()
    const nameLower = nameContains?.toLowerCase()

    const snap = await db.collection("contacts").where("orgId", "==", org).get()
    const contacts = snap.docs
        .map((doc) => toView(doc.id, doc.data() as Record<string, unknown>))
        .filter((c) => {
            if (emailLower) {
                if (!c.email || c.email.toLowerCase() !== emailLower)
                    return false
            }
            if (nameLower) {
                if (!c.name.toLowerCase().includes(nameLower)) return false
            }
            return true
        })
        .sort((a, b) => a.name.localeCompare(b.name))

    return { ok: true, contacts, count: contacts.length }
}

export async function createContact(
    callerUid: string,
    args: CreateContactArgs,
    org: OrgId = DEFAULT_ORG_ID,
): Promise<CreateContactResult | RichErrorEnvelope> {
    initAdmin()
    const db = getFirestore()
    const editor = await assertEditor(db, callerUid)
    if (!editor.ok) return editor

    const name = typeof args.name === "string" ? args.name.trim() : ""
    const email = typeof args.email === "string" ? args.email.trim() : ""
    const phone = typeof args.phone === "string" ? args.phone.trim() : ""

    if (!name)
        return richError("invalid_argument", "A contact needs a non-empty name.", {
            field: "name",
        })
    if (!email && !phone)
        return richError(
            "invalid_argument",
            "A contact needs at least an email or a phone.",
            { field: "email" },
            "Pass `email` and/or `phone` so the contact is reachable.",
        )

    // Dedupe by email within the org (in-memory scan over the small address
    // book — avoids a composite (orgId,emailLower) index). Return the existing
    // contact rather than writing a duplicate row.
    if (email) {
        const lower = email.toLowerCase()
        const orgSnap = await db
            .collection("contacts")
            .where("orgId", "==", org)
            .get()
        const match = orgSnap.docs.find((doc) => {
            const e = (doc.data() as Record<string, unknown>).email
            return typeof e === "string" && e.toLowerCase() === lower
        })
        if (match)
            return {
                ok: true,
                created: false,
                contact: toView(match.id, match.data() as Record<string, unknown>),
            }
    }

    const ref = db.collection("contacts").doc()
    await ref.set({
        orgId: org,
        name,
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
        createdBy: callerUid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
    })
    return {
        ok: true,
        created: true,
        contact: { id: ref.id, name, email: email || null, phone: phone || null },
    }
}

export async function deleteContact(
    callerUid: string,
    args: DeleteContactArgs,
    org: OrgId = DEFAULT_ORG_ID,
): Promise<DeleteContactResult | RichErrorEnvelope> {
    initAdmin()
    const db = getFirestore()
    const editor = await assertEditor(db, callerUid)
    if (!editor.ok) return editor

    const id = typeof args.id === "string" ? args.id.trim() : ""
    if (!id)
        return richError("invalid_argument", "id must be a non-empty string.", {
            field: "id",
        })

    const ref = db.collection("contacts").doc(id)
    const snap = await ref.get()
    // Cross-org wall: a missing doc OR a doc in another tenant returns the same
    // not_found envelope (no existence leak), mirroring the publish caller-org wall.
    if (
        !snap.exists ||
        rowOrg((snap.data() as Record<string, unknown>).orgId) !== org
    ) {
        return richError(
            "contact_not_found",
            `Contact '${id}' was not found.`,
            { contactId: id },
            "Verify the id via list_contacts.",
        )
    }
    await ref.delete()
    return { ok: true, deletedId: id }
}
