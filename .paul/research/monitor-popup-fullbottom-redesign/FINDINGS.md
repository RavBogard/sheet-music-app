# FINDINGS — monitor-popup-fullbottom-redesign

**Coder:** coder-5 · **Lane:** monitor-popup-fullbottom-redesign · **Base SHA:** `e091ea4f96` · **Date:** 2026-05-26

## Goal (Daniel verbatim, via supervisor dispatch)

> "Rather than taking up a chunk of the bottom third, i want the monitor popup from within a chart to take up the entire bottom third of the chart, so it can be a little more spaced out and easier to use."

## Phase 0 — Survey

### Mount surface

Surprise — the in-chart monitor popup does **not** mount from `PDFOverlay.tsx`. The popup is rendered by `PerformanceToolbar.tsx` (the bottom toolbar over every chart), specifically by the local helper `monitorPopover(id, compact, side)` at `src/components/performance/PerformanceToolbar.tsx:141-163`. It's a Radix `<Popover>` anchored to a "Monitor" button in the bottom toolbar; opening it pops a `<PopoverContent>` upward with `<QuickMonitorPanel/>` inside.

PDFOverlay is the chart viewer parent but it does NOT mount this popup directly — the toolbar that owns it is a sibling layer that overlays the chart.

### Current footprint

`PerformanceToolbar.tsx:152` — `<PopoverContent className="w-auto p-0 bg-popover border-border space-y-3" align={side === "left" ? "start" : "center"} side={side}>` — width is `w-auto` (sized to content); height is content-driven.

