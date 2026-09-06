import { NextResponse } from "next/server"

export function readerMusicAllowedOrigins(): string[] {
    return (process.env.READER_MUSIC_ALLOWED_ORIGINS ?? "")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
}

export function readerMusicOrigin(request: Request): string | null {
    const origin = request.headers.get("origin")
    if (!origin) return null
    return readerMusicAllowedOrigins().includes(origin) ? origin : null
}

export function readerMusicHeaders(request: Request): HeadersInit {
    const headers: Record<string, string> = {
        "Cache-Control": "private, no-store",
        Vary: "Origin, Authorization",
    }
    const origin = readerMusicOrigin(request)
    if (origin) headers["Access-Control-Allow-Origin"] = origin
    return headers
}

export function withReaderMusicHeaders(
    request: Request,
    response: Response,
): Response {
    const headers = readerMusicHeaders(request) as Record<string, string>
    for (const [name, value] of Object.entries(headers)) {
        response.headers.set(name, value)
    }
    return response
}

export function readerMusicPreflight(request: Request): Response {
    const suppliedOrigin = request.headers.get("origin")
    const origin = readerMusicOrigin(request)
    if (suppliedOrigin && !origin) {
        return withReaderMusicHeaders(
            request,
            NextResponse.json({ status: "unavailable" }, { status: 403 }),
        )
    }
    const response = new NextResponse(null, { status: 204 })
    response.headers.set("Access-Control-Allow-Methods", "GET, PATCH, POST, OPTIONS")
    response.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type")
    response.headers.set("Access-Control-Max-Age", "600")
    return withReaderMusicHeaders(request, response)
}

export function rejectDisallowedReaderOrigin(request: Request): Response | null {
    return request.headers.get("origin") && !readerMusicOrigin(request)
        ? withReaderMusicHeaders(
              request,
              NextResponse.json({ status: "unavailable" }, { status: 403 }),
          )
        : null
}
