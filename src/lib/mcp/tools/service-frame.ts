import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { addTrack, loadEditableSetlist } from "@/lib/mcp/server-tracks-write"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import { getTracksForSetlist } from "@/lib/server-tracks"
import { foldLiturgyName, liturgyLookup } from "@/lib/liturgy/lookup"
import { matchLiturgyTitle } from "@/lib/liturgy/match"
import { sometimesRowsFor, familyForServiceType } from "@/lib/templates/always-rows"
import { writableLiturgyRef } from "@/lib/liturgy/bind-on-type"
import type { LiturgyRef } from "@/lib/books/types"

/**
 * `propose_service_frame` — BIND-NOT-ADD addendum 1.
 *
 * Daniel marked each moment of a family Always, Sometimes or Never. The
 * Always rows are merged into the templates and arrive with every clone. The
 * NEVER rows stay in the lookup for identity and are never offered. This tool
 * is the third list: the moments CRC does some weeks and not others — a
 * Rosh Chodesh blessing, a Prayer for the State of Israel, Hatikvah — offered
 * for the service in front of him, so that adding one is a click rather than
 * a memory test.
 *
 * AN OFFER, NEVER AN ADDITION. `dryRun` defaults to true; a real run adds ONLY
 * the labels passed back in `accept`. This is the one place in the whole
 * "bind, don't add" design where a row may appear that the author did not
 * type, and it appears only because he named it in the same breath. Ruling 2
 * as reinterpreted is emphatic that a row for something CRC will not do must
 * never show up in a setlist.
 *
 * BOOKLET-PAGED ENTRIES ONLY. A Sometimes moment the service's book does not
 * print is not offered. A row whose page is "somewhere in another book" is
 * worse than no row: the rabbi reads a number off the sheet and turns to the
 * wrong page. Ruling 8 puts the legacy booklet in charge of pages, so the
 * legacy booklet decides what can be offered.
 *
 * NEVER A DUPLICATE. A moment the setlist already names — under any spelling
 * the lookup knows — is not offered again.
 */

export interface ProposeServiceFrameArgs {
    setlistId: string
    /** Defaults to the setlist's own `book`. */
    book?: string
    /** Defaults to the family behind the setlist's `serviceType`. */
    family?: string
    dryRun?: boolean
    /** Labels Daniel confirmed. Only meaningful with `dryRun:false`. */
    accept?: string[]
}

export interface FrameCandidate {
    label: string
    folio: number
    unitId: string | null
    /** 0-based row index this would be inserted at, by printed page order. */
    position: number
}

export interface ProposeServiceFrameResult {
    ok: true
    setlistId: string
    book: string
    family: string
    dryRun: boolean
    /** Sometimes moments the book prints and the setlist does not yet name. */
    candidates: FrameCandidate[]
    /** Sometimes moments skipped, and why. */
    skipped: Array<{ label: string; reason: string }>
    /** Present only on a real run. */
    added?: Array<{ label: string; trackId: string; order: number; liturgyRef: LiturgyRef }>
}

