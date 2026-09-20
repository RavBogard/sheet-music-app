/**
 * Fetch shireishabbat's published `dist-app` artifact so a book or moments
 * update does not depend on Daniel's laptop having run a Typst build.
 *
 * WHY THIS IS AN ARTIFACT AND NOT A URL ANYONE CAN CURL. `dist-app/` is the
 * licensed carrier — the feeds inside it hold every block of liturgical text,
 * and the volumes are licensed material. There is no public URL to fetch and
 * there must not be one. The transport is a GitHub Actions artifact behind a
 * token, produced by shireishabbat's `publish-app-surface` job, which is gated
 * on `check.sh` exiting 0.
 *
 * WHAT LANDS ON DISK. Only the JSON this repo consumes — the per-volume feeds,
 * `moments.json` and `books.json`. The PDFs in the artifact (about 22MB of
 * them) are never written. What is written goes to a temp directory outside
 * the repo and is removed when the sync finishes, because the untrimmed feeds
 * carry text and this repo holds ids, names and page numbers only.
 *
 * WHAT IS NOT WEAKENED. Nothing here touches the pin guard. A fetched artifact
 * goes through exactly the same `trim` and `trimMoments` as a local
 * `dist-app/`: a printed volume still regenerates from its press commit or not
 * at all (R-0831-live-pagemap-1). Fetching changes where the bytes come from,
 * not what is allowed to be built from them.
 */
import { spawnSync } from "node:child_process"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readdirSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

export const DEFAULT_SLUG = "RavBogard/ShireiShabbat"
export const ARTIFACT_NAME = "dist-app"

/**
 * The files this repo consumes. Everything else in the artifact stays in the zip.
 *
 * `moments-pairs.json` and `tools/moments_agree.py` are here for the producer's
 * own agreement check (R-0920-code-21), which travels inside the artifact so the
 * canonical comparison is the corpus's rather than a reimplementation of it
 * here. The tool is stdlib-only Python carrying no liturgical text; the pairs
 * index is moment ids against unit ids. Both land in the same temp directory as
 * the feeds and are removed with them.
 *
 * `unzip -j` flattens, so `tools/moments_agree.py` arrives beside the feeds —
 * which is what `--dist <thatdir>` wants, since the checker reads `moments.json`,
 * `moments-pairs.json` and `<slug>-feed.json` flat from the directory it is
 * given. Nothing in that file may resolve a path relative to its own location;
 * shireishabbat has written that prohibition into the tool itself, because an
 * edit that added one would break this unpack silently.
 */
export const WANTED = [
    "*-feed.json",
    "moments.json",
    "moments-pairs.json",
    "books.json",
    "tools/moments_agree.py",
]

/**
 * The token, and a refusal that says which name to set.
 *
 * `GITHUB_TOKEN` is what a workflow already has; `SHIREISHABBAT_ARTIFACT_TOKEN`
 * is the name for a cross-repo PAT, because a workflow's own `GITHUB_TOKEN` is
 * scoped to THIS repo and cannot read another repo's artifacts.
 */
/** @param {Record<string, string | undefined>} env */
export function artifactToken(env = process.env) {
    const t = env.SHIREISHABBAT_ARTIFACT_TOKEN || env.GITHUB_TOKEN || null
    if (!t) {
        throw new Error(
            "No token for the dist-app artifact. Set SHIREISHABBAT_ARTIFACT_TOKEN to a PAT with " +
                `\`actions:read\` on ${DEFAULT_SLUG} (a workflow's own GITHUB_TOKEN is scoped to ` +
                "this repo and cannot read another repo's artifacts).",
        )
    }
    return t
}

export const apiBase = (slug) => `https://api.github.com/repos/${slug}/actions`

/**
 * Pick the artifact to download from a GitHub artifacts listing.
 *
 * Newest non-expired `dist-app` wins. An all-expired listing is refused by
 * name and date rather than downloaded into an unexplained 410 — the fix is to
 * re-run the producer, and the message says so.
 */
