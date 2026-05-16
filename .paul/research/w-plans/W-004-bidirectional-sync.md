# W-004 — Bidirectional sync first-class

**Status:** Planning doc, no code. Derived from `setlist-system-punch-list.md` §W-004 / S-001 / A-002 / E-002.
**Author:** Claude (planning pass, 2026-05-16)
**Sister docs:** [W-001](W-001-agentic-ux-shape.md) · [W-002](W-002-trust-calibration.md) · [W-003](W-003-library-hygiene.md)

---

## 1. Problem framing

During the Chase session, the rabbi and the agent were editing the same setlist within the same minute. The rabbi uploaded a replacement Hashkivenu in the browser; that upload created a new track row (per S-003), so the agent's last-known `trackId` for the old Hashkivenu became stale. The agent's next `update_track` returned `{"error": "Track not found"}` with no further context — see E-002. The agent had to re-fetch the entire setlist to figure out what had happened, then guess which new row was the replacement.

That's the optimistic-concurrency gap. Two writers, no version, no useful error envelope, no recovery hint.

With David Lazaroff onboarding as a second band_leader, concurrent authoring is no longer hypothetical — Daniel and David could plausibly be in the same setlist at the same time on a Friday afternoon. The tactical fixes the parallel session is shipping (chart-render verify, orphan sweep, upload-from-path) don't touch the concurrency dimension. This W is the deliberate concurrency design pass.

Three related-but-separate tracks (revised 2026-05-16 after Daniel discussion):
- **Track A — Optimistic concurrency on writes** (the required half). Versions, stale-rejection, recovery hints. Bounded, well-understood.
- **Track B-cheap — Long-poll `wait_for_setlist_change` tool** (the recommended-default observability layer). A normal MCP tool that blocks server-side until either a version change or a timeout fires. Fits MCP's request/response model natively, no SSE plumbing. **Decided 2026-05-16: this is the Track B that ships.**
- **Track B-real — SSE / change-feed stream** (deferred). Real Server-Sent Events with `Last-Event-ID` replay. Deferred until there's measured pain Track B-cheap can't address — the MCP transport doesn't yet have a clean idiom for consuming long-lived push streams, and Vercel function lifetime + Firebase token-refresh add real complexity for unclear benefit.

## 2. Proposed scope

### Track A — Optimistic concurrency (in scope, required)

- Every mutable resource gains a `version: number` field, incremented on every write:
  - `setlists/{id}.version` (top-level, covers metadata + reorder).
  - `setlists/{id}/tracks/{trackId}.version` (per-row).
- Every read tool surfaces version:
  - `get_setlist` returns `{setlist: {..., version}, tracks: [{..., trackId, version}]}`.
  - `list_setlists` returns `version` per row.
- Every write tool accepts an optional `lastSeenVersion` and rejects on mismatch:
  - `update_setlist({setlistId, patch, lastSeenVersion?})`.
  - `update_track({setlistId, trackId, patch, lastSeenVersion?})`.
  - `bulk_update_tracks({setlistId, patches: [{trackId, patch, lastSeenVersion?}], mode})`.
  - `reorder_setlist({setlistId, order, lastSeenVersion?})`.
  - `remove_track({setlistId, trackId, lastSeenVersion?})`.
  - `delete_setlist({setlistId, lastSeenVersion?})`.
- Rejection envelope (uniform across tools):
  ```
  {
    error: "stale_version",
    message: "Setlist (or track) was modified by another writer.",
    currentVersion: <int>,
    lastSeenVersion: <int>,
    hint: "Call get_setlist to refresh state and retry.",
    setlist: { lastModifiedBy: <uid>, lastModifiedAt: <iso> }
  }
  ```
- `lastSeenVersion` is **opt-in**. Omitting it preserves today's last-writer-wins behavior. Agent code (Claude Desktop's MCP integration) should always pass it; HTTP callers (the in-app UI, if Daniel revives it) can opt in gradually.
- Bulk-update semantics: in atomic mode, a single stale `lastSeenVersion` rejects the entire batch with which-row(s)-failed surfaced. In best-effort mode, stale rows skip and report.
- Companion fix for E-002 (Track-not-found has no context) folds in cheaply: when `update_track` fails because `trackId` doesn't exist, the envelope adds `setlistVersion`, `lastModifiedAt`, and `hint: "Track may have been deleted or replaced — call get_setlist."`

