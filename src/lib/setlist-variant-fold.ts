/**
 * WEB-05: group per-instrument and "(Copy)" setlists under their parent service
 * in the /setlists list. DISPLAY ONLY: every setlist stays in the result (as the
 * parent or as one of its variants) and nothing is renamed, re-sorted or written.
 * Parents keep the order they had in the input list.
 *
 * A setlist is a "variant" when its name ends in "(Copy)" / "(Copy 2)" or in an
 * instrument label ("Shir Shabbat - Guitar", "Shir Shabbat (Eb)"). Its base name
 * is the name without that marker. A variant folds under the setlist with the
 * same base name on the same day that is not itself a variant; a "(Copy)" with
 * no date may also fold under a single non-variant parent of that name. With no
 * such parent, variants of one base name and day fold under the first of them.
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
    parent: T
    variants: T[]
}

function stripVariant(name: string): { base: string; isVariant: boolean; isCopy: boolean } {
    let base = name.trim()
    let isVariant = false
    let isCopy = false
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

    const headOf = new Array<number>(info.length).fill(-1)
    const variantHead = new Map<string, number>() // key|day -> first variant when no parent
    info.forEach((x, i) => {
        if (!x.isVariant || !x.key) return
        const k = `${x.key}|${x.day}`
        let h = parentIndex.get(k)
        if (h === undefined && x.isCopy && !x.day) {
            const cands = parentsByName.get(x.key)
            if (cands && cands.length === 1) h = cands[0]
        }
        if (h === undefined) {
            h = variantHead.get(k)
            if (h === undefined) {
                variantHead.set(k, i)
                return // this variant is itself the head
            }
        }
        headOf[i] = h
    })

    const groups = new Map<number, FoldedGroup<T>>()
    const order: number[] = []
    info.forEach((x, i) => {
        if (headOf[i] === -1) {
            groups.set(i, { parent: x.s, variants: [] })
            order.push(i)
        }
    })
    info.forEach((x, i) => {
        if (headOf[i] !== -1) groups.get(headOf[i])!.variants.push(x.s)
    })
    return order.map((i) => groups.get(i)!)
}
