/**
 * Chart drop-zone MCP App — full happy path against the committed bundle.
 *
 * No Next.js app and no MCP host are involved: the spec serves
 * `src/mcp-apps/dist/chart-dropzone.html` from a throwaway http server and
 * installs the app's documented test seam (`window.__DROPZONE_TEST_HOST__`)
 * before load, so every `callServerTool` is answered by a fake batch server.
 *
 * The upload URLs point back at that same local server (rather than a
 * `page.route`-faked `storage.googleapis.com`) precisely because the PUTs are
 * then SAME-ORIGIN: no CORS preflight to intercept, and the PUT count is
 * observed server-side where nothing can fake it.
 *
 * Run:
 *   PLAYWRIGHT_USE_REMOTE=1 npx playwright test e2e/chart-dropzone.spec.ts --project=chromium
 * (the env var only suppresses the repo-wide `webServer:` dev server, which
 * this spec does not use).
 */

import { expect, test } from "@playwright/test"
import { readFileSync } from "node:fs"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { join } from "node:path"

const DIST = join(__dirname, "..", "src", "mcp-apps", "dist", "chart-dropzone.html")
const FIXTURES = join(__dirname, "fixtures")

/** Every PUT the browser actually made, recorded by the origin server. */
let puts: Array<{ url: string; bytes: number; contentType: string }> = []
let server: Server
let origin = ""

test.use({ baseURL: undefined })