### Track B-cheap — Long-poll `wait_for_setlist_change` (in scope, recommended default)

- New MCP tool: `wait_for_setlist_change(setlistId, sinceVersion, timeoutSec=30)`.
- Semantics: server attaches a Firestore listener internally on `setlists/{setlistId}` plus its `tracks/` subcollection; returns as soon as the setlist version moves past `sinceVersion`, OR returns `{changed: false, currentVersion: sinceVersion}` if `timeoutSec` elapses with no change.
- Return shape on change:
  ```
  {
    changed: true,
    currentVersion: <int>,
    changes: [
      { entity: "track" | "setlist", id, version, kind: "update"|"insert"|"delete", by?, at }
    ],
    setlist?: <full get_setlist payload — opt-in via includeFullState: true>
  }
  ```
- Auth: same role gate as `get_setlist`.
- Max `timeoutSec` capped at 60 (Vercel function timeout headroom). Agent chains successive calls if it wants to wait longer ("give me 5 minutes" → ~5 sequential 60s waits).
- Compatible with W-001's propose-then-confirm loop: after staging a proposal, the agent can optionally `wait_for_setlist_change` with the staged version to catch David editing in parallel before the rabbi confirms.
- Rate-limit tier `api` with trusted-leader bypass per `feedback_admin_rate_limit_bypass`.

### Track B-real — SSE / change-feed (deferred)

- Originally proposed: `subscribe_setlist_changes(setlistId)` as a real Server-Sent Events stream with `Last-Event-ID` reconnect.
- **Deferred 2026-05-16.** Three reasons:
  1. **MCP transport mismatch.** Claude Desktop's MCP integration is JSON-RPC request/response. There's no natural idiom yet for "tool returns a stream of pushes for an hour". Building SSE before the client knows what to do with it is solving a future problem.
  2. **Infra cost.** SSE on Vercel needs Edge runtime + careful function-timeout / reconnect handling. Firebase ID tokens expire in 1 hour and would need either stream-side refresh or long-lived service tokens — neither is free.
  3. **Track B-cheap covers the realistic use cases.** Long-poll gives ~80% of the observability value at ~25% of the cost.
- Revisit if: (a) the MCP ecosystem standardizes on a streaming idiom, OR (b) we measure that long-poll is materially worse for some real workflow, OR (c) a non-MCP web/iPad client wants live setlist updates (different surface, different requirements).

## 3. Explicit open questions for Daniel

1. ~~**How important is Track B?**~~ **ANSWERED 2026-05-16:** Track B-cheap (long-poll `wait_for_setlist_change`) is in scope as the recommended default. Track B-real (SSE) is deferred. See §2.

2. **Per-row version vs setlist-only version?** Per-row is precise (Row A can update while Row B is being edited concurrently); setlist-only is simpler (any concurrent edit conflicts). Per-row is the punch-list's S-001 ask. Recommend per-row + setlist version both, but the rejection logic for `update_track` keys on row-level only — the setlist-level version is mostly for `update_setlist` / `reorder_setlist`.

3. **What should bulk_update_tracks do in atomic mode when one row's version is stale?** Options: (a) reject the whole batch with one envelope listing all stale rows; (b) reject on first stale, no info about the rest; (c) check all versions first in a pre-flight read, then apply. Recommend (c) — slightly more work, much better operator experience.

4. **Does `reorder_setlist` need its own version?** Reorder mutates every track's `position` field plus the setlist's `version`. Recommend: reorder accepts `setlist.lastSeenVersion` only, not per-row versions. Per-row reorder concurrency is rare and the user-facing failure mode ("you reordered while David was also reordering — refresh") is fine to be coarse.

5. **`publish_setlist` and version** — should publish require `lastSeenVersion`? Strict answer is yes (you wouldn't want to publish a state that's been modified since you reviewed it). Lenient answer is no (the snapshot is whatever the server has at publish time). Recommend strict: agent must pass the version it presented to Daniel in the preview, server compares, rejects if drifted. This matters more once W-001's "preview before publish" loop is live.

