# Translating the catalogue into Hebrew

## Find what is missing

```sh
node scripts/i18n-he-missing.mjs              # table per namespace + any problems
node scripts/i18n-he-missing.mjs --list       # every missing key, its English, where it shows, maxLength
node scripts/i18n-he-missing.mjs --ns perform,nav --list
node scripts/i18n-he-missing.mjs --json > /tmp/todo.json   # work list (English + note per key)
```

The script mirrors `src/__tests__/i18n/catalogue.test.ts`: a key whose note says `"translate": false`
needs no Hebrew; a plural English key (`_one` / `_other`) is covered by any Hebrew variant of the same
base. It also prints `ORPHAN` (Hebrew key with no English key — the English was renamed or removed:
move or delete the Hebrew), `PLACEHOLDER` (the `{vars}` differ) and `LONG` (over the note's
`maxLength`; a warning). Exit code 1 when anything is missing or wrong.

The test is always on: `npx vitest run src/__tests__/i18n/catalogue.test.ts` fails with the list of
English keys that have no Hebrew. A new English key therefore needs its Hebrew in the same change, or a
delta pass right after.

## Where things go

- `src/i18n/he/<ns>.json` — same nesting and key names as `src/i18n/en/<ns>.json`; `$comment` keys
  omitted; `translate: false` keys omitted (English is used).
- `src/i18n/he/org.json` — the tenant vocabulary. Its English is `STRING_BASE` in
  `src/lib/org/strings-base.ts` (flat dotted keys such as `"print.footer"`; keep them flat).
- Notes (`src/i18n/notes/<ns>.json`) say where each string shows, who reads it, and its maxLength.

## Conventions

`GLOSSARY-he.md` (this folder) is binding: the term table and the conventions below it (no gendered
address where avoidable, verbal nouns for buttons, impersonal hints, slash forms only when a person's
gender cannot be avoided, hyphen after a prefix letter before a placeholder: `ל-{name}`, plural
variants `_one` / `_two` / `_other`). Placeholders are copied verbatim. Chord symbols, keys, BPM and
Capo stay in Latin letters; song and prayer names are data and stay as written; changelog entries stay
English. Legal namespaces (`legal`, `privacy`, `terms`, `smsConsent`, `accessibility`) are formal and
exact.

## Method used for the first pass (phase 7, lane E)

1. Glossary first, committed alone.
2. One translator per namespace group, each given the glossary, these rules and its namespace list;
   each checked its files with `--ns … --list`.
3. Consolidation: grep the Hebrew files for each glossary term's rejected alternatives (for example
   `סט`, `צ'ארט`, `הופעה`, `טרנספוזיציה`, `מוביל` for Vocal Lead) and align them; then the full check
   and `npx vitest run src/__tests__/i18n src/__tests__/mt-p7`.

For a delta pass, repeat steps 2–3 for the namespaces the script lists.

## File extensions

A dotted extension in Hebrew text (".csv", ".pdf") is wrapped in Unicode isolates, U+2066 before and U+2069 after, so the dot stays on the left in right-to-left text. The lead added these after the review; keep them when editing a string.
