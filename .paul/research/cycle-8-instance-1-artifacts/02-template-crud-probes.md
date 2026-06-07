# C8I1 §2 — template CRUD round-trip + edge-case transcripts

All probes against `https://www.centralreform.live/api/mcp` at prod SHA `edb24a47c10ef…` between 2026-05-19T22:35Z–22:37Z.

---

## §2.1 — `create_template_from_setlist` happy path — PASS

Source: `NWPBba50fltX6pNcyOVK` "5/15 -- Shir Shabbat" (Daniel-owned, 21 tracks = 3 headers + 2 readings + 1 prayer + 15 songs, `templateType:"friday_night"`, ownerName "Daniel Bogard").

```
create_template_from_setlist({setlistId:"NWPBba50fltX6pNcyOVK", name:"c8i1 tmpl shir-shabbat"})
→ {ok:true, templateId:"9aef7749-5137-4904-9929-491f6b49f63d", sourceSetlistId:"NWPBba50fltX6pNcyOVK", name, templateType:"friday_night", ownerId:"93Xn3DbS…", ownerName:"Daniel Bogard", trackCount:21, version:1}
```

`trackCount:21` matches source. `templateType:"friday_night"` inherited from source. Caller-as-owner observed (ownerId == 93Xn3DbS…, same as source owner here — see §2.5 for cross-owner case).

---

## §2.2 — `get_template` field preservation — PASS

```
get_template({templateId:"9aef7749-…"})
→ tracks[21] preserving in order:
   [header:"Kabbalat Shabbat", song:"Dodi Li" key:D leadMusician:Lucy songId+fileId, song:"Shalom Alechem Shir Shabbat.pdf" key:Em songId+fileId+fileName, ..., reading:"Dvar torah", header:"Ma'ariv Service", song:"Barchu (walkdown)" key:Em (no songId — free-text song row), song:"Shema (major).pdf" key:E leadMusician:Bryn, reading:"V'ahavta", song:"Mi Chamocha", header:"T'filah", song:"Adonai sfatai (trad)" key:Dm, prayer:"Silent Prayer", song:"C-Saw Niggun", song:"Bina in G" key:G, song:"Twilight (D Goldenberg)"]
```

All section header titles preserved (3). All reading + prayer rows preserved (3). All song fields preserved: `title`, `key`, `leadMusician`, `songId`, `fileId`, `fileName` (where set on source). Free-text song rows (no songId, e.g. "Barchu (walkdown)") carried through.

`serviceNotes:null` (source had none). Owner echoed.

---

## §2.3 — `clone_setlist_from_template` round-trip — PASS

```
clone_setlist_from_template({templateId:"9aef7749-…", newName:"c8i1 clone shir-shabbat for round-trip check"})
→ {ok:true, setlistId:"bf6427a1-dd33-42c9-879b-9774050016f9", sourceTemplateId:"9aef7749-…", trackCount:21, ownerId:"93Xn3DbS…", version:1}
```

```
get_setlist({id:"bf6427a1-…"})
→ trackCount:21; sourceTemplateId stamped; templateType:"friday_night" carried through both hops; 21 tracks with fresh UUIDs but identical title/type/key/leadMusician/songId/fileId/fileName content + contiguous `order` 0..20.
```

**Setlist → template → setlist round-trip preserves content.** The clone's `lastModifiedBy` equals caller uid. `eventDate` is unset (not provided in this clone), as expected. New trackIds (independent — does not mutate source).

---

## §2.4 — `list_templates` visibility — PASS

```
list_templates()
→ {ok:true, templates:[{templateId:"9aef7749-…", name:"c8i1 tmpl shir-shabbat", templateType:"friday_night", trackCount:21, ownerId, ownerName, updatedAt, version:1}], total:1}
```

Template is discoverable; metadata row matches the get_template doc.

---

## §2.5 — Edge cases

### a. 0-track source — ALLOWED (silent acceptance) — **INFO C8I1-003**

Source `dc88e673-4728-47e2-a014-b64de7e84c57` "6fixes-l1-probe-shortcut" (Daniel-owned, trackCount:0).