6. **Cloud-Function vs transaction increment?** Two reasonable paths: (a) every write tool reads-then-writes in a Firestore transaction, incrementing version inline; (b) a Firestore trigger watches doc writes and increments version. (a) gives consistent rejection semantics; (b) decouples but introduces eventual-consistency surprises. Recommend (a) — the tools already use transactions for tracks; adding `version` is one line.

7. **Backfill** — every existing setlist + track doc lacks `version`. Initial-write behavior: treat missing-version as `0`; first write sets `1`. No backfill needed. OK?

8. **Browser-side support** — should `useSetlist` / `useLibrary` etc. start passing `lastSeenVersion` on its writes too? Recommend: yes eventually, no in MVP. The browser is the band's surface; band-side writes are minimal (chart upload + maybe a publish click). Defer until a real concurrent-browser race is observed.

## 4. Dependencies on tactical fixes currently shipping

- **Atomic upload guard (`f650d94f0`)** — sets the pattern for transactional writes the tools should mirror. No code overlap, just pattern reuse.
- **W-001 propose-then-confirm loop** — heavy *consumer* of `lastSeenVersion`. The preview shows the rabbi a state at version N; the commit must reject if the state has drifted past N. Without W-004 the propose-commit gap is racy.
- **W-002 specificity signals** — independent; specificity lives in `library_index` not on setlist docs, no version interaction.
- **W-003 dedup-redirect sweep** — when dedup automatically updates bonded tracks to a canonical songId, those writes need to skip `lastSeenVersion` or accept "dedup writer" as a privileged bypass. Minor coordination point.
- **No overlap with the four tactical-fix files** — versions live on setlist + track docs, owned by `server-setlists.ts` / `server-tracks-write.ts`. The parallel session owns `server-tracks-write.ts`. **This is a real coordination point** — W-004 will eventually need to edit `server-tracks-write.ts` and must wait for that lane to clear before scoping the implementation phase.

## 5. Effort estimate

**M (medium) for Track A + Track B-cheap bundled.**

Track A:
- Schema addition + version-increment in transaction logic on the 7 write tools: ~1.5 days.
- Read-tool envelope updates (5 tools): ~0.5 day.
- Rejection envelope helper + per-tool wiring: ~0.5 day.
- Emulator tests covering stale-write rejection on every write tool, plus bulk pre-flight check: ~1 day.
- E-002 envelope polish for track-not-found: ~0.25 day. Bundled.
- Subtotal: **~3.5 days.**

Track B-cheap (long-poll `wait_for_setlist_change`):
- Firestore listener attached server-side with promise + timeout race: ~0.25 day.
- Tool wiring (schema, auth gate, rate-limit, Vercel-timeout cap): ~0.25 day.
- Emulator tests (returns on track update, returns on setlist update, returns on timeout with `changed: false`, respects role gate, version-monotonicity): ~0.5 day.
- Subtotal: **~1 day** on top of Track A.

**Combined: ~4.5 days.** Track B-real (SSE) explicitly out — deferred, see §2.

## 6. Suggested sequence vs. other Ws

**Ship fourth**, after W-001 in implementation order, but **scope/plan it third** so W-001's interaction-shape commitments don't ignore concurrency.

Order:
1. Tactical fixes (parallel session).
2. W-002 specificity (data).
3. W-001 interaction shape (consumes W-002 + tactical).
4. **W-004 Track A + Track B-cheap** (this doc — concurrency safety net + long-poll observability, shipped together).
5. W-003 hygiene (parallel content work, no engineering blocker after pass 1).
6. W-004 Track B-real (SSE) — deferred indefinitely; revisit if MCP streaming idioms mature or measured pain shows up.

Rationale for sequencing W-004 after W-001 rather than before:
- W-001's propose-then-commit pattern is what makes optimistic concurrency *useful*. Without W-001, `lastSeenVersion` rejections are just an extra failure mode for direct writes.
- The coordination point on `server-tracks-write.ts` (in the parallel-session lane) is more comfortably scheduled later — by then that file is stable.
- Track A is small enough (~3.5 days) that even shipping last in the W-sequence, it doesn't delay anything.

**If Daniel had to pick one W to start with first:** still not this one. W-002 is the right starting point because every other W consumes its signals. W-004 is foundational but it's better-foundational-second-pass than required-up-front.
