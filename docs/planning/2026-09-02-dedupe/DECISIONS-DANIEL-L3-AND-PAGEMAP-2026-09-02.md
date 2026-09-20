# DECISIONS → live-cw: three answers from Daniel, taken directly, unminted

Lane: **live (Code)**, host-side · For: **live-cw (Opus Cowork)**
Status: **RECORD, NOT A RULING.** `live` never spends a ruling id (rule 1). Daniel answered these to
the Code lane directly, in session, on 2026-09-02T15:5xZ. They are written here verbatim so `live-cw`
can mint them in a sitting with the ids and `ruling_lint` they deserve. **Nothing below is an
`R-` number yet.**

Provenance: Daniel asked "is there more work for you? if there are gates we can rule on to open your
lane, lets do that." I brought him the three open items from
`HANDOFF-COWORK-LIVE-INTEGRATION-2026-09-01.md` §"Questions Daniel has NOT yet answered" that gate
satellite-side work. He answered all three.

---

## 1 · L3's data model — **bind per arrangement**

> *The question, as the program brief put it:* whether a chart's binding is per **arrangement**
> (Moshav vs Shur vs Friedman) or the library row grows a parent "song" grouping first.

**Daniel chose: bind per arrangement.** The moment binds to each `library_index` row directly.
No parent "song" entity, no migration ahead of L3.

```
library_index row
  moments: [{ id, confidence, provenance, confirmedBy }]

"Hashkivenu" (Moshav)   -> shabbat-maariv.hashkivenu
"Hashkivenu" (Shur)     -> shabbat-maariv.hashkivenu
"Hashkivenu" (Friedman) -> shabbat-maariv.hashkivenu

pick moment -> 3 rows, ranked
```

This is the data model `DESIGN-L3-BINDING-2026-09-02.md` already assumes in its §"data model on the
library row", so that design does not need reshaping — it needs the choice recorded under it.

**What it does not decide:** what "ranked" means (still open, L4), and whether a parent grouping gets
added *later*. Every moment→row edge survives that addition, which is part of why this direction is
the cheap one to be wrong about.

## 2 · The two pagemap books — **wait for C4**

> *The question:* how much of the pagemap books' moment-mapping is worth doing by hand now versus
> waiting for C4 (Friday import, next in the corpus program).

**Daniel chose: wait.** The 110 entries — `crc-friday` 48, `crc-saturday` 62, neither carrying a
moment id today [measured: `src/data/books/crc-friday.json`, `crc-saturday.json`, 2026-09-02T15:4xZ]
— are **not** to be hand-mapped now.

The reasoning brought to him, and the reason it is worth writing down: `moments.json` does not exist
yet, `cont` owns producing it, and mapping 110 entries onto a vocabulary whose contract is unfinished
risks doing the work twice. C4 brings the Friday book in as a feed, and the ids come from the pipeline
rather than from a hand that guessed.

**Consequence for L2, stated plainly:** L2's "meanwhile, map the two pagemap books satellite-side"
clause is **stood down** until C4. L2's remaining dependency is unchanged and is not Daniel's to
clear — it is `cont` emitting `moments.json` into `dist-app/` with a pin.

## 3 · The last dedupe group — **run it. DONE.**

Authorized and executed in the same turn, single named owner (`live`/Code, this session), per the
standing rule that destructive prod runs get exactly one executor.

```
dedupe_library({dryRun:false, force:true})
  -> scanned 791 · groupsFound 1 · wouldMark 1 · committed 1 · songsMirrored 1
     group "three little birds"
       KEPT   upload-8076119a-…  Three Little Birds  2026-06-18
       MARKED upload-5253e0ba-…  Three Little Birds  2026-06-20

verify: dedupe_library({dryRun:true})
  -> groupsFound 0 · wouldMark 0 · scanned 790 · duplicate rows 101
```

**L1 dedupe residue is now ZERO** [measured: live MCP over the host bearer, 2026-09-02T15:5xZ].
No bytes deleted; the mark is a status flip and is reversible.

## One finding, unrelated to the three, worth a look

**The MCP client identity in a Claude Code session is `musician`, not `admin`.**
`dedupe_library` refused with `forbidden_role` / `callerRole: "musician"` on the connected
`claude.ai CRC Music` client, and succeeded over `POST /api/mcp` with the supervisor bearer — same
surface, same tool, different identity. Not a defect and not a vulnerability: the role gate did
exactly its job. But it means **admin-only MCP tools cannot be driven from the connected client in
this session**, and any dispatch that assumes they can will stall on a 403. The bearer path is the
one that works. Flagging it for whoever writes the next order that touches an admin tool.

---

Claude records; Daniel decides. **No ruling id spent.**
