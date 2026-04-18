# R2 Audit: Client-Side UX Edge Cases

## Summary: 24 UX issues found across modal state, async abort, races, and stale closures

**Critical Issues (must fix before release):**
- UX-001: EditDetails modal state not re-seeded on consecutive opens
- UX-002: NamePrompt modal doesn't reset between uses
- UX-005: PDFOverlay file URL resolution fires setState after unmount
- UX-008: UploadDialog doesn't abort in-flight upload on unmount
- UX-011: UserRow role change confirmation state stuck
- UX-014: SwapPicker escape handling may not work reliably
- UX-018: CollapsibleSection doesn't persist open state across navigation

**High-Priority (visible bugs):**
- UX-003: Stale closure in TempoFlash onDismiss
- UX-004: PDF prefetch race condition on rapid tab switches
- UX-006: PDFViewer fetch timeout doesn't abort cleanly
- UX-007: PDFViewer retry lacks max attempt limit

**Medium-Priority (usability issues):**
- UX-009: UploadDialog setTimeout fires after unmount
- UX-010: LibrarySyncCard doesn't abort fetch on unmount
- UX-012: TrackSheet doesn't debounce form input
- UX-013: TrackSheet native key fetch doesn't abort on unmount
- UX-015: SwapPicker doesn't reset selection when reopened
- UX-016: EditDetails Enter-key doesn't work with popover calendars
- UX-017: SongChartsLibrary search debounce can fire with empty query
- UX-019: VerticalFaderStrip pending state timeout races with server
- UX-020: ChatPanel doesn't abort SSE streaming on close
- UX-021: MobileTabBar search doesn't cancel on navigation
- UX-022: TempoFlash Space key handling inconsistent
- UX-023: PDFOverlay Escape handler closure stale
- UX-024: SoundSystemSection doesn't abort bridge scan

## Pattern Analysis
- Async without AbortController: 11 instances (most critical)
- Stale closures: 3 instances
- Race conditions: 2 instances
- Modal/state management: 4 instances
- Missing debounce: 2 instances

See full details in inline comments within each component source file.