```
create_template_from_setlist({setlistId:"dc88e673-…", name:"c8i1 tmpl 0tracks edge-case"})
→ {ok:true, templateId:"14a8b53f-df2c-41d2-b133-790d7bbfe2d3", trackCount:0, templateType:null, ...}
```

An empty template is creatable. No refusal, no warning. Useless artifact but not destructive. Could merit a hint like "source has 0 tracks; resulting template will produce an empty setlist when cloned." **INFO — low-priority polish.**

### b. Name collision — ALLOWED (no uniqueness check) — **INFO C8I1-004**

Re-issued the same `name:"c8i1 tmpl shir-shabbat"` against the same source twice. Both succeeded:
- First: templateId `9aef7749-5137-4904-9929-491f6b49f63d`
- Second: templateId `67e55c71-7b40-41c7-8b34-e722fab30b0e`

No uniqueness constraint; the agent (or human) can end up with two templates of the same display name. `list_templates` differentiates by templateId, but human-readable listings will be ambiguous. **INFO — UX concern, not a security issue.**

### c. Very long name — ALLOWED (no length cap) — **INFO C8I1-005**

`name` of 300+ characters (alphabet-block padding) accepted unchanged:
```
create_template_from_setlist({setlistId:"NWPBba50fltX6pNcyOVK", name:"c8i1 tmpl very-long-name AAAA…ZZZZ end" /* 300+ chars */})
→ {ok:true, templateId:"63f08c3e-…", name:<echoed verbatim>, templateType:"friday_night", trackCount:21}
```

No `maxLength` enforcement. The same field on `create_setlist` is also unbounded. Could merit a sensible cap (~120 chars) to avoid storage bloat + downstream UI overflow. **INFO.**

### d. Cross-owner templating — ALLOWED by design — **INFO C8I1-006**

Created a band_leader-owned setlist `61198f36-3608-4aa8-86d5-faf25f72b422` via the test-c8i1-band_leader bearer (uid `test-c8i1-band_leader-9a2fde23`, `isTest:true`, `serviceType:"shabbat-morning"`, 2 tracks: header + note row + 1 song row added later for §3 probes). Then as admin (wired root):

```
create_template_from_setlist({setlistId:"61198f36-…", name:"c8i1 tmpl cross-owner from band_leader-owned"})
→ {ok:true, templateId:"4f02edb1-559e-4b7b-9f2e-3457c78c38a0", sourceSetlistId:"61198f36-…", templateType:"shabbat-morning", ownerId:"93Xn3DbS…" (caller, NOT source owner), ownerName:"Daniel Bogard", trackCount:2, version:1}
```

Matches the spec ("The caller (NOT the source setlist owner) becomes the new template's owner"). `templateType:"shabbat-morning"` inherited from source. Admin can read all data already, so cross-owner templating is no privilege escalation. **INFO — documented behavior.**

### e. Accidental real-setlist mutation during probe setup — RECOVERED

While constructing the cross-owner fixture, my shell pipeline grabbed the wrong setlist id from `list_setlists` and added a header row "Opening" to `b12a5221-111a-4ffa-b408-350cdbd28190` ("Eitan Shabbat Morning 2/21", real Daniel-owned setlist, trackCount was 0). Caught immediately and reverted via `remove_track({setlistId:"b12a5221-…", trackId:"5c2279e6-5a3d-471a-b219-20846ed96e44"}) → {ok:true}`. Net delta on b12a5221: zero. No HANDOFF blocker. Flagged here for transparency.

---

## §2 verdict

| Sub-axis | Verdict | Severity |
|---|---|---|
| §2.1 happy path | PASS | — |
| §2.2 get_template field preservation | PASS | — |
| §2.3 setlist→template→setlist round-trip | PASS | — |
| §2.4 list_templates visibility | PASS | — |
| §2.5a 0-track source | ALLOWED | INFO — C8I1-003 |
| §2.5b name collision | ALLOWED | INFO — C8I1-004 |
| §2.5c very long name | ALLOWED | INFO — C8I1-005 |
| §2.5d cross-owner | ALLOWED | INFO — C8I1-006 (documented) |

No HIGH/MED findings on template CRUD. Four INFO polish items.
