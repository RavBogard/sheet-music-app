#!/usr/bin/env python3
"""Cycle-5 C5B-META-002 — aggregate cowork findings.jsonl.

Reads one or more JSONL files emitted by probe-batch.mjs (one row per
probe + a batch:start / batch:end envelope) and emits a markdown summary
suitable for cowork HANDOFF-TO-SUPERVISOR.md. Output goes to stdout.

Usage:
    python3 cycle-4/harness/scripts/aggregate.py findings.jsonl > SUMMARY.md
    python3 cycle-4/harness/scripts/aggregate.py run-*/findings.jsonl

The aggregator is intentionally schema-light: it groups by `kind`, counts
ok/failed, surfaces error.message verbatim for failures, and lists
per-probe durations so the supervisor can spot slow probes that bottlenecked
the cowork session.
"""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any


def load_rows(paths: list[Path]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for p in paths:
        with p.open("r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    rows.append(json.loads(line))
                except json.JSONDecodeError as exc:
                    print(
                        f"# WARN: skipping non-JSON line in {p}: {exc}",
                        file=sys.stderr,
                    )
    return rows


def summarize(rows: list[dict[str, Any]]) -> str:
    starts = [r for r in rows if r.get("kind") == "batch:start"]
    ends = [r for r in rows if r.get("kind") == "batch:end"]
    results = [r for r in rows if r.get("kind") == "probe:result"]

    total = len(results)
    failures = [r for r in results if not r.get("ok")]
    passes = [r for r in results if r.get("ok")]

    lines: list[str] = []
    lines.append("# Cowork probe-batch summary")
    lines.append("")
    if starts:
        first = starts[0]
        lines.append(f"- Base URL: `{first.get('baseUrl', '?')}`")
        lines.append(f"- Started: {first.get('startedAt', '?')}")
    if ends:
        lines.append(f"- Ended: {ends[-1].get('endedAt', '?')}")
    lines.append(f"- Probes: {total} ({len(passes)} ok, {len(failures)} failed)")
    lines.append("")

    if failures:
        lines.append("## Failures")
        lines.append("")
        for f in failures:
            err = f.get("error") or {}
            lines.append(
                f"- `{f.get('probe', '?')}` "
                f"({f.get('durationMs', '?')}ms) — "
                f"{err.get('name', 'Error')}: {err.get('message', '?')}"
            )
        lines.append("")

    if passes:
        # Group durations by probe; useful when probes are re-run.
        durations: dict[str, list[int]] = defaultdict(list)
        for p in passes:
            probe = p.get("probe", "?")
            ms = p.get("durationMs")
            if isinstance(ms, int):
                durations[probe].append(ms)
        lines.append("## Pass durations")
        lines.append("")
        for probe, ms_list in sorted(durations.items()):
            avg = sum(ms_list) // len(ms_list)
            lines.append(
                f"- `{probe}` — runs:{len(ms_list)} avg:{avg}ms "
                f"min:{min(ms_list)}ms max:{max(ms_list)}ms"
            )
        lines.append("")

    return "\n".join(lines)


def main() -> int:
    paths = [Path(p) for p in sys.argv[1:]]
    if not paths:
        print("aggregate.py: at least one findings.jsonl path required", file=sys.stderr)
        return 2
    rows = load_rows(paths)
    sys.stdout.write(summarize(rows))
    return 0


if __name__ == "__main__":
    sys.exit(main())
