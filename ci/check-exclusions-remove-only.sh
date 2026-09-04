#!/usr/bin/env bash
# The remove-only guard on ci/gated-suite-exclusions.txt.
#
# R-0904-live-cw-21 §2(c): the gated suite's exclusion list may SHRINK freely
# and may never GROW without a ruling from Daniel. Adding a file to it is the
# same act as hiding a bonded row — the number improves and the thing the
# number was for is gone.
#
# THE PROPERTY THIS PROTECTS (R-0904-live-cw-1): the counted test debt never
# grows without a ruling.
#
# It reports its own denominator on every run (R-0903-live-cw-11), including
# the runs where the file was not touched at all — a guard that prints nothing
# on the 99 pushes that do not touch the file is indistinguishable from a
# guard that is broken.
#
# Usage: ci/check-exclusions-remove-only.sh <base-ref-or-sha>
set -uo pipefail

FILE="ci/gated-suite-exclusions.txt"
BASE="${1:-}"

# The comparable content of the list: paths only, no comments, no blanks, and
# SORTED — so a reordering or a comment edit is not an addition.
entries() {
    grep -vE '^\s*(#|$)' 2>/dev/null | sed 's/[[:space:]]*$//' | sort -u
}

if [ -z "$BASE" ]; then
    echo "::error::remove-only guard called without a base ref. Refusing to pass by default."
    exit 1
fi

if ! git rev-parse --verify --quiet "$BASE" >/dev/null; then
    # Fail closed. A guard that cannot read its own baseline has not checked
    # anything, and saying so is the only honest outcome.
    echo "::error::remove-only guard could not resolve base ref '$BASE'. Refusing to pass by default."
    exit 1
fi

NOW_COUNT=$(entries < "$FILE" | wc -l | tr -d ' ')

if git cat-file -e "$BASE:$FILE" 2>/dev/null; then
    BEFORE=$(git show "$BASE:$FILE" | entries)
else
    # The list did not exist at the baseline — this is the commit that installs
    # it. Every line is "added" in the diff sense, and that is correct: the
    # install is the ruling (R-0904-live-cw-23 §2). Say so out loud rather than
    # letting it read as a silent pass.
    echo "[remove-only] $FILE does not exist at $BASE — this push INSTALLS the list."
    echo "[remove-only] denominator: 0 entries before, $NOW_COUNT after, +$NOW_COUNT installed."
    exit 0
fi

NOW=$(entries < "$FILE")
BEFORE_COUNT=$(printf '%s\n' "$BEFORE" | grep -c . || true)

ADDED=$(comm -13 <(printf '%s\n' "$BEFORE") <(printf '%s\n' "$NOW") | grep . || true)
REMOVED=$(comm -23 <(printf '%s\n' "$BEFORE") <(printf '%s\n' "$NOW") | grep . || true)

TOUCHED="no"
if [ -n "$ADDED" ] || [ -n "$REMOVED" ]; then TOUCHED="yes"; fi

echo "[remove-only] base=$BASE  file=$FILE  touched-by-this-push=$TOUCHED"
echo "[remove-only] denominator: $BEFORE_COUNT entries before, $NOW_COUNT after."
if [ -n "$REMOVED" ]; then
    echo "[remove-only] removed (allowed — a file left the debt):"
    printf '  - %s\n' $REMOVED
fi

if [ -n "$ADDED" ]; then
    echo "[remove-only] added:"
    printf '  + %s\n' $ADDED
    echo "::error file=$FILE::The gated-suite exclusion list GREW by $(printf '%s\n' "$ADDED" | grep -c .) entry/entries. This list is REMOVE-ONLY (R-0904-live-cw-21 §2(c)): a file may come off it the moment CI reports that file green, but adding one hides a failing test from the required check and needs a RULING from Daniel — not a wave, not a lane, not a green build. If the test is genuinely unfixable right now, that is the ruling to ask for; if it is merely inconvenient, fix the test. Remove the added line(s) above to go green."
    exit 1
fi

echo "[remove-only] OK — no entry was added."
exit 0
