// Orphan-recovery matcher (Lane B / B2). Maps a local batch folder of original
// chart files to the orphaned `library_index` rows in orphan-recovery-manifest.json,
// emitting a reviewable heal-plan. MATCHING ONLY — no Firestore/Storage writes.
//
// The heal-RUN (uploading bytes onto the matched fileIds) is a separate,
// Daniel-driven step using the MCP call sequences in
// .paul/research/storage-recovery-B-report.md (Operator Runbook). The recovery
// preserves bonds by healing onto the EXISTING fileId (Path 1) — see report.
//
// Run with:
//   npx tsx scripts/heal-orphans-from-local.ts --dir "<LOCAL_BATCH_FOLDER>" \
//        [--manifest .paul/research/orphan-recovery-manifest.json] \
//        [--out .paul/research/heal-plan.json]
//
// Output heal-plan.json buckets:
//   matched          — local file ↔ orphan fileId (the heal-run input)
//   unmatchedLocal   — local file with no orphan row (extra / already-healthy)
//   unmatchedOrphan  — orphan row with no local file (= true data loss → Lane C)
//   ambiguous        — a normalized key shared by >1 orphan or >1 local file
//                      (resolve by hand before healing)

import fs from "node:fs"
import path from "node:path"

export interface OrphanRow {
    id: string
    title: string | null
    fileName: string | null
}

export interface HealPlan {
    matched: { localFile: string; fileId: string; matchedKey: string; via: "fileName" | "title" }[]
    unmatchedLocal: string[]
    unmatchedOrphan: { id: string; title: string | null; fileName: string | null }[]
    ambiguous: { key: string; localFiles: string[]; orphanIds: string[] }[]
}

/**
 * Normalize a chart name/filename to a comparison key: drop directory + a single
 * trailing extension, lowercase, strip every non-alphanumeric character. Titles
 * in the manifest are distinctive ("Adon Olam (Folk)"), so the compacted key is
 * collision-resistant in practice; genuine collisions surface in `ambiguous`.
 */
export function normalizeForMatch(name: string): string {
    const base = path.basename(name)
    const noExt = base.replace(/\.[a-z0-9]{1,5}$/i, "")
    // Strip a leading catalog-code prefix before squashing — the Shireinu
    // batch names files `993122D003 TITLE (COMPOSER).pdf` and Ruach `994059D…`,
    // but the orphan library_index rows carry NO catalog prefix (title is just
    // "Title (Composer)"). The alphanumeric code (`993122d003`) survives the
    // non-alphanumeric squash and poisons the key, so strip it first. Harmless
    // to rows without a prefix (the pattern simply doesn't match).
    const noPrefix = noExt.replace(/^99\d{4}[a-z]?\d+\s+/i, "")
    return noPrefix.toLowerCase().replace(/[^a-z0-9]+/g, "")
}

/** Build key → orphanId[] from BOTH fileName and title (fileName preferred). */
function buildOrphanKeyIndex(orphans: OrphanRow[]): {
    keyToIds: Map<string, Set<string>>
    keyVia: Map<string, "fileName" | "title">
} {
    const keyToIds = new Map<string, Set<string>>()
    const keyVia = new Map<string, "fileName" | "title">()
    const add = (key: string, id: string, via: "fileName" | "title") => {
        if (!key) return
        if (!keyToIds.has(key)) keyToIds.set(key, new Set())
        keyToIds.get(key)!.add(id)
        // fileName wins the via-label if both populate the same key
        if (via === "fileName" || !keyVia.has(key)) keyVia.set(key, via)
    }
    for (const o of orphans) {
        if (o.fileName) add(normalizeForMatch(o.fileName), o.id, "fileName")
        if (o.title) add(normalizeForMatch(o.title), o.id, "title")
    }
    return { keyToIds, keyVia }
}

export function matchOrphans(localFiles: string[], orphans: OrphanRow[]): HealPlan {
    const { keyToIds, keyVia } = buildOrphanKeyIndex(orphans)

    // local key → local files (to detect >1 local file sharing a key)
    const localByKey = new Map<string, string[]>()
    for (const f of localFiles) {
        const k = normalizeForMatch(f)
        if (!localByKey.has(k)) localByKey.set(k, [])
        localByKey.get(k)!.push(f)
    }

    const matched: HealPlan["matched"] = []
    const unmatchedLocal: string[] = []
    const ambiguous: HealPlan["ambiguous"] = []
    const matchedOrphanIds = new Set<string>()

    for (const [key, files] of localByKey) {
        const ids = keyToIds.get(key)
        if (!ids || ids.size === 0) {
            unmatchedLocal.push(...files)
            continue
        }
        if (ids.size > 1 || files.length > 1) {
            ambiguous.push({ key, localFiles: files, orphanIds: [...ids] })
            continue
        }
        const fileId = [...ids][0]
        matched.push({ localFile: files[0], fileId, matchedKey: key, via: keyVia.get(key) ?? "fileName" })
        matchedOrphanIds.add(fileId)
    }

    const unmatchedOrphan = orphans
        .filter((o) => !matchedOrphanIds.has(o.id))
        // an orphan caught in an ambiguous bucket is not "data loss" — exclude it
        .filter((o) => !ambiguous.some((a) => a.orphanIds.includes(o.id)))
        .map((o) => ({ id: o.id, title: o.title, fileName: o.fileName }))

    return { matched, unmatchedLocal, unmatchedOrphan, ambiguous }
}

function listFilesRecursive(dir: string): string[] {
    const out: string[] = []
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) out.push(...listFilesRecursive(full))
        else if (entry.isFile() && !entry.name.startsWith(".")) out.push(full)
    }
    return out
}

function arg(flag: string, fallback?: string): string | undefined {
    const i = process.argv.indexOf(flag)
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

async function main(): Promise<void> {
    const dir = arg("--dir")
    const manifestPath = arg("--manifest", ".paul/research/orphan-recovery-manifest.json")!
    const outPath = arg("--out", ".paul/research/heal-plan.json")!
    if (!dir) {
        console.error(
            "Usage: npx tsx scripts/heal-orphans-from-local.ts --dir <folder> [--manifest <json>] [--out <json>]",
        )
        process.exit(2)
    }
    if (!fs.existsSync(dir)) {
        console.error(`--dir not found: ${dir}`)
        process.exit(2)
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
    const orphans: OrphanRow[] = (manifest.orphaned ?? []).map((o: OrphanRow) => ({
        id: o.id,
        title: o.title ?? null,
        fileName: o.fileName ?? null,
    }))
    const localFiles = listFilesRecursive(dir)
    const plan = matchOrphans(localFiles, orphans)

    fs.writeFileSync(outPath, JSON.stringify(plan, null, 2))
    console.log(
        `[heal-matcher] localFiles=${localFiles.length} orphans=${orphans.length}\n` +
            `  matched=${plan.matched.length}\n` +
            `  unmatchedLocal=${plan.unmatchedLocal.length}\n` +
            `  unmatchedOrphan(=data loss)=${plan.unmatchedOrphan.length}\n` +
            `  ambiguous=${plan.ambiguous.length}\n` +
            `Wrote ${outPath}. Review it, then run the heal per the Operator Runbook ` +
            `(.paul/research/storage-recovery-B-report.md). MATCHING ONLY — no writes performed.`,
    )
}

if (typeof require !== "undefined" && require.main === module) {
    void main()
}
