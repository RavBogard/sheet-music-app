import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { getTenantAccess, hasTenantRole } from "@/lib/org/access";
import { orgFrom, type AuthExtra } from "@/lib/mcp/org-context";
import { richError } from "@/lib/mcp/error-envelopes";
import type { OrgId } from "@/lib/org/types";
import {
  PlatformError,
  createCollection,
  listCollections,
  setOwnCollectionSharing,
  type CollectionRecord,
} from "@/lib/platform/tenants";
import { isErrorEnvelope } from "./result-iserror";
import { AUTHORING_VARIANT } from "@/lib/mcp/surfaces";

/**
 * Multi-tenant phase 5 — the tenant-admin collection tools on the AUTHORING
 * surface: create_collection and set_collection_sharing. A tenant admin (or the
 * platform owner) works on collections its OWN tenant owns; the platform
 * owner's `assignedTo` cannot be changed here (only assign_collection on the
 * platform connector does that). Dry run by default with before/after/diff;
 * applying writes a platformAudit row and runs the visibility job.
 */

function jsonResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent: data as Record<string, unknown>,
    isError: isErrorEnvelope(data),
  };
}

function uidFrom(extra: AuthExtra): string {
  const uid = extra.authInfo?.extra?.uid;
  if (typeof uid !== "string" || !uid)
    throw new Error("Unauthenticated MCP request");
  return uid;
}

function emailFrom(extra: AuthExtra): string | null {
  const e = extra.authInfo?.extra?.email;
  return typeof e === "string" && e ? e : null;
}

const KIND_CODE: Record<PlatformError["kind"], string> = {
  not_found: "not_found",
  invalid: "invalid_argument",
  conflict: "already_exists",
  forbidden: "forbidden",
  expired: "invalid_argument",
  used: "conflict",
};

/** Tenant admin (or platform owner) in the caller's own tenant, else a refusal. */
export async function requireTenantAdmin(uid: string, org: OrgId) {
  const access = await getTenantAccess(uid, org).catch(() => null);
  if (access && hasTenantRole(access, "admin")) return null;
  return richError(
    "forbidden_role",
    "Only an admin of this tenant can create collections or change their sharing.",
    { org, callerRole: access?.role ?? null },
    "Ask your tenant's admin, or the platform owner.",
  );
}

async function run<T>(fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof PlatformError)
      return richError(KIND_CODE[e.kind] ?? "invalid_argument", e.message, {});
    throw e;
  }
}

export async function createCollectionTool(
  uid: string,
  email: string | null,
  org: OrgId,
  args: { key: string; label: string; dryRun?: boolean },
) {
  const refused = await requireTenantAdmin(uid, org);
  if (refused) return refused;
  return run(() =>
    createCollection(
      org,
      { key: args.key, label: args.label },
      { actor: { uid, email, via: "claude" }, dryRun: args.dryRun },
    ),
  );
}

export async function setCollectionSharingTool(
  uid: string,
  email: string | null,
  org: OrgId,
  args: {
    collectionId: string;
    visibility: CollectionRecord["visibility"];
    sharedWith?: OrgId[];
    dryRun?: boolean;
  },
) {
  const refused = await requireTenantAdmin(uid, org);
  if (refused) return refused;
  return run(async () => {
    try {
      return await setOwnCollectionSharing(
        org,
        args.collectionId,
        { visibility: args.visibility, sharedWith: args.sharedWith ?? [] },
        { actor: { uid, email, via: "claude" }, dryRun: args.dryRun },
      );
    } catch (e) {
      if (e instanceof PlatformError && e.kind === "not_found") {
        const own = (
          await listCollections(org).catch(() => [] as CollectionRecord[])
        ).filter((c) => c.ownerOrgId === org);
        return richError("not_found", e.message, {
          yourCollections: own.map((c) => ({
            id: c.id,
            label: c.label,
            visibility: c.visibility,
            sharedWith: c.sharedWith,
          })),
        });
      }
      throw e;
    }
  });
}

export function registerCollectionAdminTools(server: McpServer): void {
  server.registerTool(
    "create_collection",
    {
      title: "Create a chart collection (tenant admin)",
      description:
        "Tenant admin only. Create a collection record owned by YOUR tenant, private and shared with nobody; set_collection_sharing then shares it. `key` is lowercase letters, digits and hyphens (the collection id becomes `<your tenant>__<key>`); `label` is the name people see. Charts whose library collection is that key belong to it. Dry run by default: returns {before:null, after, diff} and writes nothing; pass dryRun:false to create it (recorded in platform activity).",
      inputSchema: {
        key: z
          .string()
          .describe(
            "Lowercase letters, digits and hyphens, e.g. high-holidays.",
          ),
        label: z.string().describe("The name people see, e.g. High Holidays."),
        dryRun: z
          .boolean()
          .optional()
          .describe(
            "Default true: show what would be created. false: create it.",
          ),
      },
    },
    async (args, extra) => {
      const e = extra as AuthExtra;
      return jsonResult(
        await createCollectionTool(uidFrom(e), emailFrom(e), orgFrom(e), args),
      );
    },
  );

  // Same name as the platform tool; the marker lets this tenant-admin variant
  // (and only it) through the authoring surface filter (surfaces.ts).
  const setSharingConfig = {
    [AUTHORING_VARIANT]: true,
    title: "Share one of your chart collections (tenant admin)",
    description:
      "Tenant admin only, on a collection YOUR tenant owns (id like `crc__supplemental`). `visibility`: `private` (only your tenant, plus any tenant the platform owner assigned), `listed` (also the tenants in `sharedWith`), `all` (every active tenant). Other tenants can then use those charts in their setlists but never change them; they see them behind an opt-in chip, not in their own library. Shared charts are live references: your later edits and byte replacements reach them at once, and removing a share leaves their existing setlist rows working. Tenants the platform owner assigned stay whatever you choose here. Dry run by default: returns {before, after, diff}; dryRun:false applies it, records it in platform activity and updates the charts' visibility (`visibility.rows` = charts re-stamped).",
    inputSchema: {
      collectionId: z
        .string()
        .describe("Your collection's id, e.g. crc__supplemental."),
      visibility: z.enum(["private", "listed", "all"]),
      sharedWith: z
        .array(z.string())
        .optional()
        .describe("Tenant ids to share with when visibility is listed."),
      dryRun: z
        .boolean()
        .optional()
        .describe("Default true: show the change. false: apply it."),
    },
  };
  server.registerTool(
    "set_collection_sharing",
    setSharingConfig,
    async (args, extra) => {
      const e = extra as AuthExtra;
      return jsonResult(
        await setCollectionSharingTool(
          uidFrom(e),
          emailFrom(e),
          orgFrom(e),
          args,
        ),
      );
    },
  );
}
