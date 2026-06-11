# ACCESS-POLICY.md — Who can see/do what (v0.2, 2026-06-10)

> **Status: RATIFIED by Daniel 2026-06-10** (one cell pending confirmation, marked ⚠️).
> This is the oracle for all permission/tenancy stress tests. A test finding is a
> **bug** only if it contradicts a cell in this matrix.
>
> **Prime directive (Daniel):** *Err on the side of letting someone see a chart.*
> Read access to musical content is cheap to grant and expensive to wrongly deny
> on a Friday night. Writes and people/org administration are gated.

## Personas

| Persona | Definition |
|---|---|
| **Anon** | Not signed in. Includes deep-link visitors (texted a URL). |
| **Member** | Signed in, role `member`. Congregant tier — not a musician. |
| **Musician** | Signed in, role `musician`. NOT org-gated (tenancy model locked 2026-06-09): host determines experience. |
| **Leader (this org)** | `band_leader` with this host's org in `orgIds`. Authoring tier. |
| **Leader (other org)** | `band_leader` whose `orgIds` does NOT include this host's org. Consumer on this host. |
| **Admin** | role `admin`. |
| **Sound engineer** | flag on top of musician/leader. |
| **MCP bearer** | Claude Desktop token, org pinned at mint time. |

## Read surfaces

