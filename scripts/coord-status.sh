#!/usr/bin/env bash
# coord-status.sh — at-a-glance dashboard of the .coord/ parallel-agent state.
#
# Reads .coord/ + git state and prints a compact human-readable status report.
# Read-only: never mutates .coord/ or runs `git fetch` (unless --sync given).
#
# Usage:
#   bash scripts/coord-status.sh            # auto-detect coord-root by walking up
#   bash scripts/coord-status.sh --sync     # run `git fetch origin` first (one network hit)
#   bash scripts/coord-status.sh --coord PATH
#   COORD_ROOT=PATH bash scripts/coord-status.sh    # used by the test harness
#
# Source of truth: $COORD_ROOT/.coord/{agents.md,inbox/*.md,shared/{master-tip,claims}.md,
# QUEUE.md,status/*.md} + `git worktree list` + `git log -1 origin/master`.
#
# See `.coord/README.md` § "Operations / coord-status" for protocol context.
set -u
trap '' PIPE

SYNC=0
COORD_ROOT="${COORD_ROOT:-}"
while [ $# -gt 0 ]; do
  case "$1" in
    --sync) SYNC=1; shift ;;
    --coord) COORD_ROOT="$2"; shift 2 ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "coord-status: unknown arg: $1" >&2; exit 2 ;;
  esac
done

# Walk up from cwd to find a directory containing .coord/cold-boot/.
if [ -z "${COORD_ROOT}" ]; then
  d="$(pwd)"
  while [ "$d" != "/" ] && [ "$d" != "" ]; do
    if [ -d "$d/.coord/cold-boot" ]; then COORD_ROOT="$d"; break; fi
    # Also accept a sibling sheet-music-app/ layout (worktrees live next to canonical).
    if [ -d "$d/sheet-music-app/.coord/cold-boot" ]; then COORD_ROOT="$d/sheet-music-app"; break; fi
    parent="$(dirname "$d")"; [ "$parent" = "$d" ] && break; d="$parent"
  done
fi
if [ -z "${COORD_ROOT}" ] || [ ! -d "${COORD_ROOT}/.coord" ]; then
  echo "coord-status: no .coord/ found (walked up from $(pwd)); pass --coord PATH or set COORD_ROOT" >&2
  exit 2
fi

# Colors only when stdout is a terminal.
if [ -t 1 ]; then
  C_BOLD=$'\033[1m'; C_DIM=$'\033[2m'; C_RED=$'\033[31m'; C_YEL=$'\033[33m'; C_GRN=$'\033[32m'; C_CYA=$'\033[36m'; C_RST=$'\033[0m'
else
  C_BOLD=""; C_DIM=""; C_RED=""; C_YEL=""; C_GRN=""; C_CYA=""; C_RST=""
fi

NOW="$(date -u +'%Y-%m-%dT%H:%MZ')"
NOW_EPOCH="$(date -u +%s)"
echo "${C_BOLD}=== CRC .coord/ Status (${NOW}) ===${C_RST}"
echo "${C_DIM}coord-root: ${COORD_ROOT}${C_RST}"
echo

# --- MASTER TIP ----------------------------------------------------------
TIP_FILE="${COORD_ROOT}/.coord/shared/master-tip.md"
if [ -f "$TIP_FILE" ]; then
  TIP_SHA="$(grep -m1 -E '^\*\*SHA:\*\*' "$TIP_FILE" | sed -E 's/.*\*\*SHA:\*\*[[:space:]]*//')"
  TIP_AT="$(grep -m1 -E '^\*\*Pushed at:\*\*' "$TIP_FILE" | sed -E 's/.*\*\*Pushed at:\*\*[[:space:]]*//' | awk '{print $1}')"
else
  TIP_SHA="(missing master-tip.md)"; TIP_AT=""
fi
LOCAL_TIP="$(git -C "$COORD_ROOT" log -1 --format='%h %s' origin/master 2>/dev/null || echo '(no origin/master)')"
echo "${C_BOLD}MASTER TIP:${C_RST} $LOCAL_TIP"
echo "${C_DIM}  (claims recorded tip: ${TIP_SHA} @ ${TIP_AT})${C_RST}"
if [ "$SYNC" = "1" ]; then
  echo "${C_DIM}  --sync: running git fetch origin…${C_RST}"
  git -C "$COORD_ROOT" fetch origin --quiet 2>&1 || echo "${C_YEL}  fetch failed (non-fatal)${C_RST}"
fi
echo

# --- WORKTREES -----------------------------------------------------------
echo "${C_BOLD}WORKTREES:${C_RST}"
git -C "$COORD_ROOT" worktree list 2>/dev/null | awk '{
  path=$1; sha=$2
  branch=""; for (i=3;i<=NF;i++){ branch=branch (branch==""?"":" ") $i }
  n=split(path,p,"/"); leaf=p[n]
  printf "  %-44s %-12s %s\n", substr(leaf,1,44), sha, branch
}'
echo