export async function proposeServiceFrame(
    uid: string,
    args: ProposeServiceFrameArgs,
    org: OrgId = DEFAULT_ORG_ID,
): Promise<ProposeServiceFrameResult | RichErrorEnvelope> {
    const setlistId = args?.setlistId?.trim()
    if (!setlistId) {
        return richError(
            "invalid_argument",
            "setlistId is required.",
            { setlistId: setlistId ?? null },
            "Pass a setlist id from list_setlists.",
        )
    }

    initAdmin()
    const db = getFirestore()
    const loaded = await loadEditableSetlist(db, setlistId, uid, org)
    if (!loaded.ok) return loaded

    const book =
        args.book?.trim() ||
        (typeof loaded.data.book === "string" ? loaded.data.book : "")
    if (!book) {
        return richError(
            "no_book_for_setlist",
            "This setlist names no book, and none was passed.",
            { setlistId },
            "Set the service's book with update_setlist, or pass `book`. Pages come from the book; without one there is nothing to offer.",
        )
    }
    if (!liturgyLookup(book).length) {
        return richError(
            "no_lookup_for_book",
            `No liturgy lookup table exists for '${book}'.`,
            { book },
            "Tables exist for crc-friday, crc-saturday, shabbat-maariv and shabbat-shacharit.",
        )
    }

    const serviceType =
        typeof loaded.data.serviceType === "string" ? loaded.data.serviceType : ""
    const family = args.family?.trim() || familyForServiceType(serviceType)
    const sometimes = family ? sometimesRowsFor(family) : []
    if (!sometimes.length) {
        return richError(
            "no_frame_for_family",
            `No Sometimes list exists for family '${family ?? serviceType}'.`,
            { family: family ?? null, serviceType },
            "Daniel confirmed Always/Sometimes/Never lists for friday_night and shabbat_morning. A family with no list has nothing to offer — that is a ruling, not a gap.",
        )
    }

    const tracks = await getTracksForSetlist(db, setlistId, loaded.data)
    const table = liturgyLookup(book)

    // Every spelling the setlist already uses, and where each printed row sits.
    const present = new Set<string>()
    const rowFolio: Array<number | undefined> = []
    for (const t of tracks) {
        const title = typeof t.title === "string" ? t.title : ""
        const row = t as unknown as Record<string, unknown>
        const ref = row.liturgyRef as { folio?: number } | undefined
        const m = matchLiturgyTitle(book, title).clear
        if (m) for (const a of m.entry.aliases) present.add(foldLiturgyName(a))
        else present.add(foldLiturgyName(title))
        rowFolio.push(typeof ref?.folio === "number" ? ref.folio : m?.entry.folio)
    }

    const candidates: FrameCandidate[] = []
    const skipped: Array<{ label: string; reason: string }> = []

    for (const label of sometimes) {
        const folded = foldLiturgyName(label)
        const entry = table.find((e) =>
            e.aliases.some((a) => foldLiturgyName(a) === folded),
        )
        if (!entry) {
            skipped.push({ label, reason: `no entry for this moment in ${book}` })
            continue
        }
        if (typeof entry.folio !== "number") {
            skipped.push({ label, reason: `${book} does not print this moment` })
            continue
        }
        if (entry.aliases.some((a) => present.has(foldLiturgyName(a)))) {
            skipped.push({ label, reason: "the setlist already names this moment" })
            continue
        }
        // Page order, among the rows whose page is known. A row with no page
        // never moves anything: it is evidence about nothing.
        let position = rowFolio.length
        for (let i = 0; i < rowFolio.length; i++) {
            const f = rowFolio[i]
            if (typeof f === "number" && f > entry.folio) {
                position = i
                break
            }
        }
        candidates.push({
            label: entry.label,
            folio: entry.folio,
            unitId: entry.unitId ?? null,
            position,
        })
    }
    candidates.sort((a, b) => a.folio - b.folio)

    const dryRun = args.dryRun !== false
    const result: ProposeServiceFrameResult = {
        ok: true,
        setlistId,
        book,
        family: family ?? serviceType,
        dryRun,
        candidates,
        skipped,
    }
    if (dryRun) return result

    // ── Real run — only what Daniel named ───────────────────────────────
    const wanted = new Set((args.accept ?? []).map((a) => foldLiturgyName(a)))
    const added: NonNullable<ProposeServiceFrameResult["added"]> = []
    // Late pages first, so each insert index stays valid as rows appear above.
    for (const c of [...candidates].sort((a, b) => b.folio - a.folio)) {
        if (!wanted.has(foldLiturgyName(c.label))) continue
        const ref = writableLiturgyRef(book, c.folio, c.unitId)
        if (!ref) continue
        const { trackId, order } = await addTrack(db, {
            setlistId,
            type: "prayer",
            title: c.label,
            position: c.position,
            liturgyRef: ref,
            fixed: true,
        })
        added.push({ label: c.label, trackId, order, liturgyRef: ref })
    }
    return { ...result, added: added.reverse() }
}
