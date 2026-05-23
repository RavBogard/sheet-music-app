// Heal mixed-type `eventDate` (and the lone stray string `date`) in the
// `setlists` collection → normalize every value to a Firestore Timestamp.
//
// WHY: `eventDate` is stored with MIXED Firestore types — Timestamp on newer
// rows, ISO String on older/cloned rows, absent on templates. Firestore's
// canonical cross-type sort ranks Timestamp < String, so
// `.orderBy('eventDate','desc').limit(n)` returns ALL string-typed rows before
// ANY timestamp-typed one and drops recent services past the limit window; a
// `.where('eventDate','>=')` range filter ignores string-typed rows entirely
// (VERIFY-1 2026-05-23 — Kabbalat Shabbat / Shavuot vanished from
// list_setlists). The src defensive fix (server-setlists.ts) makes the READ
// path robust; this script removes the ROOT CAUSE so the stored type is
// uniform and the simple Firestore queries become safe again.
//
// SAFETY: DRY-RUN by DEFAULT — prints the full per-doc before/after plan and
// writes NOTHING. Pass --apply to write. Idempotent: values already stored as
// a Timestamp are left untouched; absent eventDate (templates) untouched;
// unparseable strings are REPORTED and skipped, never written. The actual prod
// run is Daniel's single-owner, dry-run-first step (post-service) per the
// destructive-run discipline.
//
// Run: node scripts/heal-eventdate-types.mjs            (dry-run, default)
//      node scripts/heal-eventdate-types.mjs --apply    (write Timestamps)
import * as dotenv from "dotenv"
import { initializeApp, getApps, cert } from "firebase-admin/app"
import { getFirestore, Timestamp } from "firebase-admin/firestore"
dotenv.config({ path: process.env.ENV_FILE || ".env.local" })

const APPLY = process.argv.includes("--apply")

const sa = {
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
}
if (!sa.projectId || !sa.clientEmail || !sa.privateKey) {
  console.error(
    "missing Firebase admin creds (need NEXT_PUBLIC_FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY in .env.local)",
  )
  process.exit(1)
}
if (!getApps().length) initializeApp({ credential: cert(sa) })
const db = getFirestore()

// Fields to normalize. `eventDate` is the primary culprit; `date` has a single
// known string outlier (VERIFY-1) that this also heals so both ordering fields
// are uniform.
const FIELDS = ["eventDate", "date"]

function classify(v) {
  if (v === undefined || v === null) return "absent"
  if (v instanceof Timestamp) return "timestamp"
  if (typeof v === "string") return "string"
  return "other"
}

// Parse a stored ISO string → Date (or null when unparseable). The offset
// forms (e.g. `...-06:00`) and the `Z` forms both parse to the correct instant.
function parseStringDate(s) {
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

const snap = await db.collection("setlists").get()
console.log(`total setlist docs: ${snap.size}`)
console.log(
  `mode: ${APPLY ? "APPLY (writing Timestamps)" : "DRY-RUN (no writes — pass --apply to write)"}\n`,
)

const planByDoc = new Map() // id → { name, fields: { [field]: { from, date, toIso } } }
const unparseable = [] // { id, name, field, val }
const counts = Object.fromEntries(
  FIELDS.map((f) => [f, { timestamp: 0, string: 0, absent: 0, other: 0 }]),
)

for (const doc of snap.docs) {
  const data = doc.data()
  const name = typeof data.name === "string" ? data.name : "(untitled)"
  for (const field of FIELDS) {
    const v = data[field]
    const kind = classify(v)
    counts[field][kind] += 1
    if (kind !== "string") continue // only string-typed values need healing
    const parsed = parseStringDate(v)
    if (!parsed) {
      unparseable.push({ id: doc.id, name, field, val: v })
      continue
    }
    if (!planByDoc.has(doc.id)) planByDoc.set(doc.id, { name, fields: {} })
    planByDoc.get(doc.id).fields[field] = {
      from: v,
      date: parsed,
      toIso: parsed.toISOString(),
    }
  }
}

console.log("stored-type census:")
for (const field of FIELDS) {
  const c = counts[field]
  console.log(
    `  ${field}: timestamp=${c.timestamp}  string=${c.string}  absent=${c.absent}  other=${c.other}`,
  )
}

const fieldUpdateCount = [...planByDoc.values()].reduce(
  (n, d) => n + Object.keys(d.fields).length,
  0,
)
console.log(
  `\nstring-typed values to normalize → Timestamp: ${fieldUpdateCount} (across ${planByDoc.size} doc(s))`,
)
for (const [id, d] of planByDoc) {
  console.log(`  ${id}  "${d.name}"`)
  for (const [field, info] of Object.entries(d.fields)) {
    console.log(`      [${field}] ${JSON.stringify(info.from)}  →  Timestamp(${info.toIso})`)
  }
}
if (unparseable.length) {
  console.log(
    `\nUNPARSEABLE string values (REPORTED, NOT written): ${unparseable.length}`,
  )
  for (const u of unparseable) {
    console.log(`  [${u.field}] ${u.id}  "${u.name}"  ${JSON.stringify(u.val)}`)
  }
}

if (!APPLY) {
  console.log(
    `\nDRY-RUN: would update ${fieldUpdateCount} field value(s) across ${planByDoc.size} doc(s). Re-run with --apply to write.`,
  )
  process.exit(0)
}

const docIds = [...planByDoc.keys()]
let updatedDocs = 0
for (let i = 0; i < docIds.length; i += 400) {
  const chunk = docIds.slice(i, i + 400)
  const batch = db.batch()
  for (const id of chunk) {
    const upd = {}
    for (const [field, info] of Object.entries(planByDoc.get(id).fields)) {
      upd[field] = Timestamp.fromDate(info.date)
    }
    batch.update(db.collection("setlists").doc(id), upd)
  }
  await batch.commit()
  updatedDocs += chunk.length
}
console.log(`\nupdated ${updatedDocs} doc(s) (${fieldUpdateCount} field value(s)).`)

// Verify: re-read and confirm no string-typed eventDate/date remain (excluding
// any reported-unparseable values, which are intentionally left as-is).
const snap2 = await db.collection("setlists").get()
let remaining = 0
for (const doc of snap2.docs) {
  const data = doc.data()
  for (const field of FIELDS) {
    if (typeof data[field] === "string") remaining++
  }
}
console.log(
  `remaining string-typed eventDate/date values after heal: ${remaining} (expect ${unparseable.length})`,
)
