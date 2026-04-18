---
wave: 1
files_modified:
  - "src/components/setlist/PrintModal.tsx"
autonomous: true
---
# Phase 13, Wave 1: Print Modal UX

**Phase:** 13 - Print Modal UX
**Status:** Approved for execution

## Goal
Implement a robust CSS/Tailwind flex boundary on `PrintModal.tsx` to ensure the modal header and actions footer remain sticky and visible within the viewport, forcing only the middle content area to scroll.

## Context Extract
The layout of the `PrintModal` breaks on smaller screens or dense setlists because the `.overflow-y-auto` middle container pushes the primary action buttons ("Print" / "Download") off the screen. 

## Implementation Details

```xml
<tasks>
  <task id="13-1" title="Constrain PrintModal height and flex boundaries">
    <description>
    Update `src/components/setlist/PrintModal.tsx`:
    1. Replace `max-h-[90vh]` with `max-h-[90dvh]` to account for mobile browser dynamic UI (URL bars).
    2. Add `min-h-0` to the scrollable middle container (`div.overflow-y-auto.flex-1`). In flexbox, a flex child has `min-height: auto` by default, which prevents it from shrinking smaller than its content. Forcing `min-h-0` is a Tailwind best practice for nested flex-scrolling.
    3. Ensure the footer acts as a rigid boundary by explicitly adding `shrink-0` to its outer wrapper.
    </description>
  </task>
</tasks>
```

## Validation
1. Verify `PrintModal.tsx` builds successfully.
2. The modal actions footer should remain anchored to the bottom.
