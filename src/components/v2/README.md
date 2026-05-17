# v2 primitives

Foundation layer for the v2 UI redesign — the **Pro Performance Aesthetic**
(Geist + glass + indigo + amber, Logic-Pro track-list density).

> **Foundation only.** No production routes have been migrated. Each future
> phase migrates one v1 route onto these primitives behind `/v2/<route>`.

## When to reach for v2 vs. v1

| You're building... | Reach for |
|---|---|
| A new page inside `src/app/(v2)/v2/**` | v2 primitives (this folder) |
| Anything inside `src/app/(main)/**` (the classic UI) | `src/components/ui/**` (shadcn) |
| A primitive that genuinely doesn't exist yet | Extend an existing shadcn/ui component first; only add a new v2 primitive when the v1 component can't carry the v2 aesthetic without forking |

v2 is **additive**, not a fork. We reuse shadcn/ui where we can (see
`V2Button` — a 12-line wrapper around the v1 `Button`).

## Tokens

All v2 tokens live in `src/app/globals.css` under the `[data-theme="v2"]`
selector — they activate only inside the v2 layout's wrapper. v1 routes
are untouched.

```css
[data-theme="v2"] {
  /* Geist sans replaces Poppins for font-sans inside v2 */
  --font-sans: var(--font-geist-sans), system-ui, sans-serif;

  /* Amber accent — semantic tokens. For ramp values use Tailwind v4's
     built-in amber-50 → amber-950 utilities. */
  --v2-accent: oklch(0.769 0.188 70.08);          /* amber-500-ish */
  --v2-accent-strong: oklch(0.70 0.20 60);        /* amber-600-ish */
  --v2-accent-foreground: oklch(0.22 0.06 60);
  --v2-accent-soft: oklch(0.769 0.188 70.08 / 0.15);

  /* Logic-Pro density */
  --v2-row-h: 32px;
  --v2-row-px: 12px;
  --v2-row-text: 13px;

  /* Glass v2 — deeper, more saturated than v1 `glass`. */
  --v2-glass-bg: oklch(0.18 0.04 270 / 0.45);
  --v2-glass-shadow: 0 12px 40px rgba(15, 15, 35, 0.45);
  --v2-glass-saturate: 140%;
}
```

## Utilities

| Class | What it does |
|---|---|
| `glass-v2` | `var(--v2-glass-*)` surface: 24px backdrop-blur + saturate(140%) + 1px hairline border + deep shadow + radius. |
| `dense-row` | 32px row with 12px x-padding, 13px text, 1.15 line-height, hairline bottom border. |
| `dense-row-interactive` | Adds `cursor-pointer` + 150ms color transition. Pair with `hover:` / `focus-visible:` modifiers. |
| `dense-list` | Flex column + `tabular-nums` so numeric columns line up. |
| `text-v2-accent` | `color: var(--v2-accent)`. |
| `bg-v2-accent` | `background: var(--v2-accent)` + accent-foreground text. |
| `ring-v2-accent` | Sets the Tailwind ring color to the v2 accent ring tint. |
| `v2-surface` | Page-background fill (slightly deeper than v1 `bg-background`). |

For the full amber ramp use Tailwind v4's built-in classes: `bg-amber-500`,
`text-amber-400`, `border-amber-500/40`, etc.

## Components

### `<GlassSurface>` — base glass primitive
```tsx
import { GlassSurface } from "@/components/v2/glass-surface"
<GlassSurface as="section" className="p-6">…</GlassSurface>
```
Forwards refs. `as` accepts any HTML container element.

### `<GlassCard>` — GlassSurface + default `p-5`
```tsx
import { GlassCard } from "@/components/v2"
<GlassCard>
  <h2>Welcome back</h2>
</GlassCard>

// Wrap a DenseList edge-to-edge:
<GlassCard className="p-0 overflow-hidden">
  <DenseList>…</DenseList>
</GlassCard>
```