# --- CODER CENSUS --------------------------------------------------------
# For each coder-N (1..7): inbox first msg = current dispatch → infer lane signal.
echo "${C_BOLD}CODER CENSUS:${C_RST}"
for n in 1 2 3 4 5 6 7; do
  ibx="${COORD_ROOT}/.coord/inbox/coder-${n}.md"
  st="${COORD_ROOT}/.coord/status/coder-${n}.md"
  lane=""; tag="idle "; color="$C_DIM"
  if [ -f "$ibx" ]; then
    # First msg header → lane signal. NOTE: in this protocol coder inboxes are
    # ephemeral (per CODER.md §Memory model) so the first ## msg- IS the dispatch,
    # not a backlog tail.
    subj="$(grep -m1 -E '^## msg-' "$ibx" | sed -E 's/^## msg-//;s/[[:space:]]*\|.*//')"
    if [ -n "$subj" ]; then
      tag="LIVE "; color="$C_GRN"; lane="$subj"
    fi
    # Critical signals get a red flag.
    if grep -qE 'status:(HEADS-UP-CRITICAL|BLOCKED)$' "$ibx" 2>/dev/null; then
      color="$C_RED"; tag="${tag}!"
    fi
  fi
  if [ -f "$st" ]; then
    cur="$(grep -m1 -E '^- \*\*Current task:\*\*' "$st" | sed -E 's/.*\*\*Current task:\*\*[[:space:]]*//' | cut -c1-100)"
    [ -n "$cur" ] && lane="${lane}  ${C_DIM}— ${cur}${C_RST}"
  fi
  printf "  ${color}coder-${n}: %-6s${C_RST} %s\n" "$tag" "$lane"
done
# Auditor row.
abx="${COORD_ROOT}/.coord/inbox/auditor.md"
acolor="$C_DIM"; atag="idle"
if [ -f "$abx" ] && grep -qE 'status:NEW$' "$abx" 2>/dev/null; then
  acolor="$C_CYA"; atag="pending"
fi
printf "  ${acolor}auditor:  %-6s${C_RST}\n" "$atag"
echo

# --- INBOX TAILS (unresolved) -------------------------------------------
print_tail() {
  local file="$1" label="$2"
  echo "${C_BOLD}${label} (last 3 unresolved):${C_RST}"
  if [ ! -f "$file" ]; then echo "  ${C_DIM}(missing)${C_RST}"; return; fi
  # Last 3 ## msg- headers that are NOT status:RESOLVED.
  awk '/^## msg-/ { msgs[++c] = $0 } END { for (i=c;i>0;i--) print msgs[i] }' "$file" \
    | grep -Ev 'status:RESOLVED$' \
    | head -3 \
    | awk -v cR="$C_RED" -v cY="$C_YEL" -v cD="$C_DIM" -v cT="$C_RST" '{
        tag = cD
        if (/HEADS-UP-CRITICAL/ || /BLOCKED/) tag = cR
        else if (/status:NEW$/) tag = cY
        # Compact: drop "## msg-" prefix and the iso timestamp segment.
        line = $0
        sub(/^## msg-/, "", line)
        sub(/[[:space:]]*\|[[:space:]]*[0-9]{4}-[0-9]{2}-[0-9]{2}T[^|]*/, "", line)
        sub(/[[:space:]]*\|[[:space:]]*from[[:space:]]+/, " ← ", line)
        print "  " tag line cT
      }'
}
print_tail "${COORD_ROOT}/.coord/inbox/supervisor.md" "SUPERVISOR INBOX"
echo
print_tail "${COORD_ROOT}/.coord/inbox/auditor.md" "AUDITOR INBOX"
echo

# --- CLAIMS (likely-still-held drift candidates) -------------------------
# A claim row is a drift candidate if:
#   - "held by" column does NOT start with "released"
#   - claimed_at is older than 2h
#   - claimed_at is within the last 24h (older than that = de-facto
#     abandoned-or-released-by-later-row; not actionable signal here)
echo "${C_BOLD}CLAIMS HELD 2h–24h (drift candidates):${C_RST}"
CLAIMS="${COORD_ROOT}/.coord/shared/claims.md"
if [ -f "$CLAIMS" ]; then
  awk -v now="$NOW_EPOCH" '
    BEGIN { lo = now - 86400; hi = now - 7200; found = 0 }
    /^\| / && !/^\| path / && !/^\|---/ {
      n = split($0, f, /[[:space:]]*\|[[:space:]]*/)
      path = f[2]; held = f[3]; at = f[4]
      if (held ~ /^released/ || path == "" || at == "") next
      cmd = "date -u -d \"" at "\" +%s 2>/dev/null"
      epoch = ""; cmd | getline epoch; close(cmd)
      if (epoch == "" || epoch+0 == 0) next
      if (epoch+0 < lo || epoch+0 > hi) next
      if (++shown <= 12) {
        printf "  %-60s held-by: %s  claimed: %s\n", substr(path,1,60), held, at
      }
      found = 1
    }
    END {
      if (!found) print "  (none in last 24h)"
      else if (shown > 12) printf "  … (%d more)\n", shown - 12
    }
  ' "$CLAIMS"
else
  echo "  (missing claims.md)"
fi
echo

# --- QUEUE ---------------------------------------------------------------
# QUEUE.md uses a markdown table `| # | Pri | Lane | Scope | ...`. Live entries
# are rows starting with `| <digit>` under "### Wave N" sections. Empty queue
# is the steady state — POPPED rows live in HTML comments.
echo "${C_BOLD}QUEUE (live entries):${C_RST}"
QUEUE="${COORD_ROOT}/.coord/QUEUE.md"
if [ -f "$QUEUE" ]; then
  rows="$(grep -E '^\|[[:space:]]*[0-9W]' "$QUEUE" | grep -vE '^\|[[:space:]]*#' || true)"
  if [ -n "$rows" ]; then
    echo "$rows" | head -10 | awk '{
      n = split($0, f, /[[:space:]]*\|[[:space:]]*/)
      printf "  [%s] %s — %s\n", f[3], f[4], substr(f[5],1,80)
    }'
  else
    echo "  (empty — all POPPED to coder inboxes)"
  fi
else
  echo "  (no QUEUE.md)"
fi
echo

echo "${C_DIM}=== end ===${C_RST}"
