# Cycle-11 M2 — DESIGN NOTES

> Companion to `PROMPT.md`. ~1500 words. Why matrix-probe; how it grades the 4 moments and 3 bug-classes; one worked-example divergence end-to-end; honest weaknesses.

## §1 — Why a matrix?

The charter's central diagnosis (§0) is that **past sweeps treated the app as a thing to audit, not the musician as a user being shadowed.** That points at a *stance* problem, which M1 (narrative) attacks head-on. But Daniel also named **3 specific bug-CLASSES the past sweeps under-caught**: stickiness, fresh-tablet, auth-divergence. Those three are not stance problems — they are **dimensionality** problems.

A single-state probe ("Daniel signed in, hot cache, immediate read") cannot detect them by construction:

- **Stickiness** is a property over (write × reload). You can't see it without doing the reload.
- **Fresh-tablet divergence** is a property over (signed-in dev box vs cold tablet). You can't see it without the cold tablet.
- **Auth-divergence** is a property over (≥2 identities). You can't see it with one identity.

So the matrix methodology answers a structural question the other methodologies can't: **does the app's state model survive the dimensions Daniel called out?** It's worth taking M2 over M1 if Daniel believes the 3 bug-classes are the biggest under-caught failure mode of the band's actual use. (M1 is worth taking over M2 if he believes the bigger miss is "we never thought about what it feels like to use this mid-service" — which is also true.)

The bet is: the matrix will produce a small number of **high-leverage structural findings** ("transpose is client-only state — never sticks across reload anywhere"; "the public landing's auth gate masks a render race in incognito") rather than a long tail of qualitative friction notes. Different shape, different value.

## §2 — How the matrix grades the 4 moments

Each cell tags ≥1 anchor moment via the `[A1/A2/A3/A4]` shorthand. Coverage per moment in the core ~70-cell set:

- **A1 (setup-prep):** lit by every A.5-A.8 cell on B.1/B.3/B.4. Specifically, B.3 editor writes that need to surface on B.1 musician view via D.3 cold reload, D.5 cross-identity, D.7 cron-tick. The class "leader edits Saturday morning, musician opens iPad Saturday morning, sees stale data" lives here.
- **A2 (between-songs scramble):** lit by D.2 (hot reload) cells on A.1/A.4. The musician shouldn't lose state on a quick refresh.
- **A3 (mid-service key/song change):** lit by A.1/A.2/A.3 × D.5/D.6 cells. "Leader transposes, does the musician on iPad-B see it?"
- **A4 (sanctuary edge):** lit by the entire FT sub-matrix (Class FT) + Class AD's unauth cells.

Each finding cites moments. A cell-divergence that grades zero moments is not written up (AP-1 break).

## §3 — How the matrix grades the 3 bug-classes

Built into the axes:

- **Stickiness (S):** Axis D (persistence) is the stickiness axis. ≥6 modes per action means ≥6 chances to detect non-persistence.
- **Fresh-tablet (FT):** Axis C ∋ {C.7 fresh-incognito, C.8 fresh-tablet} is the fresh-tablet axis. The FT sub-matrix isolates this as its own table.
- **Auth-divergence (AD):** Axis C ∋ {C.2-C.6} is the auth axis. The AD sub-matrix is its own table.

A single cell can light up >1 class (e.g., a `swap_chart` mutation on a fresh-tablet member context probes all three). Those compound cells are explicitly enumerated in §4 of the PROMPT.

## §4 — Worked-example divergence (end-to-end in the new shape)

This is the kind of finding the matrix produces, fully expanded so Daniel can compare to what M1/M3 would produce.

> ### F-M2-007 — Transpose snaps back to bound key on cold reload
> - **Cell:** M.S.A1.D3
> - **Class:** Stickiness regression
> - **Moments:** A2 (between-songs scramble), A3 (mid-service key change)
> - **Surface:** /perform/setlist/<fixtureId>
> - **Identity:** musician C.3 (fresh `mintSession({firebaseAuth})`, uidPrefix `c11m2`)
> - **Action:** transpose +1 semitone via PerformanceToolbar TransposerMenu
> - **Persistence:** D.3 cold reload (`context.close()` + new context from same `storageState`)
> - **Expected (user terms):** "I change the key to D for *Adon Olam*. I close Safari. I reopen Safari. The chart is still in D."
> - **Observed (user terms):** "I change the key to D. I close Safari. I reopen Safari. The chart is back in E (the bound-track key)."
> - **Repro:**
>   ```js
>   const ctx = await browser.newContext({ ...devices['iPad Pro 11'], viewport:{width:820,height:1180} });
>   await mintSession({ baseUrl, bearer:musicianBearer, uid:musicianUid, firebaseAuth: getAuth() }); // seeds ctx
>   const page = await ctx.newPage();
>   await page.goto(`${baseUrl}/perform/setlist/${fixtureSetlistId}`);
>   await page.getByRole('button', { name: /transpose/i }).click();
>   await page.getByRole('button', { name: /\+1 semitone/i }).click();
>   await expect(page.locator('[data-testid="current-key"]')).toHaveText('D'); // pass — D.1 r-a-w
>   const storageState = await ctx.storageState();
>   await ctx.close();
>   const ctx2 = await browser.newContext({ ...devices['iPad Pro 11'], viewport:{...}, storageState });
>   const page2 = await ctx2.newPage();
>   await page2.goto(`${baseUrl}/perform/setlist/${fixtureSetlistId}`);
>   await expect(page2.locator('[data-testid="current-key"]')).toHaveText('D'); // FAILS — reads "E"
>   ```
> - **Severity:** HIGH — actively breaks the A3 mid-service key-change scenario the band relies on.
> - **Hypothesis:** the transpose offset is held in `useMusicStore` (zustand, in-memory only) and never persisted to Firestore at the track-doc level. The bound song's catalog key is rehydrated on every fresh mount. Confirm by reading `src/lib/music-store/*` and checking if there's a Firestore listener that writes the transpose offset back.
> - **Ship-class:** HOLD-POST-SERVICE — touches Perform render state + Firestore schema (a new `userTransposeOverride` field per (user, track) or similar).
> - **Artifacts:**
>   - `artifacts/M.S.A1.D3-before.png` (chart in D, post-transpose, pre-reload)
>   - `artifacts/M.S.A1.D3-after.png` (chart in E, post-cold-reload)
>   - `artifacts/M.S.A1.D3-storage-state.json` (the storageState dump showing no transpose-offset persistence)

