/**
 * Nava Tehila corpus ingest — `collection: 'nava'`
 * ================================================
 *
 * Ingests the "Nava Tehila Sheet Music & Chords" Drive export (a nested
 * Section/Song/<variant>.pdf tree) into the library as the Nava Tehilah
 * collection.
 *
 * WHY THIS EXISTS INSTEAD OF `scripts/ingest-library.ts`:
 * That script (the original Shireinu ingest) wrote `library_index` rows
 * DIRECTLY via `db.collection('library_index').doc(id).set(...)`, which is
 * exactly why the 271 healed Shireinu rows are missing `normalizedName`,
 * `stem`, `titleSpecificity`, `enrichmentStatus` and `orgId` — a documented
 * fuzzy-dedup blind spot and an AI-enrichment gap
 * (.paul/research/shireinu-ingestion-PLAN.md §3). This script instead routes
 * every file through `processChartUpload`, the shared upload codepath, so
 * dedup fields, enrichment queueing, search ranking, the atomic Storage guard
 * and the `library_signals` broadcast all land correctly.
 *
 * SELECTION RULE (Daniel, 2026-08-18): one chart per song — the NOTES sheet.
 *   1. a file whose name contains "notes"      → the notation/lead sheet
 *   2. else the plainest un-suffixed file      → neither "chords" nor Hebrew-titled
 *   3. else a Hebrew-titled file               → 5 songs have only this
 *   4. else a chords chart                     → 2 Kedusha songs have only this
 * Within a tier, the "plainest" filename wins (see `noiseScore`) so canonical
 * sheets beat "Copy of", "(1)", "- in G", "DRAFT" and "with harmony" variants.
 *
 * Then byte-identical files are collapsed by sha256, preferring the
 * liturgical-section copy over the CDs/albums copy (the album folders re-file
 * the same PDFs under album names — 44 of 185 picks are pure duplicates).
 *
 * Writes go through the DEPLOYED MCP surface (request_chart_upload_url → PUT
 * signed URL → finalize_chart_upload), matching `scripts/heal-run-from-plan.ts`.
 * finalize_chart_upload runs the bytes through `processChartUpload` server-side,
 * so this gets the full pipeline without importing the `server-only` libs that
 * can't resolve outside Next's bundler.
 *
 * ORDERING: the deployed build must already know `collection: 'nava'` — ship
 * the enum change before running with --commit, or every call is rejected.
 *
 * Usage:
 *   npx tsx scripts/ingest-nava.ts --dir "<extracted root>"            # dry run
 *   npx tsx scripts/ingest-nava.ts --dir "<extracted root>" --commit \
 *       --bearer $(node scripts/supervisor-prod-bearer.mjs)
 *
 * Flags:
 *   --dir <path>       REQUIRED. Folder containing "Nava Tehila Sheet Music & Chords".
 *   --commit           Perform the writes. Omitted = dry run (default, no bearer needed).
 *   --bearer <token>   Required with --commit. Or set CRL_BEARER.
 *   --limit <n>        Only process the first n selected charts (smoke test).
 *   --skip <n>         Skip the first n selected charts (resume a partial run).
 *   --manifest <path>  Where to write the JSON manifest. Default: ./nava-ingest-manifest.json
 */

import fs from "fs"
import path from "path"
import crypto from "crypto"

const MCP_ENDPOINT = "https://www.centralreform.live/api/mcp"
const HEBREW = /[֐-׿]/

// ─── Variant classification ────────────────────────────────────────────────

type Variant = "notes" | "plain" | "hebrew" | "chords"

function classify(fileName: string): Variant {
    const base = fileName.replace(/\.[^.]*$/, "").toLowerCase()
    if (base.includes("chord")) return "chords"
    if (base.includes("note")) return "notes"
    if (HEBREW.test(fileName)) return "hebrew"
    return "plain"
}

/** Lower = plainer / more canonical. Picks the real sheet over its near-copies. */
const NOISE = [
    "עותק של", // Hebrew "copy of"
    "copy of",
    "with harmony",
    "harmony",
    "draft",
    "3pt",
    "capo",
    "sheet music",
]

function noiseScore(fileName: string): number {
    const base = fileName.replace(/\.[^.]*$/, "")
    const low = base.toLowerCase()
    let score = 0
    for (const n of NOISE) if (low.includes(n)) score += 10
    if (/\(\d+\)/.test(base)) score += 8 // "Surrender(1).pdf"
    if (/\bin [A-G]b?\b/.test(base)) score += 5 // "- in B", "- in G"
    return score + base.length // shorter name breaks ties
}

// ─── Title derivation ──────────────────────────────────────────────────────

