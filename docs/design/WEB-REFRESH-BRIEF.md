# Surface brief: web app refresh (everything around the charts)

Scope:
- Shell (top bar, iPad bottom tab bar, footer), login and dashboard.
- Setlists list and setlist editor.
- Perform index and Perform setlist page. The chart viewer itself is OUT of scope.
- Library, Manage and Settings.

Mode: Operate.

Audience:
- Band musicians on 11" iPads, in a bright rehearsal room.
- Daniel and David reviewing and making small edits at a desk.
- Brothers Lazaroff (second tenant, gigs).

Daniel's verdicts (2026-10-31):
- Chosen: blend E, which is A's Siddur Section Rails world with no permanent sidebar.
- From B: the slim top bar with tabs.
- From D: clean white surfaces, one blue primary button, and a familiar list for setlists.
- Feels wrong: a cold dev-tool look, losing density, churchy or ornamental styling.
- Light: bright rooms and desks, so light-first. Dark stays supported.

## Direction contract
THESIS: The service reads like the siddur it follows. Sections are full-hue bands with a running
head, and every row carries its page call in large numerals. Freshness and readiness are always
stated. It refuses the category default of a white card per row in a generic SaaS list.

OWN-WORLD:
- Shell: a book-cloth blue (#23356B) top bar with tabs.
- Grounds: white and #F6F7FB, with ink #18202E.
- Section hues at full strength: green #1F7A6E, oxblood #8E2E3B, ochre #C58B1A and blue
  #23356B. They are assigned by header order, or by known section name.
- One blue primary action, #2563EB.
- A 1px hairline row grid.
- Type: Assistant, a humanist sans with Hebrew. Tabular numerals.
- Hierarchy comes from scale contrast: page calls and the setlist title are large, metadata is small.

STORY: A musician or leader opens a setlist and knows within a second that it is current and ready
("Updated Fri 4:12pm · 24/24 charts ready"). They see the order by section and the page for each
row, and can open Perform from it in one tap.

FIRST VIEWPORT (setlist editor and Perform setlist page):
- The top bar holds the brand on the left and the Setlists / Library / Manage tabs. On an iPad
  portrait screen the tabs move to a bottom tab bar.
- A head row follows: the title (about 1.6rem, 800 weight) with the status line under it, and the
  blue Perform (or Edit) button on the right.
- Then the table.
- Each section header row is a full-hue band. It is uppercase and tracked, with the running head
  on the left and the "pp. N–M" range on the right.
- Each song row is a grid: number, title with a small chart chip under it (setting · format ·
  library no.), a key tag, then the page call right-aligned in large numerals.
- Warnings (differs from last, not cached) appear as an oxblood line on the chip.

FORM: grounded candidate 5 (Siddur Section Rails) on my ordered list, blended at Daniel's request
with candidate 1 (Songbook Index, from B: the top bar) and with the category standard (from D: the
clean list and blue primary). Seed key 43ae82ea.

SIGNATURE MOVE: section bands carrying running heads plus page calls in the margin.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the
verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Revision 2026-11-01 (Daniel): 'B. Everywhere. That's the look'
Daniel found blend E too bloated: the big colour section bands and the tall header/status lines got in the way of the info. The new rule is **Option B, 'E, much quieter'**, mock at docs/design/setlist-mock-B.html (artifact https://claude.ai/artifact/7qKpqt2sJ3v6EWUPM6k2ic):
- Sections: a thin 2px coloured underline with a small uppercase label and a muted 'pp. N–M' at the right. No filled bands.
- Page numbers: normal row size (about 0.85rem), bold, in book-blue, right column. No large numerals.
- Header: a compact block. Title (1rem/800) plus ONE meta line ('Sat Sep 26 · 14/14 saved'), with the primary button on the right. No separate status line, book line or tall area.
- Rows: dense, about 36–40px visual (44px hit areas kept by padding or the hit-area utility), a muted number, the title, a small outlined key tag, the page. Notes as a small second line.
- Applies EVERYWHERE: editor, Perform list, Setlists list, Library, Manage, Settings, dashboard, the BL gig line and set totals (as small text in the section label row).
