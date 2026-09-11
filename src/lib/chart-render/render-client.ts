import { renderSecret, type RenderFormat } from "./html-to-pdf"

/**
 * Client for the internal render route. The MCP function never loads Chromium
 * itself — it POSTs the HTML to `/api/render/chart` (its own serverless
 * function) over the same internal base URL + shared-secret scheme the intake
 * executor uses (`INTAKE_INTERNAL_BASE_URL`, which must be a custom domain so
 * SSO deployment protection does not intercept the call).
 */

export interface RenderedChart {
    bytes: Buffer
    mimeType: string
    pageCount: number
    renderMs: number
}

export type RenderFailure = {
    ok: false
    status: number
    machineCode: string
    message: string
}

export function internalBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
    return (
        env.INTAKE_INTERNAL_BASE_URL ??
        (env.VERCEL_PROJECT_PRODUCTION_URL
            ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`
            : env.VERCEL_URL
              ? `https://${env.VERCEL_URL}`
              : "http://localhost:3000")
    )
}

export function renderRouteUrl(env: NodeJS.ProcessEnv = process.env): string {
    return `${internalBaseUrl(env)}/api/render/chart`
}

/** 55 s: under the MCP function's 60 s ceiling, above Chromium's cold start. */
export const RENDER_TIMEOUT_MS = 55_000

export async function renderViaRoute(
    html: string,
    format: RenderFormat,
    opts: {
        fetchImpl?: typeof fetch
        env?: NodeJS.ProcessEnv
        widthPx?: number
        scale?: number
    } = {},
): Promise<RenderedChart | RenderFailure> {
    const env = opts.env ?? process.env
    const doFetch = opts.fetchImpl ?? fetch
    const secret = renderSecret(env)
    if (!secret) {
        return {
            ok: false,
            status: 503,
            machineCode: "render_not_configured",
            message: "No RENDER_SECRET / CRON_SECRET configured; the render route cannot be called.",
        }
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), RENDER_TIMEOUT_MS)
    try {
        const res = await doFetch(renderRouteUrl(env), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${secret}`,
            },
            body: JSON.stringify({ html, format, widthPx: opts.widthPx, scale: opts.scale }),
            signal: controller.signal,
        })
        if (res.status !== 200) {
            let message = `Render route answered ${res.status}.`
            let machineCode = "render_failed"
            try {
                const body = (await res.json()) as {
                    error?: { machine_code?: string; message?: string }
                }
                if (body?.error?.message) message = body.error.message
                if (body?.error?.machine_code) machineCode = body.error.machine_code
            } catch {
                /* non-JSON body — keep the generic message */
            }
            return { ok: false, status: res.status, machineCode, message }
        }
        const bytes = Buffer.from(await res.arrayBuffer())
        return {
            bytes,
            mimeType: res.headers.get("content-type") ?? (format === "pdf" ? "application/pdf" : "image/png"),
            pageCount: Number(res.headers.get("x-page-count") ?? "1") || 1,
            renderMs: Number(res.headers.get("x-render-ms") ?? "0") || 0,
        }
    } catch (err) {
        const aborted = err instanceof Error && err.name === "AbortError"
        return {
            ok: false,
            status: aborted ? 504 : 502,
            machineCode: aborted ? "render_timeout" : "render_unreachable",
            message: aborted
                ? `Render route did not answer within ${RENDER_TIMEOUT_MS / 1000} s.`
                : `Render route unreachable: ${err instanceof Error ? err.message : String(err)}`,
        }
    } finally {
        clearTimeout(timer)
    }
}

export function isRenderFailure(r: RenderedChart | RenderFailure): r is RenderFailure {
    return (r as RenderFailure).ok === false
}
