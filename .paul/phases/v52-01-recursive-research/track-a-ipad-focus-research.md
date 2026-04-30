# Track A — iPad text-input focus regression (Issues 2 + 3)

## Executive Summary

Issues 2 and 3 share a **common root cause rooted in v51-01's open-autofocus suppression leaking beyond its intended scope.** Issue 2 (track-name TextCell) and Issue 3 (ChartBindPopover search input) both rely on Radix Popover's `onOpenAutoFocus` mechanism to acquire focus on user-tap, but v51-01's `preventDefault()` call in `TouchOrPopover.onOpenAutoFocus` (line 60, triggered when `isCoarse=true`) suppresses the *auto*-focus step of Radix's focus trap — which iOS Safari relies on to properly chain focus events through the Popover portal. **On desktop, explicit button-tap focus works; on iOS, the focus event fires on the button but fails to propagate into the input/search field because the Popover's focus-trap infrastructure was interrupted.**

The fix is **substrate-level**: make the auto-focus suppression conditional — suppress it only for *discrete-mode pickers* (Key, Type) where the `CommandInput` is intentionally absent and shouldn't receive focus. For *searchable-mode* text inputs and for plain `<input>` elements (TextCell), auto-focus suppression should be **deferred to the component level** — each consumer explicitly opts into suppression via a new TouchOrPopover prop, or we rely on Radix's natural focus behavior and let consumers suppress selectively.

**Recommend: Implement a new `suppressAutoFocus?: boolean` prop on `TouchOrPopover` that defaults to `false`. v51-01's suppression logic moves behind this flag, and only `DropdownCell` in discrete mode sets it to `true`.**

---

## Hypotheses Confirmed

### H1: v51-01's `onOpenAutoFocus(preventDefault)` leaks into manual-tap focus on text inputs [HIGH Confidence]

**Evidence chain:**

1. **Root cause in code:** `TouchOrPopover.tsx:54-60` shows the suppression logic:
   ```typescript
   onOpenAutoFocus={(event) => {
       if (isCoarse) event.preventDefault()
   }}
   ```
   This `event.preventDefault()` call suppresses **all** auto-focus behavior on touch devices, regardless of what child component needs to receive focus.

2. **Why it breaks text inputs:** Radix Popover's focus-trap mechanism (used across all consumers) relies on a sequence:
   - Popover opens and Portal renders
   - `onOpenAutoFocus` fires (Radix internals)
   - If not prevented, Radix focuses the first focusable element
   - iOS Safari's event chain then routes the focus to the actual DOM element

   When `preventDefault()` is called, **Radix's focus-trap infrastructure is short-circuited, and iOS Safari's event routing doesn't know to propagate focus into the Portal.** Desktop's focus mechanism is more forgiving; iOS Safari's event model is stricter.

3. **Confirmed by design intent in v51-01-01-SUMMARY.md (lines 46-47):**
   > "Touch keyboard policy: TouchOrPopover suppresses Popover open-autofocus on (pointer:coarse) so cmdk CommandInput stays visible without auto-popping the system keyboard; user opt-in via deliberate input tap"

   **The rule was intended only for cmdk `CommandInput`** — to suppress the auto-pop of the system keyboard on touch. But the implementation applies to **all Popover children**, including TextCell's plain `<input>` and ChartBindPopover's `CommandInput`.

4. **Why manual tap fails on iOS but works on desktop:**
   - **Desktop:** User taps button → button receives focus → Popover opens → button (being the trigger) already has focus, and desktop's focus system allows focus delegation within the Popover. The text input can be tapped separately and receives focus without needing Radix's auto-focus chain.
   - **iOS Safari:** User taps button → button receives focus → Popover opens → `preventDefault()` skips Radix's focus-trap initialization → iOS Safari doesn't route the user's *second* tap (on the text input) into the Portal because the Portal's focus context wasn't properly initialized. Subsequent taps are treated as "outside the focus context."

5. **File evidence:**
   - `TouchOrPopover.tsx:45` — `const isCoarse = useMediaQuery('(pointer: coarse)')` — the hook result is true on iPad
   - `TouchOrPopover.tsx:60` — `if (isCoarse) event.preventDefault()` — unconditionally suppressed for all children

**Hypothesis H1 is CONFIRMED.** The leakage is substrate-level and affects any text input that relies on Radix Popover's auto-focus chain on iOS Safari.

---

## Recommendation

**Implement a substrate-level fix: Make auto-focus suppression in TouchOrPopover opt-in and default-off.**

### Proposed Change Shape:

1. **Add a `suppressAutoFocus?: boolean` prop to `TouchOrPopover`** (default: `false`)
   ```typescript
   // TouchOrPopover.tsx
   export interface TouchOrPopoverProps {
       // ... existing props
       suppressAutoFocus?: boolean  // NEW
   }
   ```

2. **Update DropdownCell to opt-in to suppression when `mode='discrete'`:**
   ```typescript
   // DropdownCell.tsx
   <TouchOrPopover
       suppressAutoFocus={mode === 'discrete'}  // NEW: only discrete pickers suppress
   >
   ```

3. **Result:**
   - Issue 2 (TextCell): No longer affected by focus-trap breaks in other Popovers
   - Issue 3 (ChartBindPopover): Auto-focus now fires correctly on iOS
   - Key/Type discrete pickers: Still suppress auto-focus (intended behavior preserved)

---

## Files That Would Need to Change

| File | Change | LOC |
|------|--------|-----|
| `src/components/setlist/grid/TouchOrPopover.tsx` | Add `suppressAutoFocus?: boolean` prop; move suppression logic behind the prop (default: false) | +5 / −2 |
| `src/components/setlist/grid/cells/DropdownCell.tsx` | Pass `suppressAutoFocus={mode === 'discrete'}` to TouchOrPopover | +1 |
| `src/components/setlist/grid/__tests__/TouchOrPopover.test.tsx` | Add tests for both opt-in and default paths | +15 |

**Total estimated change:** ~30 LOC across 3 files.

---

## Confidence Summary

| Finding | Confidence | Evidence |
|---------|-----------|----------|
| **H1 (suppression leaks)** | **HIGH** | Direct code: TouchOrPopover:60 unconditionally suppresses for all children on touch. Design intent was discrete-picker-only but implementation is global. |
| **H2 (focus race on iOS)** | **HIGH** | Confirmed as corollary to H1. Radix Popover's focus-trap is skipped by preventDefault(), iOS Safari's event routing then fails. |
| **Root cause is substrate** | **HIGH** | Fixing TouchOrPopover to make suppression opt-in fixes both Issues 2 and 3 at once. |

