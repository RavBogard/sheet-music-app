# WAVE-2 — Firebase Storage Rules (SEC-001 drill-down)

**Date:** 2026-04-13
**Firebase project:** `crcmusiccharts` (bucket `crcmusiccharts.firebasestorage.app`)
**Method:** `firebase_get_security_rules(type=storage)` via authenticated Firebase MCP against the current project.

---

## 1. What's actually deployed

Fetched live from the Firebase Rules service (source of truth, not a guess):

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /library/{allPaths=**} {
      allow read: if request.auth != null;
      allow write: if false; // Only admin SDK writes
    }
  }
}
```

That's it. One rule block. No match for paths outside `library/**`, which means the implicit default (deny) applies everywhere else in the bucket — `avatars/`, `originals/`, root uploads, anything an attacker tries to probe. Good.

## 2. Repo state

- `firebase.json` declares `firestore.rules` + `firestore.indexes.json` only. No `storage` key. Confirmed by reading the file.
- No `storage.rules`, `storage.rules.*`, `rules.storage.*`, or commented-out storage rule text anywhere in the repo (grep clean across the tree, including `.planning/`, `.paul/`, `scripts/`, `docs/`).
- `firebase deploy --only storage` errors with "No targets in firebase.json match". Confirms storage rules are 100% console-managed drift — the repo cannot redeploy them, and a wrong-click in the console could silently weaken them with no PR trail.

## 3. Who touches Storage

All writes go through **Firebase Admin SDK** (server-side), which bypasses rules. Confirmed callers:

- `src/lib/firebase-storage.ts` — `uploadToStorage`, `downloadFromStorage`, `getStorageUrl`, `fileExistsInStorage`. All paths are `library/{fileId}{ext}` (line 45). Uses `getStorage().bucket(bucketName)` with admin creds.
- `src/app/api/library/upload/route.ts` — writes `library/${fileId}.pdf` or `.xml` (line 190).
- `src/app/api/setlists/import/execute/route.ts` — writes `library/${newLibraryId}.pdf` (line 103) after pulling from Google Drive.
- `src/lib/sync-engine.ts`, `src/lib/print-pipeline.ts`, `src/inngest/functions.ts` — all use admin SDK bucket access.
- Client-side (`src/lib/firebase.ts`) initializes `storageBucket` but no code calls `getStorage()` / `uploadBytes` / `ref` from the client. Reads happen via signed URLs or through `/api/...` proxies that hit admin SDK.

## 4. What's stored under `library/`

- PDF charts: `library/{fileId}.pdf`
- MusicXML/MXL originals: `library/{fileId}.xml`
- Audio reference files: `library/{fileId}.audio` (see `firebase-storage.ts:73`)
- MuseScore sources: `library/{fileId}.mscz` path pattern used in upload API
- Fallback: `library/{fileId}` (no extension)

No user avatars in Storage (avatars are Google profile URLs via Firebase Auth). No separate `originals/` prefix in current code — the earlier audit note about `library/originals/` is stale; `originals` is only a filename component in MuseScore flow, still under `library/`.

## 5. Exposure assessment

**Read access:** *Any authenticated Firebase user* on the `crcmusiccharts` project can GET any object under `library/**`. This includes members whose role is just `member` (community access), and crucially it includes **anyone who signs up** — Firebase Auth allows Google sign-in, and there's no rule-level gate on the `role` custom claim. The Firestore rules gate `library_index` behind `isMember()`, but the Storage rules do **not** mirror that — the claim check isn't present.

**Write access:** `if false` — client writes are blocked. All uploads go through the admin SDK via authenticated API routes. Good.

**Surprise exposure:** A freshly-signed-in user with **no role claim at all** can read every PDF in the library if they can guess or obtain a `fileId`. File IDs are UUIDs (hard to guess) and URLs are delivered via signed URLs with expiry from `getStorageUrl`, so practical risk is low — but the *rule itself* does not enforce the role. If anyone leaks a raw `library/{uuid}.pdf` path and the attacker authenticates, they get the file.

## 6. Severity: **P1**

Not P0: writes are locked, `fileId`s are UUIDs, there's no PII in charts (they're copyrighted worship sheet music, not secrets), and the Firestore layer gates *discovery* of fileIds to `isMember()`. A pure-auth attacker can't enumerate.

Not P2: the rules live only in the console (no git trail, no review, no rollback), and the read gate is weaker than Firestore's `isMember()`. Drift risk is real — one "allow write: if request.auth != null" mistake in the console and the bucket becomes user-writable, with no PR to catch it.

## 7. Recommended fix (scope for a later phase — do not implement now)

- **(a) Commit `storage.rules`** at `sheet-music-app/storage.rules` with the current rules **plus** role-claim parity: read requires `request.auth.token.role in ['member','musician','band_leader','admin']` (mirror `isMember()` from Firestore). Keep `write: if false`.
- **(b) Add to `firebase.json`:**
  ```json
  "storage": { "rules": "storage.rules" }
  ```
  so `firebase deploy --only storage` works and CI can enforce.
- **(c) Align helper functions** with Firestore's role model. Since Storage rules can't `get()` Firestore docs cheaply, rely on the custom claim path (`request.auth.token.role`) — the `config/admins` fallback used by Firestore's `isAdmin()` isn't worth replicating here; the bootstrap window is tiny.
- **(d) Add a deploy check** in CI: `firebase deploy --only storage --dry-run` fails the build if rules file is missing or malformed.

## 8. Artifacts for the next wave

- Live rules text (section 1) — can be pasted verbatim into `storage.rules` as the baseline.
- `isMember()` helper from `firestore.rules:35-37` — model for the claim check.
- File-path inventory (section 4) — confirms single prefix `library/**` is sufficient; no multi-prefix refactor needed.