/**
 * Titles come from the SONG FOLDER name, not the filename — the folder is the
 * reliably-English label, while ~34% of the files are Hebrew-titled.
 *
 * `stripNumber` is decided per-folder by the caller: a leading number is a
 * track number only inside a numbered container (Niggunim 01..12, album
 * tracks 01..16). "13 Attributes of Mercy" sits among unnumbered High Holiday
 * siblings, so its 13 is part of the name and must survive.
 */
function latinTitle(folderName: string, stripNumber: boolean): string {
    let s = folderName.replace(new RegExp(HEBREW.source, "g"), "")
    if (stripNumber) s = s.replace(/^\s*\d+\s*[.\-]?\s*/, "")
    // In this corpus "_" stands in for two different characters that Drive
    // won't accept in a folder name: an apostrophe between letters
    // (L_cha → L'cha) and a colon before a space (Kedusha_ Shabbat → Kedusha:).
    s = s.replace(/_(?=\s)/g, ":").replace(/_/g, "'")
    s = s.replace(/\s+/g, " ").trim()
    s = s.replace(/\s*\(\s+/g, " (") // "( Kamti liftoach)" → " (Kamti liftoach)"
    s = s.replace(/^[-–:.\s]+|[-–:.\s]+$/g, "")
    // Capitalize only all-lowercase words, so B'Amud / V'ahavt / L'kha survive.
    return s
        .split(" ")
        .map((w) => (w && w === w.toLowerCase() ? w.charAt(0).toUpperCase() + w.slice(1) : w))
        .join(" ")
}

function hebrewTitle(folderName: string): string {
    const chars = [...folderName].filter((c) => HEBREW.test(c) || c === " " || c === "־")
    return chars.join("").replace(/\s+/g, " ").trim()
}

// ─── Section → tag + display name ──────────────────────────────────────────

const SECTIONS: { match: string; slug: string; label: string }[] = [
    { match: "Kabbalat Shabbat", slug: "kabbalat-shabbat", label: "Kabbalat Shabbat" },
    { match: "High Holidays", slug: "high-holidays", label: "High Holidays" },
    { match: "Shacharit", slug: "shacharit", label: "Shacharit" },
    { match: "Song of Songs", slug: "song-of-songs", label: "Song of Songs" },
    { match: "Chants", slug: "chants", label: "Chants" },
    { match: "CDs", slug: "nava-album", label: "Nava Albums" },
]

function sectionOf(rel: string) {
    const top = rel.split(path.sep)[0]
    return SECTIONS.find((s) => top.startsWith(s.match)) ?? { match: top, slug: "nava-other", label: top }
}

// ─── Walk + select ─────────────────────────────────────────────────────────

interface Pick {
    absPath: string
    rel: string
    file: string
    why: Variant
    title: string
    hebrew: string
    tags: string[]
    sectionSlug: string
    sectionLabel: string
    sha: string
    size: number
}

function isPdf(absPath: string): boolean {
    const fd = fs.openSync(absPath, "r")
    try {
        const buf = Buffer.alloc(4)
        fs.readSync(fd, buf, 0, 4, 0)
        return buf.toString("latin1") === "%PDF"
    } finally {
        fs.closeSync(fd)
    }
}

function collectPdfFolders(root: string): Map<string, string[]> {
    const out = new Map<string, string[]>()
    const walk = (dir: string) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        const pdfs: string[] = []
        for (const e of entries) {
            const p = path.join(dir, e.name)
            if (e.isDirectory()) walk(p)
            else if (!e.name.toLowerCase().endsWith(".docx") && isPdf(p)) pdfs.push(e.name)
        }
        if (pdfs.length) out.set(dir, pdfs)
    }
    walk(root)
    return out
}