| Resource | Anon | Member | Musician | Leader (other org) | Leader (this org) / Admin |
|---|---|---|---|---|---|
| Landing page / branding (per host) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Setlist list (this host's org) | ✅ D1 | ✅ | ✅ | ✅ | ✅ |
| Setlist detail + Perform mode | ✅ D1 | ✅ | ✅ | ✅ | ✅ |
| Chart via deep link (`/perform/[fileId]`, `/api/drive/file/[id]`, `/api/library/file/[id]`) | ⚠️ ✅ implied by D1 | ✅ | ✅ | ✅ | ✅ |
| Recordings / audio playback | ⚠️ ✅ implied by D1 | ✅ | ✅ | ✅ | ✅ |
| Chart belonging to the OTHER tenant via deep link | ✅ D3 | ✅ D3 | ✅ D3 | ✅ D3 | ✅ |
| Library browse (this host's org) | ❌ D4 | ✅ D4-rev1 (relaxed 2026-06-10, was ❌) | ✅ | ✅ | ✅ |
| Public schedule = upcoming-services list on `/perform` (D-Q1 2026-06-10) | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/schedule` page = authed assignments view (D-Q1) | ❌ → /login | ✅ | ✅ | ✅ | ✅ |
| Transpose / AI chord-scan in Perform (D-Q2 2026-06-10: OPEN to anon, with abuse rate-limits) | ✅ | ✅ | ✅ | ✅ | ✅ |

> ⚠️ **Pending confirmation (D2):** Since anon may open Perform mode (D1), anon
> chart viewing via direct URL follows logically — a chart deep link is just
> Perform mode for one file. Encoded as ✅. Daniel: veto if wrong, especially
> re: recordings (copyright comfort).

## Write & control surfaces

| Resource | Anon | Member | Musician | Leader (other org) | Leader (this org) | Admin |
|---|---|---|---|---|---|---|
| Create/edit/publish setlists (UI or MCP) | ❌ | ❌ | ❌ | ❌ on this org | ✅ | ✅ |
| Upload/edit/delete charts & library entries (D2) | ❌ | ❌ | ❌ | ❌ on this org | ✅ | ✅ |
| Monitor mix: adjust OWN assigned bus (D6) | ❌ | ❌ | ✅ only if assigned a bus by sound engineer | same rule | ✅ | ✅ |
| Monitor mix: assign buses / others' buses / matrix (D6) | ❌ | ❌ | ❌ | ❌ | sound engineer (+admin) | ✅ |
| Respond to own assignment (accept/decline) | ❌ | ❌ | ✅ own only | — | ✅ | ✅ |
| `/manage` (people, org membership toggles) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| `/admin`, migrations, set-role, delete-user | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| MCP admin tools (mint bearers, test accounts, cleanup) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (Daniel) |

## Admin diagnostics (D7, ratified 2026-06-10)

The web-vitals/RUM admin view (`get_web_vitals_summary`) is intentionally
**global across tenants** — one ops view for the one human operating both orgs.
Not a tenancy violation. Revisit only if a non-Daniel admin ever exists.

## QR codes (D5)

**Intent:** device-handoff login. Daniel hands a tablet to a musician; the musician
scans the QR with their phone and the tablet is logged in as them immediately.

Policy consequences (all testable):

- A QR code is an **auth credential**, not content access. It must be
  **single-use and short-lived** — a stale or reused code must fail cleanly.
- A QR login session grants exactly the scanning musician's normal role, nothing more.
- Anyone photographing a displayed QR must not gain a usable login later.

## Publish & notify (D8, ratified 2026-06-10 — supersedes pure roster-notify)

Daniel's decision on outbound comms (packets, emails, publish notifications):

1. **Never generic.** Nothing sends to anyone without explicit recipient
   selection by the publisher. Auto-blast to a roster is prohibited.
2. **Picker, not blast.** At publish time the leader is shown a recipient
   picker, defaulted to the org's roster, and chooses who receives.
3. **Remembered ad-hoc recipients.** Adding a person the system doesn't know
   (name + email/phone) prompts to save them as a contact for next time.
4. **Org-branded comms.** Packets/emails sent from a broslaz context carry
   broslaz branding; CRC likewise.
5. **Musician org membership** becomes admin-toggleable per org (like the
   band-leader toggle) and **defaults to both orgs**, with a backfill of all
   existing people to both.

**Sequencing invariant:** item 5's backfill must NOT ship before items 1–2.
Under today's auto-notify, default-both membership would re-create the v11.2
BUG-9 blast (broslaz publish → entire CRC roster). Picker first, backfill second.

Until D8 ships, invariant 3 below stands as-is.

## Tenancy invariants (always bugs — no exceptions)

1. **Host determines consumer experience**: broslaz host never shows CRC branding, vocab, setlists, or library rows in its UI lists (and vice versa). Direct deep links across tenants are allowed (D3) — scoping applies to *lists and discovery*, not to *direct URLs*.
2. **Writes land in the author's org** — a setlist authored in broslaz context stores `orgId: brotherslazaroff`.
3. **Publish audience is org-scoped** — broslaz publish never notifies the CRC roster.
4. **CRC is byte-identical** under all broslaz-only changes.
5. **Test data (`isTest`) never appears** on consumer surfaces or in publish audiences.
6. **Anon never sees write controls**, even where APIs would reject the write.

## Stress-test emphasis notes

- **Monitor mix (D6) is declared highly untested** — used sparingly and only by
  Daniel. Treat the whole bus-assignment → own-mix-adjust flow as a primary
  test target, including: unassigned musician sees no faders; assigned musician
  can move only their own bus; assignments clear correctly.
- **QR login** is an auth surface; test expiry, reuse, and role fidelity.
- **D4 library gating** (musician+ only) may not match current code (recon found
  unscoped reads were only recently fixed) — verify the *role* gate exists at
  all, not just org scoping.

## Change log

- v0.3 (2026-06-10, post-stress-runs): D-Q1 schedule clarified (public schedule = `/perform` list; `/schedule` = authed assignments — closes browser-run Policy Q1, no bug). D-Q2: anon transpose/AI-scan = OPEN (BUG-4 becomes an anon-path fix with rate-limits, not a UX gate). D4-rev1: library relaxed to member-✅ (BUG-8 closes as policy change, no code). D7 (admin diagnostics global) and D8 (publish/notify redesign) added earlier today.
- v0.2 (2026-06-10): D1–D6 ratified by Daniel. D2 read-side encoded as implied-yes pending veto. Library gated musician+; schedule public; QR = device-handoff auth; monitor = own-bus-if-assigned.
- v0.1 (2026-06-10): Initial draft.
