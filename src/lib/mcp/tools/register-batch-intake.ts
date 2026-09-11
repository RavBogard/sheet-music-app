import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import {
    registerAppResource,
    registerAppTool,
    RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server"

import { orgFrom, type AuthExtra } from "@/lib/mcp/org-context"
import { isErrorEnvelope } from "./result-iserror"
import {
    DROPZONE_RESOURCE_URI,
    dropzoneUiMeta,
    loadDropzoneHtml,
} from "@/lib/mcp/apps/dropzone-resource"
import type { OpenDropzoneArgs } from "./batch-intake"
import {
    appendBatchItemChunk,
    commitUploadBatch,
    getUploadBatch,
    importDriveFolder,
    listParkedUploads,
    openChartDropzone,
    requestBatchUploadUrls,
    resolveUploadItem,
} from "./batch-intake"

/**
 * Batch chart intake — MCP registration.
 *
 * Seven metadata-only tools plus the MCP Apps resource that backs the drop-zone
 * iframe. Kept in its own module (rather than bolted onto the already
 * 3,000-line `tools/index.ts`) because the batch surface is self-contained: one
 * implementation file, one registration file, one UI resource.
 *
 * The shape of the intended interaction, which the descriptions below repeat so
 * the agent learns it from `tools/list` alone:
 *
 *   Claude never handles chart bytes. It opens the drop zone, the human drops
 *   files, the iframe uploads them straight to Storage and commits, and Claude
 *   reads the outcome with `get_upload_batch` and talks the human through
 *   anything parked as a possible duplicate.
 */

// ─── result wrapping ─────────────────────────────────────────────────────────

/**
 * Wrap a tool result the way `tools/index.ts` does (`jsonResult`), plus
 * `structuredContent`: the drop-zone iframe reads the tool result as DATA, not
 * as prose, so the structured copy is what it actually consumes.
 */
function batchResult(result: unknown) {
    return {
        content: [
            { type: "text" as const, text: JSON.stringify(result) },
        ],
        structuredContent: result as Record<string, unknown>,
        isError: isErrorEnvelope(result),
    }
}

/** Same uid extraction as every other tool in `tools/index.ts`. */
function uidFrom(extra: AuthExtra): string {
    const uid = extra.authInfo?.extra?.uid
    if (typeof uid !== "string" || !uid) {
        throw new Error("Unauthenticated MCP request")
    }
    return uid
}

// ─── shared schema fragments ─────────────────────────────────────────────────

const collectionSchema = z
    .enum(["core", "supplemental", "uploads", "nava"])
    .optional()
    .describe(
        "Which library section to file these charts under. 'uploads' is the user-uploaded section (default). 'core', 'supplemental' and 'nava' are curated catalogs — only admins and band leaders may write to them.",
    )

const tagsSchema = z
    .array(z.string())
    .optional()
    .describe("Tags applied to every chart imported in this batch.")

const batchIdSchema = z
    .string()
    .min(1)
    .describe("The batch id returned by open_chart_dropzone or import_drive_folder.")

// ─── descriptions ────────────────────────────────────────────────────────────

/**
 * Appended to the tools a Desktop conversation should NOT drive by hand. They
 * stay callable (Claude Code on Windows runs the CLI courier through them), but
 * the guidance has to be explicit or the model will try to be helpful and
 * reimplement the drop zone one tool call at a time.
 */
const DROPZONE_DRIVES_THIS =
    " NOTE: in a Claude Desktop conversation you should NOT call this yourself — the drop-zone iframe opened by open_chart_dropzone calls it. Call it directly only from a scripted context such as Claude Code on Windows, where the courier is `node scripts/upload-batch.mjs`."

export function registerBatchIntakeTools(server: McpServer): void {
    // ─── open_chart_dropzone (MCP App) ───────────────────────────────────
    registerAppTool(
        server,
        "open_chart_dropzone",
        {
            title: "Open chart drop zone",
            description:
                "Open an interactive drop zone so the user can add many chart files to the library at once. YOU NEVER HANDLE THE FILE BYTES — this renders a small upload panel next to the conversation, the user drops or picks files there, and the panel uploads them straight to storage and commits the batch on its own. Use this whenever the user wants to add more than one chart, or has files on their computer rather than in Google Drive. It returns a batchId: after the user says they are done, call get_upload_batch with it to see what landed, then talk them through anything that came back 'parked' as a possible duplicate and act on their answer with resolve_upload_item. For a Google Drive folder use import_drive_folder instead. From Claude Code on Windows the equivalent is the CLI courier `node scripts/upload-batch.mjs <files...>`.",
            inputSchema: {
                collection: collectionSchema,
                tags: tagsSchema,
                source: z
                    .enum(["dropzone", "cli"])
                    .optional()
                    .describe(
                        "How this batch's files will arrive. Leave unset in a conversation (the iframe is the 'dropzone' default); the CLI courier scripts/upload-batch.mjs passes 'cli' so the batch records where it came from.",
                    ),
            },
            _meta: { ui: { resourceUri: DROPZONE_RESOURCE_URI } },
        },
        async (args, extra) =>
            batchResult(
                await openChartDropzone(
                    uidFrom(extra as AuthExtra),
                    orgFrom(extra as AuthExtra),
                    args as OpenDropzoneArgs,
                ),
            ),
    )

    // ─── request_batch_upload_urls ───────────────────────────────────────
    server.registerTool(
        "request_batch_upload_urls",
        {
            description:
                "Mint signed upload URLs for files in an open batch. Metadata only — you pass file NAMES and SIZES, never bytes; the client PUTs each file's bytes straight to the returned uploadUrl with the given Content-Type header. At most 50 files per call (call again with the same batchId for more). Files whose type is not a supported chart format, or that exceed 25 MB, come back in `rejected` with a reason instead of failing the call." +
                DROPZONE_DRIVES_THIS,
            inputSchema: {
                batchId: batchIdSchema,
                files: z
                    .array(
                        z.object({
                            fileName: z
                                .string()
                                .min(1)
                                .describe(
                                    "File name including extension — the extension decides the chart type and the default title.",
                                ),
                            mimeType: z
                                .string()
                                .optional()
                                .describe(
                                    "Browser-reported MIME type, if any. 'application/octet-stream' is fine — the extension wins in that case.",
                                ),
                            sizeBytes: z
                                .number()
                                .int()
                                .nonnegative()
                                .describe(
                                    "Exact byte length. Checked against the uploaded object at commit, so it must be the real size.",
                                ),
                        }),
                    )
                    .min(1)
                    .describe("The files to mint upload URLs for. Max 50 per call."),
            },
        },
        async (args, extra) =>
            batchResult(
                await requestBatchUploadUrls(
                    uidFrom(extra as AuthExtra),
                    orgFrom(extra as AuthExtra),
                    args,
                ),
            ),
    )

    // ─── append_batch_item_chunk ─────────────────────────────────────────
    server.registerTool(
        "append_batch_item_chunk",
        {
            description:
                "Fallback byte path for one batch item, used only when a direct upload to storage is blocked by the browser's content-security policy. Sends one base64 slice (max 3 MB per chunk, 25 MB per file); the server assembles the slices once the last chunk arrives." +
                DROPZONE_DRIVES_THIS,
            inputSchema: {
                batchId: batchIdSchema,
                itemId: z
                    .string()
                    .min(1)
                    .describe("The itemId returned by request_batch_upload_urls."),
                chunkIndex: z
                    .number()
                    .int()
                    .nonnegative()
                    .describe("Zero-based index of this slice."),
                totalChunks: z
                    .number()
                    .int()
                    .positive()
                    .describe("How many slices this file is split into."),
                dataBase64: z
                    .string()
                    .min(1)
                    .describe("This slice's bytes, standard RFC-4648 base64."),
            },
        },
        async (args, extra) =>
            batchResult(
                await appendBatchItemChunk(
                    uidFrom(extra as AuthExtra),
                    orgFrom(extra as AuthExtra),
                    args,
                ),
            ),
    )

    // ─── commit_upload_batch ─────────────────────────────────────────────
    server.registerTool(
        "commit_upload_batch",
        {
            description:
                "Seal an upload batch and queue it for import. Checks that every file's bytes really arrived (size must match what was declared; a missing or truncated upload is recorded as a failed row rather than imported), then hands the batch to the background importer. Safe to call again: a batch that is already sealed just reports its current counts with queued:false — which is exactly what to do if a previous call came back 'queue_unavailable'." +
                DROPZONE_DRIVES_THIS,
            inputSchema: { batchId: batchIdSchema },
        },
        async (args, extra) =>
            batchResult(
                await commitUploadBatch(
                    uidFrom(extra as AuthExtra),
                    orgFrom(extra as AuthExtra),
                    args,
                ),
            ),
    )

    // ─── get_upload_batch ────────────────────────────────────────────────
    server.registerTool(
        "get_upload_batch",
        {
            description:
                "Read how an upload batch turned out. THIS IS HOW YOU FIND OUT WHAT HAPPENED after the user has finished dropping files — poll it until counts.pending reaches 0 or status is 'done'. Returns counts, every row that needs a human decision (`attention`: parked possible-duplicates and failed files) and up to 20 imported rows. Talk the user through each parked row in plain language — name the chart it looks like a duplicate of — and then act on their answer with resolve_upload_item. Pass includeItems:'all' only when you genuinely need every row.",
            inputSchema: {
                batchId: batchIdSchema,
                includeItems: z
                    .enum(["attention", "all"])
                    .optional()
                    .describe(
                        "'attention' (default) returns only the rows needing a decision plus up to 20 imported rows. 'all' returns every item — larger, use sparingly.",
                    ),
            },
        },
        async (args, extra) =>
            batchResult(
                await getUploadBatch(
                    uidFrom(extra as AuthExtra),
                    orgFrom(extra as AuthExtra),
                    args,
                ),
            ),
    )

    // ─── resolve_upload_item ─────────────────────────────────────────────
    server.registerTool(
        "resolve_upload_item",
        {
            description:
                "Record the user's decision about one parked upload. A parked row is a file the importer thinks already exists in the library. ASK THE USER FIRST, in plain language, then call this with their answer: 'force' imports it anyway as a separate chart (right for a genuine variant — different key, arrangement or composer), 'skip' discards the upload, 'bind' says the chart is already in the library as boundFileId (find that id with search_library) so you can bond the existing chart onto the setlist instead. 'skip' also works on a failed row to clear it.",
            inputSchema: {
                batchId: batchIdSchema,
                itemId: z
                    .string()
                    .min(1)
                    .describe("The itemId from get_upload_batch's `attention` list."),
                action: z
                    .enum(["force", "skip", "bind"])
                    .describe(
                        "'force' = import it anyway; 'skip' = discard it; 'bind' = it already exists in the library as boundFileId.",
                    ),
                boundFileId: z
                    .string()
                    .optional()
                    .describe(
                        "Required with action 'bind' — the existing library chart's fileId, verified before the decision is recorded.",
                    ),
            },
        },
        async (args, extra) =>
            batchResult(
                await resolveUploadItem(
                    uidFrom(extra as AuthExtra),
                    orgFrom(extra as AuthExtra),
                    args,
                ),
            ),
    )

    // ─── list_parked_uploads ─────────────────────────────────────────────
    server.registerTool(
        "list_parked_uploads",
        {
            description:
                "List every upload still waiting on a human decision, across all recent batches, newest first (max 50). Use it to answer 'is anything stuck?' or to pick up where a previous conversation left off. Each row carries the batchId and itemId that resolve_upload_item needs, plus the library chart it looks like a duplicate of.",
            inputSchema: {
                limit: z
                    .number()
                    .int()
                    .positive()
                    .optional()
                    .describe("Maximum rows to return (default and cap: 50)."),
            },
        },
        async (args, extra) =>
            batchResult(
                await listParkedUploads(
                    uidFrom(extra as AuthExtra),
                    orgFrom(extra as AuthExtra),
                    args,
                ),
            ),
    )

    // ─── import_drive_folder ─────────────────────────────────────────────
    server.registerTool(
        "import_drive_folder",
        {
            description:
                "Import every chart in a Google Drive folder. PREFER THIS over the drop zone whenever the files are already in Drive — the bytes are pulled server-side, so nothing large ever passes through the conversation. Google Docs and Office files are converted to PDF automatically; folders and unsupported types are reported in `skipped`. Returns a batchId — read the outcome with get_upload_batch and handle parked duplicates with resolve_upload_item, exactly as for the drop zone. Pass dryRun:true first to see what would be imported without writing anything. The folder id is the last segment of a Drive folder URL. Cap: 200 files per call.",
            inputSchema: {
                folderId: z
                    .string()
                    .min(1)
                    .describe(
                        "Google Drive folder id — the segment after /folders/ in a Drive URL. The service account needs at least viewer access.",
                    ),
                collection: collectionSchema,
                tags: tagsSchema,
                recursive: z
                    .boolean()
                    .optional()
                    .describe(
                        "Descend into subfolders (up to 3 levels). Default false — subfolders are reported as skipped.",
                    ),
                dryRun: z
                    .boolean()
                    .optional()
                    .describe(
                        "List what would be imported and write nothing. No batch is created. Always safe to run first.",
                    ),
            },
        },
        async (args, extra) =>
            batchResult(
                await importDriveFolder(
                    uidFrom(extra as AuthExtra),
                    orgFrom(extra as AuthExtra),
                    args,
                ),
            ),
    )

    // ─── the drop-zone UI resource ───────────────────────────────────────
    // `_meta.ui` carries the CSP allow-list (the iframe PUTs straight to
    // storage.googleapis.com) and the stable app origin. Per the MCP Apps
    // spec those live on the RESOURCE, not on the tool — a host reads them
    // from this read result, falling back to the resources/list entry.
    registerAppResource(
        server,
        DROPZONE_RESOURCE_URI,
        DROPZONE_RESOURCE_URI,
        { mimeType: RESOURCE_MIME_TYPE, _meta: dropzoneUiMeta() },
        async () => ({
            contents: [
                {
                    uri: DROPZONE_RESOURCE_URI,
                    mimeType: RESOURCE_MIME_TYPE,
                    text: loadDropzoneHtml(),
                    _meta: dropzoneUiMeta(),
                },
            ],
        }),
    )
}