export function pickArtifact(listing, name = ARTIFACT_NAME) {
    const all = (listing?.artifacts ?? []).filter((a) => a.name === name)
    if (all.length === 0) throw new Error(`No '${name}' artifact in that listing.`)
    const live = all.filter((a) => !a.expired)
    if (live.length === 0) {
        throw new Error(
            `Every '${name}' artifact in that listing has expired (newest: ${all[0].created_at}). ` +
                "Re-run shireishabbat's publish-app-surface job.",
        )
    }
    live.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    return live[0]
}

async function getJson(url, token, doFetch = fetch) {
    const r = await doFetch(url, {
        headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" },
    })
    if (!r.ok) throw new Error(`GET ${url} -> ${r.status} ${r.statusText}`)
    return r.json()
}

/**
 * Resolve the flags into one zip URL.
 *
 * @param {{ fromUrl?: string | null, fromRun?: string | null, slug?: string }} opts
 * @param {string} token
 */
export async function resolveZipUrl({ fromUrl, fromRun, slug = DEFAULT_SLUG }, token, doFetch = fetch) {
    if (fromUrl) return fromUrl
    const url = fromRun
        ? `${apiBase(slug)}/runs/${fromRun}/artifacts`
        : `${apiBase(slug)}/artifacts?name=${ARTIFACT_NAME}&per_page=50`
    return pickArtifact(await getJson(url, token, doFetch)).archive_download_url
}

/**
 * Unpack the wanted members, flattened.
 *
 * Node has no zip reader, so this shells out. `unzip` is on the GitHub ubuntu
 * runners; `tar -xf` reads zip where tar is bsdtar (Windows, macOS). Trying
 * both means one command works on a runner and on Daniel's machine, and the
 * refusal names both rather than failing as "command not found".
 */
export function extractWanted(zipPath, outDir, run = spawnSync) {
    const unzip = run("unzip", ["-o", "-q", "-j", zipPath, ...WANTED, "-d", outDir], { encoding: "utf8" })
    if (unzip.status === 0) return outDir
    const tar = run("tar", ["-xf", zipPath, "-C", outDir, ...WANTED.flatMap((w) => ["--wildcards", w])], {
        encoding: "utf8",
    })
    if (tar.status === 0) return outDir
    throw new Error(
        `Could not unpack ${zipPath}. Neither \`unzip\` nor \`tar -xf\` worked ` +
            `(unzip: ${unzip.error?.message ?? unzip.status}; tar: ${tar.error?.message ?? tar.status}).`,
    )
}

/**
 * Download and unpack, returning a directory that looks like `dist-app/` to the
 * rest of the sync, plus a `cleanup()` that removes it.
 */
/**
 * @param {{ fromUrl?: string | null, fromRun?: string | null, slug?: string }} opts
 */
export async function fetchDistApp(opts = {}, env = process.env, doFetch = fetch) {
    const token = artifactToken(env)
    const zipUrl = await resolveZipUrl(opts, token, doFetch)
    const root = mkdtempSync(join(tmpdir(), "live-dist-app-"))
    const zipPath = join(root, "dist-app.zip")
    const out = join(root, "dist-app")
    const cleanup = () => rmSync(root, { recursive: true, force: true })
    try {
        const r = await doFetch(zipUrl, { headers: { authorization: `Bearer ${token}` } })
        if (!r.ok) throw new Error(`GET artifact zip -> ${r.status} ${r.statusText}`)
        writeFileSync(zipPath, Buffer.from(await r.arrayBuffer()))
        mkdirSync(out, { recursive: true })
        extractWanted(zipPath, out)
        // The zip is the licensed carrier; it does not need to outlive the unpack.
        rmSync(zipPath, { force: true })
        if (!existsSync(out) || readdirSync(out).length === 0) {
            throw new Error("The artifact unpacked to nothing — wrong artifact, or the wanted names changed.")
        }
        return { dir: out, cleanup }
    } catch (err) {
        cleanup()
        throw err
    }
}
