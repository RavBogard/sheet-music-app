/**
 * What a recording upload may be: the audio types we store and serve, the
 * size cap, and the picker `accept` string. Shared by the browser (to refuse
 * early with a clear message) and the upload routes (the real check).
 *
 * The serving route (/api/recordings/file/[id]) answers any `audio/*` type, so
 * every type here plays back with its own Content-Type.
 */

/** 200 MB. Bytes go straight to Storage, never through a Vercel function. */
export const MAX_RECORDING_BYTES = 200 * 1024 * 1024
export const MAX_RECORDING_MB = MAX_RECORDING_BYTES / 1024 / 1024

/** Browser-reported mime → stored extension. */
const MIME_TO_EXT: Record<string, string> = {
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/aac": "aac",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/wave": "wav",
    "audio/ogg": "ogg",
    "audio/webm": "webm",
    "audio/flac": "flac",
    "audio/x-flac": "flac",
    "audio/aiff": "aiff",
    "audio/x-aiff": "aiff",
}

/** Extension → the one Content-Type we store it under. */
const EXT_TO_MIME: Record<string, string> = {
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    aac: "audio/aac",
    wav: "audio/wav",
    ogg: "audio/ogg",
    webm: "audio/webm",
    flac: "audio/flac",
    aiff: "audio/aiff",
    aif: "audio/aiff",
}

/** File-picker `accept`: mime wildcard plus extensions, so iPad Files lists them. */
export const AUDIO_ACCEPT = `audio/*,${Object.keys(EXT_TO_MIME).map((e) => `.${e}`).join(",")}`

function extOf(fileName: string): string | null {
    const m = /\.([a-z0-9]+)$/i.exec(fileName.trim())
    return m ? m[1].toLowerCase() : null
}

/**
 * The stored extension and Content-Type for an upload, or null when it isn't
 * audio we take. A known extension wins (iPad often reports an empty or
 * generic type); otherwise the reported mime decides.
 */
export function resolveAudioUpload(
    mimeType: string | null | undefined,
    fileName: string,
): { ext: string; contentType: string } | null {
    const ext = extOf(fileName)
    if (ext && EXT_TO_MIME[ext]) return { ext: ext === "aif" ? "aiff" : ext, contentType: EXT_TO_MIME[ext] }
    const mime = (mimeType ?? "").toLowerCase().split(";")[0].trim()
    const fromMime = MIME_TO_EXT[mime]
    return fromMime ? { ext: fromMime, contentType: EXT_TO_MIME[fromMime] } : null
}

/** True when the file looks like audio (by type or extension). */
export function isAudioFile(file: { type?: string; name: string }): boolean {
    return resolveAudioUpload(file.type, file.name) !== null || (file.type ?? "").startsWith("audio/")
}
