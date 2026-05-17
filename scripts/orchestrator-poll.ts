/**
 * Autonomous-run orchestrator poller.
 *
 * Invoked once per /loop tick by `prompts/orchestrator-loop.md`.
 * Pure status reporter — no side effects. Reads the autonomous-run
 * state directory, reports what the orchestrator should do next on
 * a single deterministic last-line of stdout:
 *
 *   STATUS=<token> cycle=<N> [extra=...]
 *
 * The /loop session parses that token and decides to (a) spawn a
 * processor via Bash run_in_background, (b) ScheduleWakeup for the
 * next tick, or (c) terminate the loop.
 *
 * Tokens (canonical set — keep in sync with orchestrator-loop.md):
 *
 *   STATUS=PAUSED                — `.autonomous-run-paused.lock` exists
 *   STATUS=ABORTED               — `.autonomous-run-aborted.lock` exists
 *   STATUS=TERMINATE-GREEN       — last cycle hit all-green threshold
 *   STATUS=TERMINATE-CAP         — cycle cap (5) reached
 *   STATUS=TERMINATE-TIME        — 18hr time cap exceeded
 *   STATUS=TERMINATE-REGRESSION  — last cycle worse than previous
 *   STATUS=WAITING-COWORK        — current cycle's COWORK-DONE.flag absent
 *   STATUS=PROCESSOR-RUNNING     — processor-started.flag present, no
 *                                  processor-done.flag yet
 *   STATUS=READY-TO-SPAWN-PROCESSOR — cowork done, processor not started
 *   STATUS=PROCESSOR-DONE        — processor finished; loop should
 *                                  continue (next cowork in flight) or
 *                                  re-poll to pick up the next cycle
 *
 * Plus a CRIT-WAKE side-channel: if `cycle-<N>/CRIT-WAKE-DANIEL.flag`
 * exists and hasn't been acknowledged (no `CRIT-WAKE-DANIEL.ack` next
 * to it), we add `crit_wake=1 crit_path=<path>` to the status line so
 * the orchestrator pages Daniel and then writes the .ack to dedupe.
 *
 * Run:
 *   npx tsx scripts/orchestrator-poll.ts
 *
 * Read-only. Safe to run on every tick. Exits 0 always — failures
 * print `STATUS=ERROR reason=<...>` and exit 0 so the /loop sees them.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..');
const AUTONOMOUS_DIR = join(REPO_ROOT, 'outputs', 'autonomous-run');
const STATE_FILE = join(AUTONOMOUS_DIR, 'AUTONOMOUS-STATE.md');
const PAUSED_LOCK = join(AUTONOMOUS_DIR, '.autonomous-run-paused.lock');
const ABORTED_LOCK = join(AUTONOMOUS_DIR, '.autonomous-run-aborted.lock');

const CYCLE_CAP = 5;
const TIME_CAP_MS = 18 * 60 * 60 * 1000; // 18 hr

interface Status {
  token: string;
  cycle: number | null;
  extras: Record<string, string>;
}

function emit(s: Status): never {
  const extras = Object.entries(s.extras)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');
  const cyclePart = s.cycle == null ? '' : ` cycle=${s.cycle}`;
  const line = `STATUS=${s.token}${cyclePart}${extras ? ' ' + extras : ''}`;
  // Print human-readable diagnostics first, then the canonical last line.
  console.log(`[${new Date().toISOString()}] orchestrator-poll`);
  console.log(`  autonomous-run dir: ${AUTONOMOUS_DIR}`);
  if (s.cycle != null) console.log(`  current cycle:      ${s.cycle}`);
  console.log(`  decision:           ${s.token}`);
  if (Object.keys(s.extras).length) {
    console.log(`  extras:             ${JSON.stringify(s.extras)}`);
  }
  console.log(''); // blank line before canonical
  console.log(line);
  process.exit(0);
}

function parseStateFile(path: string): {
  currentCycle: number;
  runStartedIso: string | null;
  lastCycleTotal: number | null;
} {
  if (!existsSync(path)) {
    emit({
      token: 'ERROR',
      cycle: null,
      extras: { reason: 'state-file-missing' },
    });
  }
  const text = readFileSync(path, 'utf8');

  // Current cycle: line like `- **Current cycle:** 1 (in flight ...)`.
  const cycleMatch = text.match(
    /\*\*Current cycle:\*\*\s*(\d+)/i
  );
  if (!cycleMatch) {
    emit({
      token: 'ERROR',
      cycle: null,
      extras: { reason: 'no-current-cycle-in-state' },
    });
  }
  const currentCycle = parseInt(cycleMatch![1], 10);

  // Started: `- **Started:** <ISO>` or `TBD-ISO` (cycle 1 not yet stamped).
  const startedMatch = text.match(/\*\*Started:\*\*\s*([^\s]+)/i);
  const runStartedIso =
    startedMatch && startedMatch[1] !== 'TBD-ISO' ? startedMatch[1] : null;

  // Regression baseline: `Last cycle's total finding count: <N>`.
  const totalMatch = text.match(
    /Last cycle's total finding count:\s*(\d+)/i
  );
  const lastCycleTotal = totalMatch ? parseInt(totalMatch[1], 10) : null;

  return { currentCycle, runStartedIso, lastCycleTotal };
}

function findLastTerminatedCycle(text: string): {
  cycleN: number;
  termination: string;
  totalFindings: number;
} | null {
  // Walk cycle blocks in reverse; first with `Termination check:` line wins.
  const cycleBlocks = [
    ...text.matchAll(/###\s+Cycle\s+(\d+)\b[\s\S]*?(?=(?:\n###\s+Cycle\s+\d+\b)|\n##\s|$)/g),
  ];
  for (let i = cycleBlocks.length - 1; i >= 0; i--) {
    const block = cycleBlocks[i][0];
    const cycleN = parseInt(cycleBlocks[i][1], 10);
    const termMatch = block.match(/Termination check:\s*([a-z-]+)/i);
    const totals = [
      ...block.matchAll(/^\s*-\s*(CRIT|HIGH|MED|LOW|NOTE):\s*(\d+)/gim),
    ];
    if (termMatch && totals.length) {
      const totalFindings = totals.reduce(
        (acc, m) => acc + parseInt(m[2], 10),
        0
      );
      return { cycleN, termination: termMatch[1], totalFindings };
    }
  }
  return null;
}

function detectCritWake(cycleDir: string): { path: string } | null {
  const flag = join(cycleDir, 'CRIT-WAKE-DANIEL.flag');
  const ack = join(cycleDir, 'CRIT-WAKE-DANIEL.ack');
  if (existsSync(flag) && !existsSync(ack)) {
    return { path: flag };
  }
  return null;
}

function main(): void {
  if (!existsSync(AUTONOMOUS_DIR)) {
    emit({
      token: 'ERROR',
      cycle: null,
      extras: { reason: 'autonomous-dir-missing' },
    });
  }

  // Safety locks take absolute priority.
  if (existsSync(ABORTED_LOCK)) {
    emit({
      token: 'ABORTED',
      cycle: null,
      extras: { lock: '.autonomous-run-aborted.lock' },
    });
  }
  if (existsSync(PAUSED_LOCK)) {
    emit({
      token: 'PAUSED',
      cycle: null,
      extras: { lock: '.autonomous-run-paused.lock' },
    });
  }

  const { currentCycle, runStartedIso, lastCycleTotal } = parseStateFile(STATE_FILE);

  // Time cap: if Started is set and we've exceeded 18 hr, terminate.
  if (runStartedIso) {
    const startedMs = Date.parse(runStartedIso);
    if (!Number.isNaN(startedMs)) {
      const elapsedMs = Date.now() - startedMs;
      if (elapsedMs > TIME_CAP_MS) {
        emit({
          token: 'TERMINATE-TIME',
          cycle: currentCycle,
          extras: { elapsed_hr: (elapsedMs / 3_600_000).toFixed(1) },
        });
      }
    }
  }

  // Terminal decision recorded in the most-recently-terminated cycle block
  // takes precedence over per-cycle file checks (the processor wrote it).
  const stateText = readFileSync(STATE_FILE, 'utf8');
  const lastTerm = findLastTerminatedCycle(stateText);
  if (
    lastTerm &&
    (lastTerm.termination === 'terminate-green' ||
      lastTerm.termination === 'terminate-cap' ||
      lastTerm.termination === 'terminate-regression' ||
      lastTerm.termination === 'abort-crit')
  ) {
    const token =
      lastTerm.termination === 'terminate-green'
        ? 'TERMINATE-GREEN'
        : lastTerm.termination === 'terminate-cap'
        ? 'TERMINATE-CAP'
        : lastTerm.termination === 'terminate-regression'
        ? 'TERMINATE-REGRESSION'
        : 'ABORTED';
    emit({
      token,
      cycle: lastTerm.cycleN,
      extras: {
        last_total: String(lastTerm.totalFindings),
        ...(lastCycleTotal != null ? { baseline: String(lastCycleTotal) } : {}),
      },
    });
  }

  // Cycle cap check.
  if (currentCycle > CYCLE_CAP) {
    emit({
      token: 'TERMINATE-CAP',
      cycle: currentCycle,
      extras: { cap: String(CYCLE_CAP) },
    });
  }

  // Per-cycle file state.
  const cycleDir = join(AUTONOMOUS_DIR, `cycle-${currentCycle}`);
  if (!existsSync(cycleDir)) {
    // Cycle dir doesn't exist yet — cowork hasn't gotten far enough to
    // write anything. Still waiting.
    emit({
      token: 'WAITING-COWORK',
      cycle: currentCycle,
      extras: { reason: 'cycle-dir-absent' },
    });
  }

  const coworkDone = join(cycleDir, 'COWORK-DONE.flag');
  const processorStarted = join(cycleDir, 'processor-started.flag');
  const processorDone = join(cycleDir, 'processor-done.flag');
  const crit = detectCritWake(cycleDir);
  const critExtras: Record<string, string> = crit
    ? { crit_wake: '1', crit_path: crit.path.replace(/\\/g, '/') }
    : {};

  if (existsSync(processorDone)) {
    // Processor finished its run for this cycle. Surface its summary.
    let summary = '';
    try {
      summary = readFileSync(processorDone, 'utf8').trim().slice(0, 400);
    } catch {
      summary = '(unreadable)';
    }
    emit({
      token: 'PROCESSOR-DONE',
      cycle: currentCycle,
      extras: {
        ...critExtras,
        summary_excerpt: JSON.stringify(summary.slice(0, 120)),
      },
    });
  }

  if (existsSync(processorStarted)) {
    let startedAt = '';
    try {
      startedAt = statSync(processorStarted).mtime.toISOString();
    } catch {
      startedAt = 'unknown';
    }
    emit({
      token: 'PROCESSOR-RUNNING',
      cycle: currentCycle,
      extras: { ...critExtras, started_at: startedAt },
    });
  }

  if (existsSync(coworkDone)) {
    emit({
      token: 'READY-TO-SPAWN-PROCESSOR',
      cycle: currentCycle,
      extras: critExtras,
    });
  }

  // No cowork flag yet — still in cowork phase.
  // Report directory contents as a debugging breadcrumb.
  let dirListing = '';
  try {
    dirListing = readdirSync(cycleDir).join(',');
  } catch {
    dirListing = '(unreadable)';
  }
  emit({
    token: 'WAITING-COWORK',
    cycle: currentCycle,
    extras: {
      ...critExtras,
      dir_contents: JSON.stringify(dirListing).slice(0, 200),
    },
  });
}

try {
  main();
} catch (err: any) {
  emit({
    token: 'ERROR',
    cycle: null,
    extras: {
      reason: 'poller-threw',
      err: JSON.stringify(String(err?.message ?? err)).slice(0, 200),
    },
  });
}
