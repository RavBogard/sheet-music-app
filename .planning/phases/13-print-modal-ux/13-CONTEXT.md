# Phase 13: Print Modal UX & Performance Access - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Resolve the 1) overflow/scrolling UI bug in the `PrintModal` separating the content body from the sticky action buttons, and 2) extend the Print capability so that it is accessible from the `PerformanceToolbar` natively without needing to open the editor view, gating the button to musicians and above.
</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
- **User Preference:** The user explicitly stated "i trust you on all of it" regarding the UI/UX decisions.
- **Modal Constrainment:** Claude will implement a robust `max-h` flexbox containment strategy to keep the header and footer sticky within the viewport bounds.
- **Button Stacking:** Claude will decide how to make the print buttons responsive on mobile devices (e.g., stacking them in the footer vs shrinking them).
- **Toolbar Placement:** Claude will integrate the Gig Packet button cleanly into the `PerformanceToolbar` near the Edit view button, respecting the existing tablet and desktop layout groupings.
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/setlist/PrintModal.tsx`: The primary modal component that needs the scrolling behavior decoupled from the `<body>`/window height.
- `src/components/performance/PerformanceToolbar.tsx`: Where we need to inject the `printButton()` trigger.

### Established Patterns
- **Role Verification:** `useAuth()` surfaces `isAdmin`, `isBandLeader` and `isMusician`. The Performance route itself is public, so the button explicitly needs a gate (e.g., `if (!isMusician) return null`).
- **Responsive Toolbar:** The toolbar uses standard `md:hidden`, `md:flex lg:hidden`, and `lg:flex` breakpoints, meaning our new button will need to handle the `compact=true` and `compact=false` states for label visibility.

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard, clean approaches as approved by Claude.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 13-print-modal-ux*
*Context gathered: 2026-03-13*