function selectCharts(root: string): { picks: Pick[]; flags: string[]; droppedDupes: number } {
    const folders = collectPdfFolders(root)
    const flags: string[] = []
    const picks: Pick[] = []

    // A leading number is a track number only where siblings are numbered too.
    const numberedParents = new Set<string>()
    for (const dir of folders.keys()) {
        const parent = path.dirname(dir)
        const sibs = fs
            .readdirSync(parent, { withFileTypes: true })
            .filter((e) => e.isDirectory() && /^\s*\d/.test(e.name))
        if (sibs.length >= 2) numberedParents.add(parent)
    }

    for (const [dir, files] of [...folders.entries()].sort()) {
        const rel = path.relative(root, dir)
        const byVariant = new Map<Variant, string[]>()
        for (const f of files) {
            const v = classify(f)
            byVariant.set(v, [...(byVariant.get(v) ?? []), f])
        }

        let picked: string | undefined
        let why: Variant | undefined
        for (const tier of ["notes", "plain", "hebrew", "chords"] as Variant[]) {
            const candidates = byVariant.get(tier)
            if (candidates?.length) {
                picked = [...candidates].sort((a, b) => noiseScore(a) - noiseScore(b))[0]
                why = tier
                break
            }
        }
        if (!picked || !why) {
            flags.push(`NOTHING-PICKED  ${rel}`)
            continue
        }
        if (why === "hebrew") flags.push(`HEBREW-ONLY     ${rel} → ${picked}`)
        if (why === "chords") flags.push(`CHORDS-ONLY     ${rel} → ${picked}`)

        const absPath = path.join(dir, picked)
        const buf = fs.readFileSync(absPath)
        const section = sectionOf(rel)
        const parts = rel.split(path.sep)
        const subgroup = parts.length > 2 ? parts[1] : undefined

        const tags = ["nava-tehila", section.slug]
        if (subgroup) {
            const psalm = subgroup.match(/Psalm\s*(\d+)/i)
            if (psalm) tags.push(`psalm-${psalm[1]}`)
            else if (/Niggunim/i.test(subgroup)) tags.push("niggunim")
        }
        if (why === "chords") tags.push("chords-chart")

        const folderName = parts[parts.length - 1]
        picks.push({
            absPath,
            rel,
            file: picked,
            why,
            title: latinTitle(folderName, numberedParents.has(path.dirname(dir))),
            hebrew: hebrewTitle(folderName),
            tags,
            sectionSlug: section.slug,
            sectionLabel: section.label,
            sha: crypto.createHash("sha256").update(buf).digest("hex"),
            size: buf.length,
        })
    }

    // Collapse byte-identical picks, preferring the liturgical copy over the
    // album copy, and merge the loser's section tags onto the survivor so the
    // kept row still says "this is also on the Havayah album".
    const byHash = new Map<string, Pick[]>()
    for (const p of picks) byHash.set(p.sha, [...(byHash.get(p.sha) ?? []), p])
    const deduped: Pick[] = []
    let droppedDupes = 0
    for (const group of byHash.values()) {
        group.sort((a, b) => {
            const aAlbum = a.sectionSlug === "nava-album" ? 1 : 0
            const bAlbum = b.sectionSlug === "nava-album" ? 1 : 0
            return aAlbum - bAlbum || a.rel.localeCompare(b.rel)
        })
        const keep = group[0]
        for (const other of group.slice(1)) {
            for (const t of other.tags) if (!keep.tags.includes(t)) keep.tags.push(t)
            droppedDupes++
        }
        deduped.push(keep)
    }

    // Same song name in two sections but genuinely different sheets → keep both,
    // disambiguated by section, so the library never shows two identical rows.
    const titleCounts = new Map<string, number>()
    for (const p of deduped) titleCounts.set(p.title.toLowerCase(), (titleCounts.get(p.title.toLowerCase()) ?? 0) + 1)
    for (const p of deduped) {
        if ((titleCounts.get(p.title.toLowerCase()) ?? 0) > 1) p.title = `${p.title} (${p.sectionLabel})`
    }

    deduped.sort((a, b) => a.title.localeCompare(b.title))
    return { picks: deduped, flags, droppedDupes }
}

// ─── MCP client (commit mode only) ─────────────────────────────────────────

async function mcpCall(bearer: string, name: string, args: Record<string, unknown>): Promise<unknown> {
    const res = await fetch(MCP_ENDPOINT, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${bearer}`,
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name, arguments: args },
        }),
    })
    const text = await res.text()
    // Response is SSE-framed: `event: message\ndata: {json}`.
    const dataLine = text
        .split("\n")
        .find((l) => l.startsWith("data:"))
        ?.slice(5)
        .trim()
    const payload = JSON.parse(dataLine ?? text)
    if (payload.error) throw new Error(`MCP ${name} JSON-RPC error: ${JSON.stringify(payload.error)}`)
    // MCP validation surfaces as isError + content prose, never JSON-RPC error.
    if (payload.result?.isError) {
        throw new Error(`MCP ${name} rejected: ${payload.result?.content?.[0]?.text ?? "unknown"}`)
    }
    const inner = payload.result?.content?.[0]?.text
    const result = inner ? JSON.parse(inner) : payload.result
    if (result && result.error && result.ok !== true) {
        throw new Error(`MCP ${name} tool error: ${JSON.stringify(result.error)}`)
    }
    return result
}

async function uploadOne(bearer: string, p: Pick): Promise<string> {
    const bytes = fs.readFileSync(p.absPath)
    const init = (await mcpCall(bearer, "request_chart_upload_url", {
        title: p.title,
        mimeType: "application/pdf",
        // One source file lost its .pdf suffix — always send a clean filename.
        fileName: `${p.title}.pdf`,
        collection: "nava",
        tags: p.tags,
        sizeBytes: bytes.length,
    })) as { uploadSessionId: string; uploadUrl: string }

    const put = await fetch(init.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        body: bytes,
    })
    if (!put.ok) throw new Error(`signed PUT failed HTTP ${put.status}`)

    const fin = (await mcpCall(bearer, "finalize_chart_upload", {
        uploadSessionId: init.uploadSessionId,
        // Distinct arrangements of the same liturgy ("Lecha Dodi - Yoel" vs
        // "- Daphna", 7 of them) are legitimate variants the 0.85 fuzzy gate
        // would otherwise reject.
        force: true,
    })) as { fileId: string }
    return fin.fileId
}

// ─── Main ──────────────────────────────────────────────────────────────────

function arg(name: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`)
    return i === -1 ? undefined : process.argv[i + 1]
}

