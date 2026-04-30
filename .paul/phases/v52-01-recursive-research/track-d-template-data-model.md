# Track D - Template Data Model (Issue 6)

## Executive Summary

Recommendation: Option C (Admin-curated pointer doc) with phased scope.

Option C minimizes data duplication and migration risk. A single system/templates doc holds pointers (setlistId values) for each service type. When Daniel saves a setlist as canonical, the pointer updates atomically. Cloning flows check pointer first; if missing, gracefully fall back to findLastMatchingService. Templates are a curated layer on setlist history, not a new entity. Firestore rules grant admin-only write (aligns with config/admins pattern). UX entry point: kebab "Save as default for {service-type}". Phased scope: Shabbat morning + Erev Shabbat first (Daniel's 90% workflow).

---

## Current State

### ServiceType Union (11 values)
friday_night, shabbat_morning, rosh_hashanah, yom_kippur, sukkot, simchat_torah, hanukkah_shabbat, purim, passover, shavuot, regular

### templateType Field (6 values)
shabbat_morning, friday_night, rosh_hashanah, yom_kippur, festival, other

Festival is legacy bucket spanning 4 holiday types.

### How findLastMatchingService Works
- Query 20 most-recent setlists
- Match by templateType or inferred from eventDate
- Return first match or null

### Sticky-Memory Contract (v50-04)
seedTrackFromSong reads fresh at READ time, not write time. Templates must NOT ossify.

### Current Data Footprint
- 24 hydrated setlists
- 5 unhydrated setlists
- 650 embedded tracks total
- 0 top-level tracks/* pre-migration
- 0 templates/* for pointers

---

## Architecture Options

### Option A: Explicit templates/{serviceType} collection
- Pros: clean first-class artifact, single-doc read
- Cons: data duplication, sticky-memory risk (tracks static)
- Sticky-Memory: HIGH RISK

### Option B: Per-setlist is_default_template_for flag
- Pros: zero duplication, additive, sticky-memory compatible
- Cons: uniqueness requires transactions, conceptual muddle, deletion hazard
- Sticky-Memory: HIGH COMPATIBILITY

### Option C: Admin-curated pointer doc (system/templates)
- Pros: minimal duplication, atomic writes, backwards-compatible, sticky-memory compatible, graceful fallback
- Cons: referential integrity (dangling pointer), pointer opaque
- Sticky-Memory: HIGH COMPATIBILITY

### Option D: Status quo + favorite/rank
- Cons: doesn't solve the problem

---

## Recommendation: Option C

Why:
1. Minimal duplication (string pointer)
2. Atomic writes
3. Sticky-memory compatible
4. Backwards-compatible
5. Graceful degradation
6. Minimal migration (one doc; zero setlist changes)

Permission: Admin-only write (match /system/templates allow write: if isAdmin();)
UX: Editor kebab "Save as default for {service-type}"
Scope: Phase 1 = Shabbat morning + Erev Shabbat

---

## Files That Would Need to Change

src/lib/setlist-firebase.ts | +20 LOC
src/app/api/setlist/[id]/save-as-default/route.ts | +25 LOC
firestore.rules | +5 LOC
EditorKebab.tsx | +30 LOC
EditorKebab.test.ts | +20 LOC
setlist-firebase.test.ts | +25 LOC
system/templates doc (Firestore) | create

Total: ~125 LOC
Migration: None required
Rollback: Delete API route + revert rules + code

---

## Open Questions

1. Permission: admin-only or band_leaders?
2. Phase 1: two types or all 11?
3. Dangling pointer: auto-clear or warn?
4. Festival backwards-compat needed?
5. UI feedback: toast/modal/inline?

---

## Sources

Files: setlist-firebase.ts, liturgical-calendar.ts, models.ts, songs/defaults.ts, use-creation-wizard.ts, firestore.rules, roles.ts, setlist-audit.ts
Docs: v51-03 wizard SUMMARY, v50-04 song-catalog SUMMARY, v50-07-03 migration SUMMARY
