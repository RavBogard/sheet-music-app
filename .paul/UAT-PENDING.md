# UAT-PENDING

Running list of human-verify items carried forward instead of blocking the
merge. Daniel verifies them against the deployed build whenever convenient;
failures route to a follow-up.

| Status legend | |
|---|---|
| ⏳ | Pending — not yet checked |
| ✅ | Verified working |
| ❌ | Failed — needs follow-up |

> The v7.0-era list was retired to `archive/` under rule 14 (R-0901-vision-4).
> This file is re-opened for items that genuinely cannot be proven without a
> human at a real client.

---

## ⏳ batch-chart-intake — drop zone in Claude Desktop (real client)

**Branch:** `feat/batch-chart-intake`. Needs a deploy plus
`firebase deploy --only firestore:rules,firestore:indexes --project crcmusiccharts`
and `node scripts/set-storage-cors.mjs --apply`.

In **Claude Desktop**, connected to the centralreform.live MCP server, say:

> open the chart dropzone

Drop **5 mixed files, one of them a duplicate of a chart already in the
library**. Confirm all of:

1. The drop-zone **iframe renders** next to the conversation.
2. The files **upload** (progress advances; no stall at 0%).
3. At least one row comes back **parked**, naming the chart it matched.
4. **Claude narrates** the outcome — it can say what imported and what is
   parked, and acting on "import it anyway" / "skip it" / "that's the chart for
   X" resolves the parked row.

**If the iframe never renders:** that is the known Claude Desktop Apps risk, not
a bug in this work. The companion path is the fallback spec — check Settings →
Developer → Developer Mode is on, then fall back to
`node scripts/upload-batch.mjs <files...>` or `import_drive_folder`, both of
which take the identical path through the server. Record which happened.

Docs: `C:\Users\dsbog\CentralReform.live\sheet-music-app\docs\BATCH-INTAKE.md`
