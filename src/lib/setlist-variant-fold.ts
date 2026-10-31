/**
 * WEB-05: group per-instrument and "(Copy)" setlists under their parent service
 * in the /setlists list. DISPLAY ONLY: every setlist stays in the result (as the
 * parent or as one of its variants) and nothing is renamed, re-sorted or written.
 * Parents keep the order they had in the input list.
 *
 * Prod names use a middle-dot suffix ("Shir Shabbat — Oct 2, 2026 · Bb"): the text after
 * the last " · " is the suffix and the base is what comes before it.
 *
 * A setlist is a "variant" when its name ends in such a suffix, in "(Copy)" / "(Copy 2)" or in an
 * instrument label ("Shir Shabbat - Guitar", "Shir Shabbat (Eb)"). Its base name
 * is the name without that marker. A variant folds under the setlist with the
 * same base name on the same day that is not itself a variant; a "(Copy)" with
 * no date may also fold under a single non-variant parent of that name. With no
 * such parent, two or more variants of one base name and day form a group with no parent
 * (shown under the base name); a lone variant stays a plain entry.
 */
const INSTRUMENTS = [
    "guitar", "vocals", "vocal", "voice", "piano/keys", "piano", "keys", "keyboard", "bass clef", "bass",
    "drums", "percussion", "violin", "viola", "cello", "flute", "clarinet", "trumpet",
    "trombone", "horn", "sax", "saxophone", "alto sax", "tenor sax", "oboe", "eb", "bb", "c", "treble",
]
const INSTRUMENT_ALT = INSTRUMENTS.map((i) => i.replace(/[/ ]/g, (m) => (m === "/" ? String.raw`\/` : String.raw`\s+`))).join("|")
const COPY_RE = /\s*\(copy(?:\s*\d+)?\)\s*$/i
const SUFFIX_DASH_RE = new RegExp(String.raw`\s+[-–—:]\s+(?:${INSTRUMENT_ALT})(?:\s+(?:part|chart|packet))?\s*$`, "i")
const SUFFIX_PAREN_RE = new RegExp(String.raw`\s*\((?:${INSTRUMENT_ALT})(?:\s+(?:part|chart|packet))?\)\s*$`, "i")

export interface FoldableSetlist {
    id: string
    name: string
}

export interface FoldedGroup<T> {
    /** The setlist with no variant suffix, or null when every member is a variant. */
    parent: T | null
    /** Shown as the group heading when there is no parent. */
    baseName: string
    variants: T[]
}

function stripVariant(name: string): { base: string; isVariant: boolean; isCopy: boolean } {
    let base = name.trim()
    let isVariant = false
    let isCopy = false
    // Prod names: "Shir Shabbat — Oct 2, 2026 · Bb". The text after the last " · " is the suffix.
    const dot = base.lastIndexOf(" · ")
    if (dot > 0 && base.slice(dot + 3).trim()) {
        base = base.slice(0, dot).trim()
        isVariant = true
    }
    for (let i = 0; i < 4; i++) {
        let next = base.replace(COPY_RE, "")
        if (next !== base) {
            isCopy = isVariant = true
            base = next.trim()
            continue
        }
        next = base.replace(SUFFIX_DASH_RE, "").replace(SUFFIX_PAREN_RE, "")
        if (next !== base) {
            isVariant = true
            base = next.trim()
            continue
        }
        break
    }
    return { base, isVariant, isCopy }
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim()

export function foldSetlistVariants<T extends FoldableSetlist>(
    list: T[],
    dayKey: (s: T) => string | null,
): FoldedGroup<T>[] {
    const info = list.map((s) => {
        const v = stripVariant(s.name ?? "")
        return { s, ...v, key: norm(v.base), day: dayKey(s) ?? "" }
    })
    const parentIndex = new Map<string, number>() // key|day -> index in `info`
    const parentsByName = new Map<string, number[]>()
    info.forEach((x, i) => {
        if (x.isVariant || !x.key) return
        const k = `${x.key}|${x.day}`
        if (!parentIndex.has(k)) parentIndex.set(k, i)
        parentsByName.set(x.key, [...(parentsByName.get(x.key) ?? []), i])
    })

    // Variants with no non-variant parent group by key|day; two or more become a
    // parent-less group, a lone one stays a plain entry.
    const orphans = new Map<string, number[]>()
    const headOf = new Array<number>(info.length).fill(-1)
    info.forEach((x, i) => {
        if (!x.isVariant || !x.key) return
        const k = `${x.key}|${x.day}`
        let h = parentIndex.get(k)
        if (h === undefined && x.isCopy && !x.day) {
            const cands = parentsByName.get(x.key)
            if (cands && cands.length === 1) h = cands[0]
        }
        if (h !== undefined) headOf[i] = h
        else orphans.set(k, [...(orphans.get(k) ?? []), i])
    })

    // Entries in input order: a parent (with its variants), or an orphan group at its first member.
    const out: FoldedGroup<T>[] = []
    const byParent = new Map<number, FoldedGroup<T>>()
    const orphanGroupAt = new Map<number, FoldedGroup<T>>()
    const memberOfOrphanGroup = new Set<number>()
    for (const members of orphans.values()) {
        if (members.length < 2) continue
        orphanGroupAt.set(members[0], { parent: null, baseName: info[members[0]].base, variants: members.map((m) => info[m].s) })
        members.forEach((m) => memberOfOrphanGroup.add(m))
    }
    info.forEach((x, i) => {
        if (headOf[i] !== -1) return
        const og = orphanGroupAt.get(i)
        if (og) {
            out.push(og)
        } else if (!memberOfOrphanGroup.has(i)) {
            const g: FoldedGroup<T> = { parent: x.s, baseName: x.base, variants: [] }
            byParent.set(i, g)
            out.push(g)
        }
    })
    info.forEach((x, i) => {
        if (headOf[i] !== -1) byParent.get(headOf[i])!.variants.push(x.s)
    })
    return out
}
