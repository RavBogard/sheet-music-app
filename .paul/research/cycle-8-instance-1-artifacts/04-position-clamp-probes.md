# C8I1 §4 — position-clamp + add-track warning (C7I3-003) transcripts

Probes against `https://www.centralreform.live/api/mcp` at prod SHA `edb24a47c10ef…` at 2026-05-19T22:42Z. Source: band_leader-owned setlist `61198f36-3608-4aa8-86d5-faf25f72b422`, starting `trackCount=3`.

| Probe | input position | post-insert length | observed `order` | `warning` field | verdict |
|---|---|---|---|---|---|
| valid lower bound | 0 | 4 | 0 | absent (None) | PASS — no clamp |
| valid append (== length) | 3 | 4 | 3 | absent | PASS — no clamp |
| way over length | 999 (length=5 at this call) | 6 | 5 | `"position clamped from 999 to 5 (insert range is [0, 5] for the post-insert track count of 6)"` | **PASS — C7I3-003 warning fires** |
| negative | -1 | n/a | n/a | n/a; rich `validation_error` 400 isError:true `Too small: expected number to be >=0` | PASS — Zod refusal layer |

The clamp message format matches the C7I3-003 fix: cites the source `position`, the clamped `order`, and the valid `insert range` against `post-insert track count`. `isError` is falsy on the clamp path (warning is non-fatal); the negative-position case uses the standard Zod `validation_error` envelope with `issues[]` + hint.

Rich envelope on the negative path:
```
{
  ok: false,
  error: { code: 400, machine_code: "validation_error", message: "Invalid arguments — add_track_to_setlist: position: Too small: expected number to be >=0" },
  toolName: "add_track_to_setlist",
  issues: [{ path: "position", message: "Too small: expected number to be >=0", code: "too_small" }],
  hint: "Re-call the tool with corrected arguments (see issues[])."
}
```

**No findings on §4 surface.** C7I3-003 confirmed CLOSED at prod.