That finding alone has higher leverage than 20 tap-target-size findings, because it points at a structural class — and the matrix likely surfaces siblings (annotate, zoom, metronome — all the same client-only state). The WHAT-WE-LEARNED section names this class once instead of repeating the finding per affordance.

## §5 — Report shape: matrix-as-headline, JSONL-as-companion

The matrix is the lead artifact. It's a single table where Daniel can see at a glance:

- Which moments have the most divergence (a column tag count).
- Which bug classes are structurally present (any `✗` in a Class S column means stickiness is broken somewhere).
- Which identities surface the worst behavior (any whole row of `✗` for a fresh-tablet column means the app has a cache-warmup-only failure mode).

JSONL is preserved as a secondary artifact so future automation (or auditor) can grep it. But the human-reading flow is **table → divergence expansions → WHAT-WE-LEARNED**, not "scroll through 70 findings."

That ordering is the AP-3 break: past cycles emitted `findings.jsonl` as the primary, and Daniel said the lived information got lost. Matrix-first emits the **shape of the divergence space** first, the cell details second.

## §6 — Harness coupling

M2 is the most harness-coupled of the 3 lanes (per charter §8: "M2 probably uses [the harness] heavily for the reload/fresh-tablet probes"). Concretely:

- **`mintSession({firebaseAuth})`** is the core identity primitive. Without it, every authed cell lies (client listeners cold).
- **`ipad-webkit` project** is the C.8 fresh-tablet primitive. Without it, the fresh-tablet probes degrade to "fresh Chrome desktop" — not the right shape.
- **`npm run stress --surface=mcp`** + `cycle-4/harness/probes/*.mjs` is the existing pattern for the MCP-side cells in §4.3. M2's probes go in the same directory as `cycle-11-m2-stickiness.mjs`, `cycle-11-m2-fresh-tablet.mjs`, `cycle-11-m2-auth-divergence.mjs`. (Those probe files are NOT in scope for the prompt-design phase; they get written by a future implementation lane after Daniel picks M2.)
- **`storageState` + `serviceWorkers:'block'`** are Playwright primitives the harness doesn't wrap yet — M2's probes use them inline.

A version of M2 that doesn't use the harness is possible but lower-fidelity: fresh-tablet on real desktop Chrome doesn't reproduce the iPad WebKit Safari layer where some fresh-install bugs actually live. M2 commits to the harness as the deterministic vehicle.

## §7 — Honest weaknesses

What M2 will likely MISS that M1/M3 will catch:

1. **Lived qualitative friction.** A button is 28px and the musician keeps mis-tapping it during a song — M2 has no cell for "did the musician feel slow." That's M3's home, and M1 will narrate it. M2's verdicts are binary (pass / divergence / partial) and that loses the "almost passed but you'd hate it" middle.
2. **Sanctuary conditions per se.** Glare, sweat, low battery, tilted stand — M2 can't simulate these. M3 can grade affordance under those (heuristically). M2 only grades state-model fidelity.
3. **Scenario surprise.** "The rabbi changes the order 30 sec before the song" — that's narrative shape (M1). M2 has an A.3 cell for "reorder by leader" but doesn't capture the *time pressure* element.
4. **Confusing copy / unclear affordances** at the level of "the transpose-control state is hard to interpret mid-song." M2 detects whether the state is right; it doesn't detect whether the user can interpret the right state quickly. (M3 grades that.)
5. **Compound multi-moment failures.** The matrix grades cells; cells are tagged with moments but the matrix doesn't natively grade "this 3-cell sequence breaks the A2 moment." M1's narrative makes that compound visible.
6. **Cells beyond the core.** The full Cartesian is 3840; the core is ~70. A divergence in a cell we didn't run is invisible to the report. The selection heuristic in §4 of the PROMPT prioritizes bug-class × moment coverage, but some genuine cell-divergences are excluded by selection.

What M2 catches uniquely (compared to M1/M3):
1. Anything that requires a reload to manifest (the entire stickiness class).
2. Anything that requires a no-cache state (the fresh-tablet class).
3. Anything where two identities see the same surface differently (auth-divergence + cross-identity stickiness).
4. **Structural** generalizations across actions — "all client-state actions don't persist" is a single finding from the matrix; M1 would report 5 instances and miss the generalization.

The honest call: **M2 is the right pick if the band's biggest pain is "I changed it, why doesn't it stay" / "it works on Daniel's iPad but not mine."** M1 is right if the biggest pain is "I'm lost in the flow." M3 is right if the biggest pain is "I can't read it under stage lights."

## §8 — On not synthesizing M1/M3

Per charter §8: M2 was authored without reading M1's or M3's PROMPTs. The matrix axes were derived from Daniel's bug-class names (in his own interview language) plus the moment list — no peeking at how M1 frames "between-songs" or how M3 grades "visibility-of-system-status." The comparison value lives in the three lanes landing as genuinely independent bets.

(Post-landing, M2's author may read sibling PROMPTs to inform a possible *hybrid* run, but the design itself stays disjoint.)

---

*from coder-3 (lane M2)*