### `<DenseList>` + `<DenseRow>` — Logic-Pro track-list density
Per [[feedback_no_cover_art]], this is the load-bearing primitive for
**every** list surface in v2. Never album/cover art.

```tsx
import { DenseList, DenseRow } from "@/components/v2"

<DenseList aria-label="Recent setlists">
  {setlists.map((s) => (
    <DenseRow
      key={s.id}
      interactive
      active={s.id === currentId}
      onClick={() => openSetlist(s.id)}
    >
      <span className="w-12 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
        {s.date}
      </span>
      <span className="flex-1 truncate font-medium">{s.title}</span>
      <span className="w-12 text-right font-mono text-xs tabular-nums text-muted-foreground">
        {s.trackCount}
      </span>
    </DenseRow>
  ))}
</DenseList>
```

Conventions for rows:
- **Icon | title | meta | trailing** — left to right flex children.
- Use `font-mono tabular-nums` on any numeric column so columns line up across rows (catalog numbers, durations, counts, dates).
- Wide-only columns (e.g., service kind) use `hidden md:inline` rather than truncation.
- `interactive` rows auto-become `role="button"` + tabindex=0 + Enter/Space activation.

### `<V2Button>` — accent-aware shadcn Button
```tsx
<V2Button accent>Save</V2Button>           // amber fill
<V2Button variant="outline">Cancel</V2Button>  // v1 outline, unchanged
```
12-line wrapper. Add the `accent` prop to swap the brand fill for amber.

### `<V2BetaOptInLink>` / `<V2BetaOptOutLink>` — opt-in beta toggle
```tsx
// In the v1 footer:
import { V2BetaOptInLink } from "@/components/v2/v2-beta-toggle"
<V2BetaOptInLink />

// In a v2 surface:
import { V2BetaOptOutLink } from "@/components/v2/v2-beta-toggle"
<V2BetaOptOutLink />
```

Cookie name: `v2_beta_optin` (exported as `V2_BETA_OPTIN_COOKIE`).
**Read** the cookie server-side via `next/headers`'s `cookies()` — we
**never** rewrite v1 URLs through middleware. `/setlists` stays v1;
`/v2/setlists` will be v2 when migrated. The toggle is navigation only.

### `<V2Footer>` — v2 footer with reverse toggle
Mirrors the v1 footer's information density (changelog, build version)
but adopts v2 typography and surfaces the "Back to classic" link.

## Route group

- `src/app/(v2)/layout.tsx` — Geist font, `data-theme="v2"` wrapper,
  radial-gradient stage backdrop. No nav chrome yet (future migrations
  will introduce a v2 nav).
- `src/app/(v2)/v2/page.tsx` — stub landing at `/v2`. Demonstrates a
  `GlassCard` + a `DenseList` so the aesthetic reads end-to-end.

## Adding a new primitive (checklist)

1. Can you extend a shadcn/ui component? If yes, **do that** (12-line
   wrapper like `V2Button`).
2. Does it need a new token? Add to `[data-theme="v2"]` in `globals.css`.
3. Does it need a new utility class? Add `@utility …` next to existing
   v2 utilities at the bottom of `globals.css`.
4. Export from `src/components/v2/index.ts`.
5. Document above with a code example.
6. Add a primitives test in `__tests__/primitives.test.tsx`.

## Hard rules

- **No cover art.** Ever. Per [[feedback_no_cover_art]].
- **Dark-first.** Token defaults assume `.dark`. The
  `:root:not(.dark) [data-theme="v2"]` block carries graceful light-mode
  values; verify both modes when adding new tokens.
- **Don't fork shadcn.** Extend, don't replace.
- **Don't introduce route rewrites.** v2 coexists with v1 at distinct
  URLs. The opt-in cookie is for forward navigation and (later) server-
  rendered nav-link substitution — never for `middleware`-level rewriting
  of `/setlists` → `/v2/setlists`.
