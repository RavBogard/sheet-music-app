/**
 * Multi-tenant phase 5 — rehearse the visibility stamp and the nava ownership
 * move on a RESTORED production export, against the Firestore emulator only.
 *
 *   firebase emulators:exec --only firestore --project crcmusiccharts --import <export dir> \
 *     "npx vite-node -c vitest.config.ts scripts/ops/multitenant/rehearse-nava-move.ts -- --to nava-tehila"
 *
 * Refuses to run without FIRESTORE_EMULATOR_HOST. Storage is not part of an
 * export, so the Storage half is covered by p5-nava-move.emulator.test.ts.
 *
 * Checks, after stamp+move: every CRC setlist reads back identically and every
 * bonded track's chart row is still visible to CRC; CRC's nava tab lists the
 * same rows; CRC edits on a moved chart are refused; Brothers Lazaroff sees
 * none of the moved rows. Then undoes both and checks every document is back.
 */
import { getApps, initializeApp } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

import { applyStamp, planStamp, undoStamp } from "@/lib/library/stamp-visibility"
import { applyNavaMove, planNavaMove, undoNavaMove } from "@/lib/library/nava-move"
import { visibleTo } from "@/lib/library/visibility"
import { getSetlist } from "@/lib/mcp/tools/setlists"
import { getSong, listLibrary } from "@/lib/mcp/tools/library"
import { updateSong } from "@/lib/mcp/tools/song-metadata"

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Emulator only: FIRESTORE_EMULATOR_HOST is not set.")
const args = process.argv.slice(2).filter((a) => a !== "--")
const TO = args.includes("--to") ? args[args.indexOf("--to") + 1] : "nava-tehila"
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "crcmusiccharts"

if (!getApps().length) initializeApp({ projectId: PROJECT_ID })
const db = getFirestore()

const COLLS = ["library_index", "songs", "tracks", "setlists", "collections"]
async function snapshotAll() {
    const out: Record<string, unknown> = {}
    for (const c of COLLS) for (const d of (await db.collection(c).get()).docs) out[`${c}/${d.id}`] = d.data()
    return JSON.stringify(out, Object.keys(out).sort())
}
function diffKeys(a: string, b: string): string[] {
    const A = JSON.parse(a) as Record<string, unknown>
    const B = JSON.parse(b) as Record<string, unknown>
    const keys = new Set([...Object.keys(A), ...Object.keys(B)])
    return [...keys].filter((k) => JSON.stringify(A[k]) !== JSON.stringify(B[k]))
}

const owners = ((await db.doc("platform/owners").get()).get("uids") as string[] | undefined) ?? []
const ADMIN = owners[0]
if (!ADMIN) throw new Error("platform/owners has no uid in this export")

const crcSetlists = (await db.collection("setlists").get()).docs.filter((d) => (d.get("orgId") ?? "crc") === "crc").map((d) => d.id)
const rowIds = (r: unknown) => ((r as { rows?: Array<{ fileId: string }> }).rows ?? []).map((x) => x.fileId).sort()

