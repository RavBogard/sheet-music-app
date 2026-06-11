# BUG — Cowork agent cannot upload chart files (all three paths fail)

**Reported by:** David Lazaroff, 2026-06-10 (Google Doc, copied verbatim below triage note)
**Triage (Daniel + Claude consultant, 2026-06-10):** Candidate **P1** for the
next milestone (agent authoring is a primary surface; hard dead end hit by a
band leader in real use).

**Triage notes:**

- Suggested fix #1 (sandbox proxy allowlist for `storage.googleapis.com`) is
  **Anthropic's infrastructure, not ours** — submit as Cowork feedback, do not
  plan around it.
- **Primary fix = #4**: `import_chart_from_drive` accepts `.docx` + Google Docs,
  converts to PDF server-side (Drive API export / convert-on-copy). Agent
  passes references, never bytes. Kills the common case.
- **Secondary fix = #3**: chunked inline `upload_chart` (init/append/commit)
  for non-Drive sources. Token-expensive; fallback only.
- Fix #2 (server pulls a pre-staged file) collapses into #4 once Drive is the
  staging area.
- **Interim workarounds:** web-app upload, or run the signed-URL PUT from
  Claude Code (unproxied network) instead of Cowork.
- **Stress-test coverage gap:** run 1 (2026-06-10) did not exercise chart
  upload paths at all. Added to the stress prompt for future runs.

---

## Original report (verbatim)

**Reported by:** David Lazaroff **Date:** 2026-06-10 **Component:** brotherslazaroff.live MCP (chart library) + Cowork sandbox network egress **Severity:** High — there is currently **no working path** for a Cowork agent to add a non-trivial chart file to the library.

### Summary

While bonding a Queen Jane lyric chart to the "TGFM" setlist, every available method for getting the file into the chart library failed. The documented large-file path (`request_chart_upload_url` → HTTP PUT → `finalize_chart_upload`) fails because the Cowork sandbox's outbound proxy refuses the CONNECT to Google Cloud Storage with **HTTP 403**. The two fallback paths are also blocked, leaving no viable route.

### Environment

- Surface: Claude Cowork mode (sandboxed Linux workspace)
- MCP server: `brotherslazaroff` chart library (id `08482c0f-…`)
- Target setlist: `TGFM` (id `AyDVMS3af1uA0rkNdTNq`)
- File: `Queen Jane.pdf` — 48,523 bytes, application/pdf, 1 page

### What happened — all three paths failed

**1. `import_chart_from_drive` — rejected by MIME allowlist.** Source is a Word doc (`Queen Jane Approximately.docx`):

    upload_failed: Unsupported mimeType
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'.
    Allowed: application/pdf, application/xml, text/xml, …, image/png, image/jpeg, …

Drive-native Google Docs are also rejected (must export to PDF first).

**2. `upload_chart` (inline base64) — exceeds agent I/O token limit.** 48 KB PDF → ~64,700 base64 chars > tool-result token cap (~25K tokens). Inline base64 only viable under ~50 KB; a one-page lyric PDF already exceeds this.

**3. `request_chart_upload_url` → PUT → `finalize_chart_upload` — blocked by sandbox proxy. ← PRIMARY BUG** `request_chart_upload_url` succeeded (`uploadSessionId: usess-b67e2e18-…`); the PUT failed:

    $ curl -X PUT --data-binary @"Queen Jane.pdf" \
        -H 'Content-Type: application/pdf' "<signed storage.googleapis.com URL>"
    curl: (56) Received HTTP code 403 from proxy after CONNECT

The sandbox egress proxy 403s the CONNECT to `storage.googleapis.com`. The signed URL is valid; the request never reaches GCS.

### Impact

No working way for a Cowork agent to add a real chart file to the library. Setlist rows stay unbonded (title-only).

### Suggested fixes (any one unblocks)

1. Allowlist `storage.googleapis.com` (and/or `*.firebasestorage.app`) for sandbox egress. *(Anthropic-side — see triage.)*
2. Server-side fetch option (server pulls a pre-staged file).
3. Raise/stream the inline `upload_chart` ceiling (chunked base64).
4. Accept `.docx` and Google Docs in the import path, converting server-side to PDF.

### Repro

1. Any PDF chart > ~50 KB in Cowork with the broslaz MCP.
2. `request_chart_upload_url({title, mimeType:'application/pdf', sizeBytes})`.
3. `curl -X PUT --data-binary @file.pdf -H 'Content-Type: application/pdf' "<uploadUrl>"` from the sandbox.
4. `curl: (56) Received HTTP code 403 from proxy after CONNECT`.

### Workaround

Upload via the web app (or any direct-network environment), then `search_library` + bond the `songId`.
