# Probe 4 — search divergence + Hebrew phonetic tolerance

Surface: `search_library`. All queries run at SHA `db208948f`.

## 4a — Lechu Goldman (broken-shortcut row)

Confirms C8I2-005. The library has a row for "Lechu Goldman.pdf"
(`1jgs72zwhfEvqsqeeCFMw8Th7Zsk0mVJj`) but it's mimeType
`application/vnd.google-apps.shortcut` — reconcile transient bucket can't
heal it (the row needs a re-bond to the shortcut target's fileId, not a
retry).

| query                              | results |
|------------------------------------|---------|
| `search_library("Lechu Goldman")`  | `[]`    |
| `search_library("Lechu Goldman", includeOrphaned:true)` | `[]` |

Even `includeOrphaned: true` returns []. Why? The row has `status: 'active'`
(it's the bond that's broken, not the chart), so the orphaned-include filter
doesn't surface it. So the row is "active but unreadable" and falls through
both filters.

## 4b — Hashkiveinu vs Hashkivenu

Same liturgical text (השכיבנו). Two transliterations split the catalog with
**zero overlap**.

`search_library("Hashkiveinu")` → 3 hits:
- `upload-b6350b58-…` "Hashkiveinu - Full Score"
- `cf704b73-…`        "Hashkiveinu (Brodsky-Zweiback)"
- `e0d2d8d8-…`        "Hashkiveinu (Steven Chaitman)"

`search_library("Hashkivenu")` → 3 different hits:
- `1bntK0UHLQ…` "Hashkivenu"
- `1Zj5951AvR…` "Hashkivenu (Randy)"
- `upload-4c33f063-…` "Hashkivenu (Randy) (1)"

A band-leader searching for "Hashkivenu (Randy)" will miss the three
Hashkiveinu-spelled charts and vice versa. Six distinct catalog entries
for the same word, never discovered together.

## 4c — Lecha Dodi vs L'cha Dodi vs Lcha Dodi

| query                          | results |
|--------------------------------|---------|
| `search_library("Lecha Dodi")` | 5 hits  |
| `search_library("L'cha Dodi")` | 1 hit (L'Cha Dodi Dmin) |
| `search_library("Lcha Dodi")`  | 1 hit (erev shel lcha dodi) |

Apostrophe placement + "e" vs no-"e" splits 7 chart entries across three
disjoint result sets. The Lcha Dodi search misses every charted Lecha Dodi
arrangement and vice versa.

## Dedup-side corollary (new — see C9I3-003)

The same prefix-bucketing problem hits upload-time dedup. From
`src/lib/library-upload.ts:347,372-385`:

```ts
const normalizedName = nameLower.replace(/[^a-z0-9]/g, "")
…
const prefix = normalizedName.slice(0, 6)
…
const prefixEnd = prefix.slice(0, -1) + String.fromCharCode(prefix.charCodeAt(prefix.length - 1) + 1)
const similarSnap = await db.collection("library_index")
  .where("normalizedName", ">=", prefix)
  .where("normalizedName", "<", prefixEnd)
```

"L'cha Dodi" → normalizedName `lchadodi` → prefix `lchado` → range
`[lchado, lchadp)`. "Lecha Dodi" → normalizedName `lechadodi` → prefix
`lechad` → range `[lechad, lechae)`. **The two ranges don't overlap**, so
the fuzzy dedup never sees `Lecha Dodi` as a candidate for `L'cha Dodi`
(and vice versa). Levenshtein distance between `lchadodi` and `lechadodi`
is 1, similarity 0.889 > 0.85 — they WOULD trip the threshold if they
were compared. But the prefix-range cut narrows candidates first.

This means a user can upload near-phonetic duplicates without `force:true`
and the strict 0.85 dedup will silently accept them. **Same root cause
that splits search results splits dedup decisions.**
