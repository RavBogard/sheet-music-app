"use client"

import { createContext, useContext, type ReactNode } from "react"
import type { OrgId } from "@/lib/org/types"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"

/**
 * v11-03-01: carries the server-resolved tenant org id (from the `x-org-id`
 * request header set in src/proxy.ts) to client components for theming
 * (v11-03-02) and vocab/labels (v11-03-03). Data-only — no Firestore, no
 * next-themes coupling. The org for the BROWSER surface is host-derived; the
 * MCP/API surface resolves its own org from the caller's token (v11-02).
 */
const OrgContext = createContext<OrgId | null>(null)

export function OrgProvider({
    orgId,
    children,
}: {
    orgId: OrgId
    children: ReactNode
}) {
    return <OrgContext.Provider value={orgId}>{children}</OrgContext.Provider>
}

/**
 * Returns the current tenant org id. Falls back to DEFAULT_ORG_ID ("crc") when
 * called outside <OrgProvider>. This is a benign default, not a security hole:
 * the root layout always wraps the app in <OrgProvider>, and the browser org
 * only drives chrome/vocab — real tenant data isolation is enforced
 * server-side (MCP/proxy, v11-02). Defaulting lets components mount in
 * isolation (e.g. unit tests) without a provider and degrade to CRC chrome.
 */
export function useOrg(): OrgId {
    return useContext(OrgContext) ?? DEFAULT_ORG_ID
}

export { OrgContext }