`QuickMonitorPanel.tsx:148-227` — the inner panel:
- `<div className="w-full">` outer
- Header row at top (`px-4 pt-3 pb-2`) with bus name + Live/Stale/No-mixer cue
- `<ScrollFade snap scrollClassName="flex flex-row gap-3 p-3 min-h-[280px]">` for the faders
- `<VerticalFaderStrip isMaster onMuteToggle={noop}/>` (master, leftmost; coder-1's master-mute-fix lane will swap `noop` → real handler — DO NOT TOUCH per dispatch)
- `<div className="w-px bg-brand/20 mx-1 self-stretch"/>` divider after master
- `visibleSends.map(...)` → `<VerticalFaderStrip/>` per channel send

Net effect on an iPad 820×1180 portrait: the popover renders as a content-sized box (typically ~440-680 px wide depending on # of sends) sitting just above the toolbar. Cramped, doesn't claim the full chart-bottom width, faders are tightly spaced (`gap-3` = 12 px). Master and channel-send faders sit nose-to-nose with a 1px divider.

### Touch-target audit (current)

- Fader track itself: `w-8 h-[200px]` = 32 × 200 px. Below the 44 × 44 floor, but per dispatch §Out of scope I can't change `<VerticalFaderStrip>` internals. Carry-forward.
- Mute button: `size="icon-sm"`. Existing surface; same scope rule.
- Master fader cue/labels: same.
→ All untouchable per scope. **What I CAN make 44 × 44:** the outer popover container's interactive surface (close affordance, scroll-edge padding); the new close button I'll add (44 × 44 minimum).

## Phase 1 — Design

### Container

Move `<PopoverContent>` to a full-width × bottom-third footprint via className:

- `w-screen max-w-[100vw]` — span the viewport width. Radix's collision math + `align="center"` will clamp it to `left:0` at the viewport edge (content is the full width so there's no shift to do).
- `h-[33vh] min-h-[280px] max-h-[420px]` — claim the bottom-third of the viewport (iPad 1180 × 0.33 ≈ 389 px), with a floor for short viewports and a cap for tall desktops.
- `p-0` preserved (panel manages its own padding).
- `rounded-t-2xl rounded-b-none border-t border-x` — visually anchored to the chart edge; corners only on top.
- `align="center" side="top" sideOffset={4} collisionPadding={0}` — popover stays anchored to the toolbar trigger but its content surface paints the full bottom-third.

This achieves "full bottom third" without re-architecting into a Sheet/Dialog (which would dim the chart underneath — Daniel didn't ask for that, and dimming the chart while mixing during service is the wrong UX).

### Internal layout (QuickMonitorPanel)

```
┌──────────────────────────────────────────────────────────────────┐  <- h-[33vh], full viewport width
│ ┌─────────────┐                                            ┌──┐  │  Header: bus name + Live/Stale + Close
│ │ My Monitor  │                              [● Live]      │ × │  │  44×44 close button (NEW)
│ │ Bus 5       │                                            └──┘  │  px-6 py-3
│ └─────────────┘                                                  │
├──────────────────────────────────────────────────────────────────┤  border-b divider
│  ┌────┐ │ ┌────┐  ┌────┐  ┌────┐  ┌────┐  ┌────┐  ┌────┐         │  Faders row:
│  │MAS-│ │ │ Ch │  │ Ch │  │ Ch │  │ Ch │  │ Ch │  │ Ch │   …     │  - flex-row gap-6 (was gap-3)
│  │TER │ │ │ 1  │  │ 2  │  │ 3  │  │ 4  │  │ 5  │  │ 6  │         │  - px-6 py-4 (was p-3)
│  │ ▌  │ │ │ ▌  │  │ ▌  │  │ ▌  │  │ ▌  │  │ ▌  │  │ ▌  │         │  - master + thicker divider
│  │ ◯  │ │ │ ◯  │  │ ◯  │  │ ◯  │  │ ◯  │  │ ◯  │  │ ◯  │         │  - flex-1 fills remaining height
│  └────┘ │ └────┘  └────┘  └────┘  └────┘  └────┘  └────┘         │  - ScrollFade scrolls horizontally
└──────────────────────────────────────────────────────────────────┘  if > ~10 channels @ 820px
```

Concrete changes inside `QuickMonitorPanel.tsx`:
1. Outer wrapper: `<div className="w-full h-full flex flex-col">` (was `<div className="w-full">`) → child layout claims full container height.
2. Header row: `px-6 py-3 border-b border-border/40 flex items-center justify-between shrink-0` (was `px-4 pt-3 pb-2`) → more padding, divider separates header from faders.
3. Add **NEW close button** (right side of header) — uses Radix `PopoverPrimitive.Close` via the existing Popover wrapper (44 × 44 min, `cursor-pointer`, `Heroicons X`-style SVG via `lucide-react X` already imported in the toolbar). The button's role: explicit close affordance on iPad where outside-click sometimes misfires. Implement by exposing a new prop `onClose?: () => void` from QuickMonitorPanel; toolbar passes its Popover close handler.
4. ScrollFade row: `flex flex-row gap-6 px-6 py-4` (was `gap-3 p-3 min-h-[280px]`) + `flex-1` for the wrapping container so faders fill the remaining height under the header.
5. Master/channel divider: `w-px bg-border/60 mx-2 self-stretch` (was `bg-brand/20 mx-1`) — slightly stronger visual break, more breathing room.

### Empty/error states (graceful)

The existing `bridgeMessage` / `connecting` / `disconnected` / `no bus assigned` early-returns currently use `py-6` padding. Update those to fill the full bottom-third too: `flex h-full items-center justify-center` so the popup doesn't snap to a tiny height when offline (consistency).

### Accessibility checklist

- [x] No emojis as icons — `lucide-react` SVG glyphs only (X for close; existing Wifi/WifiOff/Server/Clock/Loader2).
- [x] `cursor-pointer` on close button.
- [x] Transitions: existing Radix popover slide-in/zoom-in animations (150-300ms range, transform+opacity only). No `width`/`height` animations introduced.
- [x] Focus states: close button uses `focus-visible:ring-2 focus-visible:ring-brand/50` (matches existing focus pattern in VerticalFaderStrip).
- [x] Dark-mode contrast: header text uses existing `text-foreground` / `text-muted-foreground` tokens (already AA-compliant).
- [x] `prefers-reduced-motion`: Radix popover content already respects this via `motion-reduce:transition-none` (provided by shadcn animation classes).
- [x] Responsive: works at 375 (mobile), 768 (sm tablet), 820 (band-iPad portrait), 1180 (band-iPad landscape), 1440 (desktop). ScrollFade handles overflow when > ~10 channels.
- [x] Touch targets: NEW close button is `min-h-[44px] min-w-[44px]` per dispatch. Existing internal fader controls are pre-existing surface (out-of-scope).

### Design tokens used

- `bg-popover` (existing CSS var) — container bg
- `border-border/40` — soft divider under header
- `text-foreground` / `text-muted-foreground` — typography colors
- `text-yellow-500` (stale), `text-green-500` (live), `text-red-400` etc. — existing status palette
- `bg-brand` / `bg-brand/10` — master accent (unchanged from current panel)

No new Tailwind classes outside the project's existing palette. No CSS files created.

## Out-of-scope reaffirm

- ⛔ `<VerticalFaderStrip>` / `<FaderStrip>` LOGIC and INTERNAL LAYOUT — pass-through only.
- ⛔ `monitor-store.ts` / `firestore-monitor-client.ts` / `bridge/`.
- ⛔ Master `onMuteToggle={noop}` line — coder-1's lane.
- ⛔ Mute/unmute SEMANTICS anywhere.
- ⛔ `[[project_smart_transposer_is_key_transcriber]]`.

## Coordination contract w/ coder-1 (`monitor-master-mute-fix`)

Same file, scope-disjoint. My edits avoid:
- `handleBusMaster` / `handleSendLevel` / `handleSendOn` callbacks (line 72-88)
- The master `<VerticalFaderStrip ... isMaster onMuteToggle={noop} />` JSX (line 185-194) — only its outer wrapper className changes
- The channel `<VerticalFaderStrip>` map body (line 207-222) — only its outer wrapper className changes

HEADS-UP already posted to `inbox/coder-1.md` (msg-from-coder-5-heads-up-quickmonitorpanel).

## Phase 2 — Tests

`src/components/monitor/__tests__/QuickMonitorPanel.test.tsx` (NEW):
1. Layout shape: panel outer is `w-full h-full flex flex-col`; header uses `px-6 py-3 border-b shrink-0`; fader row container is `flex-1` with `gap-6 px-6 py-4`.
2. Close button: present in header, `min-h-[44px] min-w-[44px]`, has accessible name "Close monitor mix", calls `onClose` when clicked.
3. Master + N channel strips render: master first (via mocked `<VerticalFaderStrip>`), then `visibleSends.length` more, separator between.
4. Graceful states fill height: bridgeMessage / connecting / disconnected / no-bus all use `flex h-full items-center justify-center`.

`src/components/performance/__tests__/performance-toolbar.test.tsx` (EXISTING) — re-run; should remain byte-stable since the popover's `<QuickMonitorPanel/>` is already mocked. Verify.

## Phase 3 + 4 — Validation + Ship

Gates: scoped vitest GREEN; full vitest delta-only; `tsc --noEmit` exit 0; `rm -rf .next && SKIP_ENV_VALIDATION=1 npm run build` GREEN per `[[feedback_bundle_size_stale_next_artifact]]`. SHIP-NOTICE primary `inbox/auditor.md` (with literal `## Repros`) + CC `inbox/supervisor.md`.
