#!/usr/bin/env bash
# scripts/lib/cowork-warm-worktree.sh
#
# Sourceable helpers for setup-cowork-worktree.sh — the parts with branching
# logic worth a regression test. Mirrors the sourceable pattern of
# scripts/lib/unshallow-current-repo.sh so the same code runs inside the
# setup script AND inside scripts/test-setup-cowork-worktree.sh.
#
# Why this exists: cycle-12 run-1 graded the entire offline+stickiness probe
# matrix NOT-RUN because the cowork sandbox had no node_modules / no
# Playwright / no WebKit ([[feedback_cowork_harness_warm_worktree]]). run-2
# was warmed by a manual ritual but the sandbox lacked WebKit system libs
# and silently fell back to Chromium-with-iPad-UA (FU-c12-9), producing
# engine-incorrect "iPad" results. These helpers make real-WebKit
# availability VERIFIABLE and FAIL-LOUD — never a silent substitution.
#
# All heavy/external commands are routed through overridable env vars so the
# regression test can exercise the fail-loud branch without a real 200MB
# browser download:
#   COWORK_WEBKIT_PROBE_CMD    — replaces the real `webkit.launch()` probe.
#   COWORK_PW_VERSION_CMD      — replaces `npx playwright --version`.
#   COWORK_PW_LIST_CMD         — replaces `npx playwright test --list`.
#
# Functions:
#   cowork_verify_webkit <label>       — ground-truth WebKit launch check.
#   cowork_harness_self_check <label>  — version + test-discovery PASS/FAIL.

# Known WebKit system libraries that go missing in bare cowork sandboxes
# (no sudo/apt). Named in FU-c12-9. Surfaced in the fail-loud message so the
# operator knows what to install (or to switch to the Docker image instead).
COWORK_WEBKIT_KNOWN_LIBS="libevent-2.1.so.7 libenchant-2-2 libsecret-1-0 libGLESv2 libwoff2dec libgstcodecparsers"
COWORK_PLAYWRIGHT_DOCKER_IMAGE="mcr.microsoft.com/playwright:v1.58.2-noble"

# The real launch probe: load WebKit from the committed @playwright/test dep,
# launch it headless, close it. Exit 0 only if the engine genuinely runs on
# this host. Stderr carries the dynamic-linker error (missing .so libs) when
# it cannot. Kept as a single-quoted heredoc so $ inside is literal.
_cowork_real_webkit_probe() {
  node -e '
    let webkit;
    try {
      ({ webkit } = require("@playwright/test"));
    } catch (e) {
      console.error("cannot require @playwright/test (run npm ci first): " + (e && e.message ? e.message : e));
      process.exit(2);
    }
    if (!webkit || typeof webkit.launch !== "function") {
      console.error("@playwright/test does not export a webkit launcher");
      process.exit(2);
    }
    webkit.launch({ headless: true })
      .then((b) => b.close())
      .then(() => process.exit(0))
      .catch((e) => { console.error(e && e.message ? e.message : String(e)); process.exit(1); });
  '
}

# cowork_verify_webkit <label>
# Returns 0 iff WebKit can actually launch on this host. On failure, prints a
# loud, actionable diagnostic (the missing libs detected from the probe's
# stderr + the known FU-c12-9 reference list + the Docker fallback) and
# returns non-zero. NEVER silently substitutes Chromium.
cowork_verify_webkit() {
  local label="${1:-cowork}"
  local err_file rc
  err_file="$(mktemp -t cowork-webkit-probe-XXXXXX)"

  echo "[${label}] verifying WebKit actually launches (ground-truth, not install-deps exit code)..."
  if [[ -n "${COWORK_WEBKIT_PROBE_CMD:-}" ]]; then
    # Test/override hook: run the supplied command, capture its stderr.
    bash -c "${COWORK_WEBKIT_PROBE_CMD}" >/dev/null 2>"$err_file"
    rc=$?
  else
    _cowork_real_webkit_probe >/dev/null 2>"$err_file"
    rc=$?
  fi

  if [[ $rc -eq 0 ]]; then
    echo "[${label}] ✓ WebKit launches — engine-correct iPad (820×1180) coverage is available"
    rm -f "$err_file"
    return 0
  fi

  # FAIL LOUD — do not let cowork run Chromium-as-WebKit.
  local detected
  detected="$(grep -oE '[A-Za-z0-9_.+-]+\.so(\.[0-9]+)*' "$err_file" 2>/dev/null | sort -u | tr '\n' ' ')"
  {
    echo "[${label}] FATAL: WebKit could NOT launch on this host (probe exit ${rc})."
    echo "[${label}]   This worktree is NOT WebKit-warm. Do NOT run the iPad matrix here —"
    echo "[${label}]   a Chromium-with-iPad-UA fallback produces engine-INCORRECT results (FU-c12-9)."
    echo "[${label}]   Probe stderr (first 8 lines):"
    sed -n '1,8p' "$err_file" 2>/dev/null | sed 's/^/      | /'
    if [[ -n "$detected" ]]; then
      echo "[${label}]   Missing shared libraries detected: ${detected}"
    fi
    echo "[${label}]   Commonly-missing WebKit syslibs in bare sandboxes (FU-c12-9): ${COWORK_WEBKIT_KNOWN_LIBS}"
    echo "[${label}]   Fix A (has sudo/apt): npx playwright install-deps webkit"
    echo "[${label}]   Fix B (no sudo — RECOMMENDED for cowork): run inside the Playwright Docker image"
    echo "[${label}]            docker run --rm -it -v \"\$PWD\":/work -w /work ${COWORK_PLAYWRIGHT_DOCKER_IMAGE} bash"
    echo "[${label}]            (ships every browser + every system dep preinstalled)"
  } >&2
  rm -f "$err_file"
  return 1
}

# cowork_harness_self_check <label>
# Confirms the Playwright test runner is wired in this worktree: prints the
# version + lists discoverable tests against playwright.config.ts. Prints a
# single PASS/FAIL line (Acceptance #1). Returns 0 on PASS.
cowork_harness_self_check() {
  local label="${1:-cowork}"
  local version_cmd list_cmd vrc lrc
  version_cmd="${COWORK_PW_VERSION_CMD:-npx playwright --version}"
  list_cmd="${COWORK_PW_LIST_CMD:-npx playwright test --list}"

  echo "[${label}] harness self-check: '${version_cmd}' + '${list_cmd}'"
  local version_out
  version_out="$(bash -c "${version_cmd}" 2>&1)"; vrc=$?
  echo "[${label}]   playwright version: ${version_out}"
  bash -c "${list_cmd}" >/dev/null 2>&1; lrc=$?

  if [[ $vrc -eq 0 && $lrc -eq 0 ]]; then
    echo "[${label}] HARNESS SELF-CHECK: PASS"
    return 0
  fi
  echo "[${label}] HARNESS SELF-CHECK: FAIL (version rc=${vrc}, test-list rc=${lrc})" >&2
  return 1
}