test.beforeAll(async () => {
    const html = readFileSync(DIST, "utf8")
    server = createServer((req, res) => {
        if (req.method === "PUT") {
            let bytes = 0
            req.on("data", (chunk: Buffer) => {
                bytes += chunk.length
            })
            req.on("end", () => {
                puts.push({
                    url: req.url ?? "",
                    bytes,
                    contentType: String(req.headers["content-type"] ?? ""),
                })
                res.writeHead(200).end("ok")
            })
            return
        }
        if (req.url === "/" || req.url === "/index.html") {
            res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(html)
            return
        }
        res.writeHead(404).end()
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

test.afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
})

test("drops two charts, uploads them, and reports 1 imported / 1 parked", async ({
    page,
}) => {
    puts = []

    // The fake MCP host. Installed before any app code runs.
    await page.addInitScript(() => {
        const calls: Array<{ name: string; arguments: Record<string, unknown> }> = []
        const contexts: string[] = []
        ;(window as unknown as Record<string, unknown>).__DROPZONE_CALLS__ = calls
        ;(window as unknown as Record<string, unknown>).__DROPZONE_CTX__ = contexts

        const wrap = (payload: unknown) => ({
            structuredContent: payload,
            content: [{ type: "text", text: JSON.stringify(payload) }],
        })

        const open = {
            ok: true,
            batchId: "ub-e2e0001",
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
            defaults: { collection: "crc" },
            maxFileBytes: 25 * 1024 * 1024,
            acceptedExtensions: [".pdf", ".png", ".musicxml", ".txt"],
            maxFilesPerRequest: 50,
        }

        let getCalls = 0
        const done = () => ({
            ok: true,
            batchId: open.batchId,
            status: "done",
            source: "dropzone",
            counts: { total: 2, pending: 0, imported: 1, parked: 1, failed: 0, skipped: 0 },
            createdAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
            attention: [
                {
                    itemId: "it-2",
                    fileName: "chart-two.pdf",
                    title: "chart two",
                    status: "parked",
                    parked: {
                        reason: "duplicate_similar",
                        matchedFileId: "lib-existing-2",
                        matchedTitle: "Chart Two (Friedman)",
                        score: 0.91,
                    },
                },
            ],
            imported: [{ itemId: "it-1", title: "chart one", resultFileId: "lib-new-1" }],
        })

        ;(window as unknown as Record<string, unknown>).__DROPZONE_TEST_HOST__ = {
            onToolResult(cb: (r: unknown) => void) {
                setTimeout(() => cb(wrap(open)), 0)
            },
            async callServerTool(req: { name: string; arguments: Record<string, unknown> }) {
                calls.push({ name: req.name, arguments: req.arguments })
                switch (req.name) {
                    case "request_batch_upload_urls": {
                        const files = req.arguments.files as Array<{
                            fileName: string
                            sizeBytes: number
                        }>
                        return wrap({
                            ok: true,
                            items: files.map((f, i) => ({
                                itemId: `it-${i + 1}`,
                                fileName: f.fileName,
                                uploadUrl: `${location.origin}/upload/it-${i + 1}`,
                                method: "PUT",
                                requiredHeaders: { "content-type": "application/pdf" },
                                expiresAt: new Date(Date.now() + 900_000).toISOString(),
                            })),
                            rejected: [],
                        })
                    }
                    case "commit_upload_batch":
                        return wrap({
                            ok: true,
                            batchId: open.batchId,
                            status: "committed",
                            counts: {
                                total: 2,
                                pending: 2,
                                imported: 0,
                                parked: 0,
                                failed: 0,
                                skipped: 0,
                            },
                            queued: true,
                        })
                    case "get_upload_batch":
                        getCalls += 1
                        if (getCalls === 1) {
                            return wrap({
                                ok: true,
                                batchId: open.batchId,
                                status: "processing",
                                source: "dropzone",
                                counts: {
                                    total: 2,
                                    pending: 2,
                                    imported: 0,
                                    parked: 0,
                                    failed: 0,
                                    skipped: 0,
                                },
                                createdAt: new Date().toISOString(),
                                attention: [],
                                imported: [],
                            })
                        }
                        return wrap(done())
                    case "resolve_upload_item":
                        return wrap({
                            ok: true,
                            itemId: req.arguments.itemId,
                            status:
                                req.arguments.action === "skip" ? "skipped" : "imported",
                            resultFileId:
                                req.arguments.action === "skip" ? undefined : "lib-new-2",
                            decision: {
                                action: req.arguments.action,
                                decidedBy: "e2e",
                                decidedAt: new Date().toISOString(),
                            },
                        })
                    default:
                        throw new Error(`unexpected tool ${req.name}`)
                }
            },
            async updateModelContext(params: { content: Array<{ text: string }> }) {
                contexts.push(params.content.map((c) => c.text).join("\n"))
                return {}
            },
        }
    })

    await page.goto(origin)

    // 1. The tool result turns the placeholder into the drop-zone UI.
    await expect(page.getByTestId("batch-id")).toHaveText("ub-e2e0001")
    await expect(page.getByTestId("drop-target")).toContainText(
        "Drop chart files here, or choose files",
    )

    // 2. Two files queue up as two rows.
    await page.getByTestId("file-input").setInputFiles([
        join(FIXTURES, "chart-one.pdf"),
        join(FIXTURES, "chart-two.pdf"),
    ])
    const rows = page.locator('[data-testid="rows"] tbody tr')
    await expect(rows).toHaveCount(2)
    await expect(page.getByTestId("upload-button")).toHaveText("Upload 2 files")

    // 3. Upload: two real PUTs, one commit.
    await page.getByTestId("upload-button").click()
    await expect.poll(() => puts.length, { timeout: 15_000 }).toBe(2)
    expect(puts.map((p) => p.url).sort()).toEqual(["/upload/it-1", "/upload/it-2"])
    expect(puts.every((p) => p.bytes > 0)).toBe(true)
    expect(puts.every((p) => p.contentType === "application/pdf")).toBe(true)

    const commitCount = async () =>
        page.evaluate(
            () =>
                (
                    window as unknown as {
                        __DROPZONE_CALLS__: Array<{ name: string }>
                    }
                ).__DROPZONE_CALLS__.filter((c) => c.name === "commit_upload_batch").length,
        )
    await expect.poll(commitCount).toBe(1)

    // The primary button is gone once the batch is committed.
    await expect(page.getByTestId("upload-button")).toBeHidden()

    // 4. Polling settles the rows: one imported, one parked.
    const statusOf = (n: number) => rows.nth(n).locator(".dz-status")
    await expect(statusOf(0)).toHaveText("imported", { timeout: 20_000 })
    await expect(statusOf(1)).toHaveText("parked")
    await expect(rows.nth(1)).toContainText("Chart Two (Friedman)")

    // 5. The parked row offers both decisions inline.
    const parkedRow = rows.nth(1)
    await expect(parkedRow.getByRole("button", { name: "Keep both" })).toBeVisible()
    await expect(parkedRow.getByRole("button", { name: "Skip" })).toBeVisible()

    // 6. The model gets a short summary naming the outcome.
    const contexts = async () =>
        page.evaluate(
            () => (window as unknown as { __DROPZONE_CTX__: string[] }).__DROPZONE_CTX__,
        )
    await expect.poll(async () => (await contexts()).length).toBeGreaterThan(0)
    const first = (await contexts())[0]
    expect(first).toContain("1 imported, 1 parked")
    expect(first).toContain("ub-e2e0001")
    expect(first).toContain("Chart Two (Friedman)")
    expect(first.length).toBeLessThan(1500)

    // 7. "Keep both" resolves the parked row and refreshes the summary.
    await parkedRow.getByRole("button", { name: "Keep both" }).click()
    await expect(statusOf(1)).toHaveText("imported")
    await expect.poll(async () => (await contexts()).length).toBeGreaterThan(1)
    const latest = (await contexts()).at(-1) as string
    expect(latest).toContain("2 imported, 0 parked")
    expect(latest.length).toBeLessThan(1500)

    // Nothing but the five batch tools was ever called.
    const names = await page.evaluate(
        () =>
            (
                window as unknown as { __DROPZONE_CALLS__: Array<{ name: string }> }
            ).__DROPZONE_CALLS__.map((c) => c.name),
    )
    expect(new Set(names)).toEqual(
        new Set([
            "request_batch_upload_urls",
            "commit_upload_batch",
            "get_upload_batch",
            "resolve_upload_item",
        ]),
    )
})

test("rejects an unsupported file without uploading it", async ({ page }) => {
    puts = []
    await page.addInitScript(() => {
        const wrap = (payload: unknown) => ({
            structuredContent: payload,
            content: [{ type: "text", text: JSON.stringify(payload) }],
        })
        ;(window as unknown as Record<string, unknown>).__DROPZONE_TEST_HOST__ = {
            onToolResult(cb: (r: unknown) => void) {
                setTimeout(
                    () =>
                        cb(
                            wrap({
                                ok: true,
                                batchId: "ub-e2e0002",
                                expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
                                defaults: {},
                                // 1 KB cap: the ~1.2 KB fixture is "too large".
                                maxFileBytes: 1024,
                                acceptedExtensions: [".pdf"],
                                maxFilesPerRequest: 50,
                            }),
                        ),
                    0,
                )
            },
            async callServerTool() {
                throw new Error("no tool call expected for rejected files")
            },
            async updateModelContext() {
                return {}
            },
        }
    })

    await page.goto(origin)
    await expect(page.getByTestId("batch-id")).toHaveText("ub-e2e0002")

    await page
        .getByTestId("file-input")
        .setInputFiles([join(FIXTURES, "unsupported.rtf"), join(FIXTURES, "chart-one.pdf")])

    const rows = page.locator('[data-testid="rows"] tbody tr')
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0)).toContainText("unsupported file type")
    await expect(rows.nth(1)).toContainText("too large")
    // Nothing queued means nothing to upload.
    await expect(page.getByTestId("upload-button")).toBeDisabled()
    expect(puts).toHaveLength(0)
})
