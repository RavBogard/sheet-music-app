---
phase: 18-musescore-file-import-and-musicxml-conversion
plan: 01
subsystem: musescore-converter
tags: [musescore, musicxml, xslt, conversion, tdd]
dependency_graph:
  requires: [jszip, saxon-js]
  provides: [extractMscx, convertMscxToMusicXml, processMuseScoreFile]
  affects: [upload-pipeline, osmd-rendering]
tech_stack:
  added: [saxon-js, xslt3]
  patterns: [xslt-transform, zip-extraction, tdd]
key_files:
  created:
    - src/lib/musescore-converter.ts
    - src/lib/xslt/mscx-to-musicxml.xsl
    - src/lib/xslt/mscx-to-musicxml.sef.json
    - src/lib/__tests__/musescore-converter.test.ts
    - src/lib/__tests__/fixtures/sample.mscx
    - src/lib/__tests__/fixtures/sample.mscz
  modified:
    - package.json
    - package-lock.json
decisions:
  - Used SaxonJS with pre-compiled SEF for XSLT transformation (faster than raw XSL at runtime)
  - XSLT uses TPC (tonal pitch class) for accurate note step/alter mapping with MIDI pitch fallback
  - Divisions set to 1 (quarter note = 1 division) for simplicity
metrics:
  duration: 208s
  completed: "2026-03-18T22:32:57Z"
  tasks_completed: 2
  tasks_total: 2
  tests_added: 8
  tests_passing: 8
---

# Phase 18 Plan 01: Core MuseScore Converter Module Summary

MSCX-to-MusicXML conversion via XSLT 3.0/SaxonJS with JSZip extraction for .mscz archives, 8 unit tests passing.

## What Was Built

A complete MuseScore file conversion module (`src/lib/musescore-converter.ts`) that:

1. **extractMscx()** - Extracts .mscx XML content from .mscz ZIP archives using JSZip. Searches all ZIP entries for files ending in `.mscx` (handles both root-level and nested files).

2. **convertMscxToMusicXml()** - Transforms MuseScore's proprietary MSCX XML into standard MusicXML (score-partwise 4.0) using an XSLT 3.0 stylesheet via SaxonJS. Tries pre-compiled SEF first, falls back to raw XSL.

3. **processMuseScoreFile()** - High-level orchestrator accepting either .mscz or .mscx files. Returns both converted MusicXML and original buffer for dual storage.

### XSLT Stylesheet Coverage

The XSLT stylesheet (`src/lib/xslt/mscx-to-musicxml.xsl`) handles:
- Staff elements to part elements mapping
- Part/Instrument definitions to part-list
- Measure elements with numbering
- KeySig to key (fifths + mode)
- TimeSig to time (beats + beat-type)
- Chord/Note to note with pitch (step/alter/octave via TPC or MIDI fallback)
- Rest to rest note with duration
- Harmony chord symbols to harmony (root + kind)
- Duration types: whole, half, quarter, eighth, 16th

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | 0001258 | chore(18-01): install saxon-js/xslt3 and create XSLT stylesheet + test fixtures |
| 2 | f9e3352 | test(18-01): add failing tests for musescore-converter module |
| 3 | 3f9bb26 | feat(18-01): implement musescore-converter module |

## Test Results

All 8 tests passing:
- extractMscx: extracts .mscx XML string from .mscz ZIP buffer
- extractMscx: throws Error when ZIP contains no .mscx file
- convertMscxToMusicXml: returns string containing `<score-partwise`
- convertMscxToMusicXml: output contains `<part-list>` and `<part id=`
- convertMscxToMusicXml: output contains `<measure number=`
- processMuseScoreFile: with mscz extension extracts and converts end-to-end
- processMuseScoreFile: with mscx extension converts directly
- processMuseScoreFile: returns originalContent as the input buffer

## Deviations from Plan

None - plan executed exactly as written.

## Decisions Made

1. **Pre-compiled SEF preferred over raw XSL**: The xslt3 CLI successfully compiled the XSLT to SEF format. The converter tries SEF first for faster runtime performance, with raw XSL as fallback.

2. **TPC-based pitch mapping**: Used MuseScore's TPC (tonal pitch class) values for accurate step/alter resolution rather than relying solely on MIDI pitch numbers, which lose enharmonic information.

3. **Quarter note = 1 division**: Set MusicXML divisions to 1 for simplicity. This works correctly for the core use case (synagogue band charts with standard note values).

## Self-Check: PASSED

All 6 created files verified present. All 3 commits verified in git log.