async function reads() {
    const setlists: Record<string, string> = {}
    for (const id of crcSetlists) setlists[id] = JSON.stringify(await getSetlist(ADMIN, { id }, "crc"))
    return {
        setlists,
        crcNava: rowIds(await listLibrary(ADMIN, { collection: "nava", limit: 500 } as never, "crc")),
        crcDefault: rowIds(await listLibrary(ADMIN, { limit: 2000 } as never, "crc")),
        blAll: rowIds(await listLibrary(ADMIN, { limit: 2000, includeShared: true } as never, "brotherslazaroff")),
    }
}
async function bondedUnresolved(): Promise<string[]> {
    const bad: string[] = []
    for (const t of (await db.collection("tracks").get()).docs) {
        const s = t.get("setlistId") as string | undefined
        const fid = t.get("fileId") as string | undefined
        if (!fid || !s || !crcSetlists.includes(s)) continue
        const row = await db.collection("library_index").doc(fid).get()
        if (row.exists && !visibleTo(row.data(), "crc")) bad.push(`${s}/${t.id}→${fid}`)
    }
    return bad
}
function check(label: string, ok: boolean, detail = "") {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`)
    if (!ok) process.exitCode = 1
}

const start = await snapshotAll()
const r0 = await reads()
const unresolvedBefore = await bondedUnresolved()
console.log(`restore: ${crcSetlists.length} CRC setlists, nava tab ${r0.crcNava.length} rows, CRC default ${r0.crcDefault.length}, BL ${r0.blAll.length}; bonded tracks not visible to CRC before: ${unresolvedBefore.length}`)

const stamp = await planStamp(db, null, PROJECT_ID)
console.log(`stamp: ${JSON.stringify(stamp.summary)}`)
await applyStamp(db, null, stamp)
const stamped = await snapshotAll()
const r1 = await reads()
check("stamp leaves every CRC/BL read identical", JSON.stringify(r1) === JSON.stringify(r0))

if (!(await db.doc(`orgs/${TO}`).get()).exists) await db.doc(`orgs/${TO}`).set({ id: TO, name: "Nava Tehila (rehearsal)" })
const plan = await planNavaMove(db, null, TO, PROJECT_ID)
console.log(`move plan: ${JSON.stringify(plan.summary)}`)
await applyNavaMove(db, null, JSON.parse(JSON.stringify(plan)))
const r2 = await reads()
const moved = (await db.collection("library_index").where("orgId", "==", TO).get()).docs.map((d) => d.id)
check("moved rows now owned by the new tenant", moved.length > 0, `${moved.length} rows`)
check("every CRC setlist reads back identically", JSON.stringify(r2.setlists) === JSON.stringify(r0.setlists),
    Object.keys(r0.setlists).filter((k) => r0.setlists[k] !== r2.setlists[k]).slice(0, 5).join(","))
const unresolvedAfter = await bondedUnresolved()
check("every bonded CRC track's chart row stays visible to CRC", unresolvedAfter.length === unresolvedBefore.length, unresolvedAfter.slice(0, 5).join(","))
check("CRC nava tab lists the same rows", JSON.stringify(r2.crcNava) === JSON.stringify(r0.crcNava), `${r0.crcNava.length} → ${r2.crcNava.length}`)
check("CRC default library unchanged", JSON.stringify(r2.crcDefault) === JSON.stringify(r0.crcDefault), `${r0.crcDefault.length} → ${r2.crcDefault.length}`)
check("Brothers Lazaroff sees none of the moved rows", !r2.blAll.some((id) => moved.includes(id)) && JSON.stringify(r2.blAll) === JSON.stringify(r0.blAll))
const sample = moved[0]
const song = await getSong(ADMIN, { id: sample }, "crc")
check("CRC still reads a moved chart", !!song, sample)
check("BL cannot read a moved chart", (await getSong(ADMIN, { id: sample }, "brotherslazaroff")) === null)
// A non-owner write through the CRC connector: refused before any write.
const before = JSON.stringify((await db.collection("songs").doc(sample).get()).data())
const upd = (await updateSong(ADMIN, { id: sample, key: "Bm" }, "crc")) as { ok?: boolean; error?: { machine_code?: string; message?: string } }
check("CRC edit of a moved chart is refused", upd?.ok === false && upd.error?.machine_code === "not_owner", upd?.error?.message ?? JSON.stringify(upd).slice(0, 160))
check("refused edit wrote nothing", JSON.stringify((await db.collection("songs").doc(sample).get()).data()) === before)

const u1 = await undoNavaMove(db, null, JSON.parse(JSON.stringify(plan)), true)
check("undo move: nothing skipped", u1.skipped.length === 0, JSON.stringify(u1.skipped).slice(0, 200))
const afterUndoMove = await snapshotAll()
check("undo move returns to the stamped state", afterUndoMove === stamped, diffKeys(stamped, afterUndoMove).slice(0, 5).join(","))
const u2 = await undoStamp(db, null, JSON.parse(JSON.stringify(stamp)), true)
check("undo stamp: nothing skipped", u2.skipped.length === 0, JSON.stringify(u2.skipped).slice(0, 200))
const end = await snapshotAll()
check("undo both returns every document to the start", end === start, diffKeys(start, end).slice(0, 5).join(","))
check("reads after undo match the start", JSON.stringify(await reads()) === JSON.stringify(r0))
