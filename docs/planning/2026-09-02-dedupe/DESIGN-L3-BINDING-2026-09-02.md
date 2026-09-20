# DESIGN → `L3`: how a chart gets a moment

Lane: **live-cw (Opus Cowork)** · Authority: **R-0901-vision-8 §3** · R-0901-live-cw-1 §0 · §1 ·
the MCP agent guide's stage → confirm → commit posture
Status: **design, not an order.** Consumes `SPEC-MOMENTS-JSON-2026-09-02.md`; nothing here can be
built until that artifact exists.

[measured: the post-`L1` catalog (687 visible rows) on the live MCP, and the 188 unit stems in
`~/shireishabbat/dist-app/`'s four feed books, 2026-09-02T02:2xZ]

---

## 1 · The measurement that should shape expectations before any of this is built

A crude fold of every chart title against every feed stem — no alias list, generous prefix
matching — reaches **200 of 687 rows, 29%.** The other 487 do not touch the vocabulary at all.

**The misses are not secular.** They are `Adonai S'fatai`, `Adonai Oz`, `13 Attributes of Mercy`,
`Achot ketana`, `Kol Nidre`. Checked against the stems directly: `sfatai`, `attributes`,
`kol-nidre` and `achot` **do not exist in any feed book**, so these are not fold failures.

The reason is simple and worth stating plainly: **the moment vocabulary covers the books that
exist.** Three Shirei volumes and the legacy Shabbat morning siddur — 188 stems. CRC's repertoire
covers Yom Kippur, Selichot, festivals, camp, Ladino and secular music, and there are no books for
those. The alias list will lift 29% substantially; it will not close this, because the gap is not
spelling.

**So R-0901-vision-8 §4's done-when — "a moment or an explicit none with a reason" — is the right
bar, and the reasons carry most of the weight.** A single `none` would flatten four different
situations into one, and three of the four are temporary.

## 2 · `none` is four answers, and only one is terminal

| reason | means | resolves when |
|---|---|---|
| `secular` | not liturgy — Dylan, Marley, camp songs | never. Terminal, and fine |
| `not-in-any-book` | liturgy CRC sings that no volume sets yet — Kol Nidre, the 13 Attributes | a book covering it is imported. **Pending, not closed** |
| `sub-unit` | the text sits inside a unit rather than being one — `Adonai S'fatai` opens the Amidah | the corpus program's identity work reaches sub-unit granularity |
| `medley` | one chart carrying several prayers — `Abanibi (Hirsch) - Achshav (Folk)` | the title is split, then each part binds |

**Architectural consequence, and it is the one thing here that cannot be retrofitted cheaply: the
binding pass must be re-runnable, and must re-propose every `not-in-any-book` row when
`moments.json` grows.** A one-shot pass that writes `none` and forgets would quietly freeze
today's book coverage into the library forever, and every future import would land without
reaching the charts it was supposed to reach. The pass therefore records **which `moments.json`
version produced each `none`**, and a row whose reason is pending is re-offered when that version
changes. A `secular` never re-proposes.

## 3 · Confidence is computed against the vocabulary, not the stem silo

R-0901-live-cw-1 §0 measured that `titleSpecificity` and `siblingsInCatalog` are computed per
transliteration stem, so a chart can read *high confidence, unique in catalog* beside eleven others
of the same prayer. **Those two fields must not drive moment binding.** They answer "is this title
distinctive in the library"; binding asks "which prayer is this", and the moment vocabulary is the
only spelling-independent key in the system.

Binding confidence comes from the match itself:

| provenance | confidence | example |
|---|---|---|
| `alias-exact` | high | title's prayer stem is a listed alias of exactly one moment |
| `alias-normalized` | high | matches one moment after the fold, no other candidate |
| `alias-ambiguous` | **low — always ask** | the fold reaches more than one moment |
| `setlist-cooccurrence` | medium | the chart has sat on a setlist row carrying a `liturgyRef` |
| `arrangement-sibling` | medium | another chart sharing this row's `arrangement` is already bound |
| `human` | certain | Daniel said so. Never re-proposed |

`setlist-cooccurrence` is small but exact: **13 charts have ever sat on a row that also carried a
`liturgyRef`** [inherited: the `L0` census]. Thirteen is not a training set, it is thirteen free
correct answers, and it should be spent rather than modelled.

**The stop rule keeps its shape from the agent guide** — low confidence with more than one
candidate stops and asks, showing the alternatives — but the *set* it counts over is the moment's
candidates, not the title's siblings. Same posture, right denominator.

## 4 · The tool pair, shaped like the ones that already exist

Nothing new in the interaction model. The MCP already has a stage → confirm → commit loop that
Daniel knows, and the anti-pattern it exists to prevent (the Bar Mitzvah session, in the guide) is
exactly the failure a 687-row binding pass could reproduce at scale.

- **`propose_moment_bindings`** — over a filter (collection, a family, unbound-only) or the whole
  library. Returns a `stageId` and rows: `{fileId, title, arrangement, proposed: [{momentId,
  confidence, provenance}], alternatives, none?: {reason}}`. **Writes nothing.** One-shot, expiring,
  like `propose_setlist_changes`.
- **`confirm_moment_bindings`** — commits a stage with `lastSeenVersion`. Atomic. High-confidence
  rows commit; ambiguous rows are only in the stage if Daniel resolved them.
- **`record_moment_correction`** — the learning signal, mirroring `record_bond_correction`: when
  Daniel moves a binding, the correction biases the next proposal for that alias. The existing
  `titleContextHints` mechanism is the precedent and probably the mechanism.

**Batch size is a design constraint, not a preference.** 687 rows is not one confirmation and it is
not 687. The natural unit is the **prayer family** — every Mi Chamocha chart at once — because that
is the decision Daniel is actually making, and it is the shape the `L3` batch worksheet
(`BATCH-L3-ARRANGEMENTS-2026-09-02.md`) already uses for arrangements.

## 5 · Order of operations

1. `moments.json` lands and `sync-books.mjs` consumes it (`L2`, with `cont`).
2. The **alias list** is seeded and curated. Section 1 says why this is not optional: without it
   the proposal pass reaches under a third of the library and the misses look like absences.
3. The **arrangement worksheet** returns — 62 rows — so `arrangement-sibling` has something to
   propagate along.
4. `propose_moment_bindings` over one family, with Daniel, on the record. Then widen.

**Open, and not decided here:** whether a chart may carry a moment from a book the setlist is not
using (a `shabbat-maariv` Mi Chamocha chart on a machzor service). The spec's occurrence model
permits it and `L4` is where it matters — it is R-0901-vision-8 §4's "the service's book fills the
page", and it wants Daniel in the room. Named so it is not settled by whoever implements first.

Claude records; Daniel decides.
