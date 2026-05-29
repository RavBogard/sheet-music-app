#!/usr/bin/env bash
# scripts/test-setup-cowork-worktree.sh
#
# Regression smoke test for setup-cowork-worktree.sh + its sourceable lib
# scripts/lib/cowork-warm-worktree.sh.
#
# Heavy steps (npm ci, 200MB browser download, real WebKit launch) are NOT
# performed — they are stubbed via the COWORK_* override env vars the script
# + lib expose, so the test exercises the BRANCHING LOGIC (fail-loud on
# no-WebKit, PASS/FAIL self-check, full orchestration wiring) deterministically
# and in seconds. Mirrors scripts/test-setup-coord-worktree.sh.
#
# Scenarios:
#   T0: bash -n syntax check on both scripts + the lib.
#   T1: cowork_verify_webkit happy path (probe exits 0) → returns 0.
#   T2: cowork_verify_webkit FAIL-LOUD (probe emits missing-lib error, exits 1)
#       → returns non-zero AND output names the missing lib + Docker fallback.
#   T3: cowork_harness_self_check PASS (version+list ok) → returns 0, prints PASS.
#   T4: cowork_harness_self_check FAIL (test-list fails) → non-zero, prints FAIL.
#   T5: arg validation — missing args → exit 2; non-integer N → exit 2.
#   T6: full setup-cowork-worktree.sh end-to-end with every heavy cmd stubbed
#       → exit 0, prints HARNESS SELF-CHECK: PASS + harness is WARM.
#
# Exits 0 on all-PASS, non-zero on any FAIL. PASS/FAIL lines are grep-able.
#
# Usage:
#   bash scripts/test-setup-cowork-worktree.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LIB="$SCRIPT_DIR/lib/cowork-warm-worktree.sh"
SETUP="$SCRIPT_DIR/setup-cowork-worktree.sh"
COORD_SETUP="$SCRIPT_DIR/setup-coord-worktree.sh"

[[ -f "$LIB" ]]   || { echo "FAIL: missing $LIB" >&2; exit 2; }
[[ -f "$SETUP" ]] || { echo "FAIL: missing $SETUP" >&2; exit 2; }

TMPDIR="$(mktemp -d -t cowork-warm-test-XXXXXX)"
echo "[test] tmpdir: $TMPDIR"
cleanup() { [[ -n "${TMPDIR:-}" && -d "$TMPDIR" ]] && rm -rf -- "$TMPDIR" 2>/dev/null || true; }
trap cleanup EXIT

PASS=0
FAIL=0
report() {
  local name="$1" status="$2"
  if [[ "$status" == "PASS" ]]; then echo "[test] PASS: $name"; PASS=$((PASS+1))
  else echo "[test] FAIL: $name" >&2; FAIL=$((FAIL+1)); fi
}

# ============================================================
# T0: syntax checks.
# ============================================================
echo
echo "[test] T0: bash -n syntax on lib + setup script"
syntax_ok=1
for f in "$LIB" "$SETUP"; do
  if ! bash -n "$f" 2>/dev/null; then echo "[test] T0 detail: bash -n failed on $f" >&2; syntax_ok=0; fi
done
if [[ $syntax_ok -eq 1 ]]; then report "T0: scripts parse clean (bash -n)" "PASS"; else report "T0: scripts parse clean (bash -n)" "FAIL"; fi

# ============================================================
# T1: webkit verify happy path.
# ============================================================
echo
echo "[test] T1: cowork_verify_webkit returns 0 when the launch probe succeeds"
(
  set +e
  # shellcheck source=lib/cowork-warm-worktree.sh
  . "$LIB"
  COWORK_WEBKIT_PROBE_CMD='true' cowork_verify_webkit "T1" >/dev/null 2>&1
  exit $?
)
if [[ $? -eq 0 ]]; then report "T1: webkit verify PASS on launchable host" "PASS"
else report "T1: webkit verify PASS on launchable host" "FAIL"; fi

# ============================================================
# T2: webkit verify FAIL-LOUD path.
# ============================================================
echo
echo "[test] T2: cowork_verify_webkit FAILS LOUD on a no-WebKit host"
T2_OUT="$TMPDIR/t2.out"
(
  set +e
  . "$LIB"
  # Stub probe: emit a realistic dynamic-linker error then fail.
  COWORK_WEBKIT_PROBE_CMD='echo "error while loading shared libraries: libenchant-2-2.so.2: cannot open shared object file" >&2; exit 1' \
    cowork_verify_webkit "T2"
  echo "RC=$?"
) >"$T2_OUT" 2>&1
t2_rc_line="$(grep -oE 'RC=[0-9]+' "$T2_OUT" | tail -1)"
if [[ "$t2_rc_line" != "RC=0" ]] \
   && grep -q "FATAL: WebKit could NOT launch" "$T2_OUT" \
   && grep -qi "libenchant" "$T2_OUT" \
   && grep -q "mcr.microsoft.com/playwright" "$T2_OUT" \
   && grep -q "FU-c12-9" "$T2_OUT"; then
  report "T2: webkit verify fails loud + names libs + Docker fallback" "PASS"
