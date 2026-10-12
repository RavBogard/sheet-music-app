import { NextResponse } from "next/server"
import { httpError } from "@/lib/http/error-envelope"

/**
 * Multi-tenant phase 3 — what an unknown or suspended address gets in
 * production (ruling 1 defaults): a plain page, HTTP 404, no tenant branding,
 * no app chrome, no sign-in. API paths get a 404 JSON envelope instead.
 * Served straight from the proxy so no layout (and no CRC identity) renders.
 */
export const NO_SUCH_SITE_TITLE = "No such site"
export const NO_SUCH_SITE_LINE = "There is no site at this address."

export const NO_SUCH_SITE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${NO_SUCH_SITE_TITLE}</title>
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#fff;color:#111}
main{padding:24px 16px;text-align:center}
h1{font-size:1.5rem;font-weight:600;margin:0 0 8px}
p{margin:0;color:#555}
@media (prefers-color-scheme:dark){body{background:#111;color:#eee}p{color:#aaa}}
</style>
</head>
<body>
<main>
<h1>${NO_SUCH_SITE_TITLE}</h1>
<p>${NO_SUCH_SITE_LINE}</p>
</main>
</body>
</html>
`

const COMMON_HEADERS: Record<string, string> = {
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex",
}

export function noSuchSiteResponse(pathname: string, method = "GET"): NextResponse {
    if (pathname === "/api" || pathname.startsWith("/api/")) {
        return httpError(404, "no_such_site", NO_SUCH_SITE_LINE, { errorCode: 404 }, undefined, COMMON_HEADERS)
    }
    return new NextResponse(method === "HEAD" ? null : NO_SUCH_SITE_HTML, {
        status: 404,
        headers: {
            ...COMMON_HEADERS,
            "Content-Type": "text/html; charset=utf-8",
            "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        },
    })
}