async function main() {
    const dirArg = arg("dir")
    const commit = process.argv.includes("--commit")
    const limit = arg("limit") ? parseInt(arg("limit")!, 10) : undefined
    // Selection order is deterministic, so --skip n resumes after a partial run
    // (e.g. a --limit 3 smoke) without re-uploading what already landed.
    const skip = arg("skip") ? parseInt(arg("skip")!, 10) : 0
    const manifestPath = arg("manifest") ?? "nava-ingest-manifest.json"

    if (!dirArg) {
        console.error('Usage: npx tsx scripts/ingest-nava.ts --dir "<extracted root>" [--commit] [--limit n] [--skip n]')
        process.exit(1)
    }

    // Accept either the export root or its inner "Nava Tehila ..." folder.
    let root = path.resolve(dirArg)
    if (!fs.existsSync(root)) {
        console.error(`Directory not found: ${root}`)
        process.exit(1)
    }
    const inner = fs.readdirSync(root, { withFileTypes: true }).find((e) => e.isDirectory() && e.name.startsWith("Nava Tehila"))
    if (inner) root = path.join(root, inner.name)

    console.log(`Scanning: ${root}\n`)
    const { picks, flags, droppedDupes } = selectCharts(root)
    const afterSkip = skip > 0 ? picks.slice(skip) : picks
    const selected = limit ? afterSkip.slice(0, limit) : afterSkip

    const reasons = picks.reduce<Record<string, number>>((acc, p) => {
        acc[p.why] = (acc[p.why] ?? 0) + 1
        return acc
    }, {})

    console.log(`Charts selected:    ${picks.length}`)
    console.log(`Selection tiers:    ${JSON.stringify(reasons)}`)
    console.log(`Byte-identical dropped: ${droppedDupes}`)
    if (skip) console.log(`--skip ${skip} → resuming after the first ${skip}`)
    if (limit || skip) console.log(`processing ${selected.length}`)
    console.log()
    if (flags.length) {
        console.log(`Flagged for review (${flags.length}):`)
        for (const f of flags) console.log(`  ${f}`)
        console.log()
    }

    fs.writeFileSync(
        manifestPath,
        JSON.stringify(
            {
                generatedFrom: root,
                mode: commit ? "commit" : "dry-run",
                totalSelected: picks.length,
                droppedDupes,
                flags,
                charts: selected.map((p) => ({
                    title: p.title,
                    hebrew: p.hebrew,
                    tags: p.tags,
                    variant: p.why,
                    sourceFile: path.join(p.rel, p.file),
                    sizeBytes: p.size,
                })),
            },
            null,
            2,
        ),
        "utf-8",
    )
    console.log(`Manifest → ${path.resolve(manifestPath)}\n`)

    if (!commit) {
        console.log("DRY RUN — nothing written. Review the manifest, then re-run with --commit.")
        console.log("\nFirst 15 charts:")
        for (const p of selected.slice(0, 15)) {
            console.log(`  ${p.title.padEnd(44)} [${p.why}] ${p.tags.join(",")}`)
        }
        return
    }

    const bearer = arg("bearer") ?? process.env.CRL_BEARER
    if (!bearer) {
        console.error("--commit requires --bearer <crl_live_…> (or CRL_BEARER env). Refusing to run blind.")
        console.error("  bearer: node scripts/supervisor-prod-bearer.mjs")
        process.exit(1)
    }

    let ok = 0
    const failures: { title: string; error: string }[] = []

    for (const [i, p] of selected.entries()) {
        const label = `[${i + 1}/${selected.length}] ${p.title}`
        try {
            const fileId = await uploadOne(bearer, p)
            ok++
            console.log(`  ✓ ${label} → ${fileId}`)
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            failures.push({ title: p.title, error: msg })
            console.error(`  ✗ ${label} — ${msg}`)
        }
    }

    console.log(`\nDone. Uploaded ${ok}/${selected.length}. Failures: ${failures.length}`)
    if (failures.length) {
        for (const f of failures) console.log(`  ${f.title} — ${f.error}`)
        process.exitCode = 1
    }
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