else
  echo "[test] T2 detail:" >&2; sed 's/^/[test]   /' "$T2_OUT" >&2
  report "T2: webkit verify fails loud + names libs + Docker fallback" "FAIL"
fi

# ============================================================
# T3: harness self-check PASS.
# ============================================================
echo
echo "[test] T3: cowork_harness_self_check PASS when version + test-list succeed"
T3_OUT="$TMPDIR/t3.out"
(
  set +e
  . "$LIB"
  COWORK_PW_VERSION_CMD='echo Version 1.58.2' COWORK_PW_LIST_CMD='true' cowork_harness_self_check "T3"
  echo "RC=$?"
) >"$T3_OUT" 2>&1
if grep -q "HARNESS SELF-CHECK: PASS" "$T3_OUT" && grep -q "RC=0" "$T3_OUT"; then
  report "T3: self-check PASS path" "PASS"
else
  echo "[test] T3 detail:" >&2; sed 's/^/[test]   /' "$T3_OUT" >&2
  report "T3: self-check PASS path" "FAIL"
fi

# ============================================================
# T4: harness self-check FAIL.
# ============================================================
echo
echo "[test] T4: cowork_harness_self_check FAIL when test-list fails"
T4_OUT="$TMPDIR/t4.out"
(
  set +e
  . "$LIB"
  COWORK_PW_VERSION_CMD='echo Version 1.58.2' COWORK_PW_LIST_CMD='false' cowork_harness_self_check "T4"
  echo "RC=$?"
) >"$T4_OUT" 2>&1
if grep -q "HARNESS SELF-CHECK: FAIL" "$T4_OUT" && ! grep -q "RC=0" "$T4_OUT"; then
  report "T4: self-check FAIL path" "PASS"
else
  echo "[test] T4 detail:" >&2; sed 's/^/[test]   /' "$T4_OUT" >&2
  report "T4: self-check FAIL path" "FAIL"
fi

# ============================================================
# T5: arg validation.
# ============================================================
echo
echo "[test] T5: arg validation (missing args / non-integer N → exit 2)"
t5_ok=1
( bash "$SETUP" >/dev/null 2>&1 ); [[ $? -eq 2 ]] || { echo "[test] T5: no-args did not exit 2" >&2; t5_ok=0; }
( bash "$SETUP" notanumber feat/x ../wt >/dev/null 2>&1 ); [[ $? -eq 2 ]] || { echo "[test] T5: bad-N did not exit 2" >&2; t5_ok=0; }
if [[ $t5_ok -eq 1 ]]; then report "T5: arg validation rejects bad input with exit 2" "PASS"
else report "T5: arg validation rejects bad input with exit 2" "FAIL"; fi

# ============================================================
# T6: full orchestration wiring with all heavy commands stubbed.
# ============================================================
echo
echo "[test] T6: full setup-cowork-worktree.sh end-to-end (heavy cmds stubbed)"
T6_OUT="$TMPDIR/t6.out"
T6_WT="$TMPDIR/t6-worktree"
# Fake coord-setup: just create the worktree dir (arg 3 = path).
T6_COORD_STUB="$TMPDIR/fake-coord-setup.sh"
cat >"$T6_COORD_STUB" <<'STUB'
#!/usr/bin/env bash
mkdir -p "$3"
echo "[fake-coord-setup] created worktree $3"
STUB
chmod +x "$T6_COORD_STUB"
(
  set +e
  COWORK_SETUP_COORD_CMD="$T6_COORD_STUB" \
  COWORK_NPM_CI_CMD='mkdir -p node_modules' \
  COWORK_PLAYWRIGHT_INSTALL_CMD='true' \
  COWORK_PLAYWRIGHT_INSTALL_DEPS_CMD='false' \
  COWORK_WEBKIT_PROBE_CMD='true' \
  COWORK_PW_VERSION_CMD='echo Version 1.58.2' \
  COWORK_PW_LIST_CMD='true' \
    bash "$SETUP" 3 "feat/test-cowork-$$" "$T6_WT" origin/master webkit
  echo "RC=$?"
) >"$T6_OUT" 2>&1
if grep -q "HARNESS SELF-CHECK: PASS" "$T6_OUT" \
   && grep -q "harness is WARM" "$T6_OUT" \
   && grep -q "RC=0" "$T6_OUT" \
   && [[ -d "$T6_WT/node_modules" ]]; then
  report "T6: full wiring produces a warm worktree (exit 0)" "PASS"
else
  echo "[test] T6 detail:" >&2; sed 's/^/[test]   /' "$T6_OUT" >&2
  report "T6: full wiring produces a warm worktree (exit 0)" "FAIL"
fi

echo
echo "[test] summary: PASS=$PASS  FAIL=$FAIL"
if [[ $FAIL -gt 0 ]]; then echo "[test] OVERALL: FAIL"; exit 1; fi
echo "[test] OVERALL: PASS"
exit 0
