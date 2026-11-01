"""Recordings ingest: the spot-check report from .recordings-work/manifest.json.

    python -I scripts/recordings/report.py [--date YYYY-MM-DD]

Writes .recordings-work/report-<date>.md and .recordings-work/spotcheck-<date>.html. Per
service: the setlist matched, clips live / held / dropped, held ones first; each clip with
its song, confidence, reason and a local player (clip paths are relative to the work dir,
so the page plays straight from disk before anything is published).
"""
from __future__ import annotations

import html
import json
import os
import sys
from collections import OrderedDict
from datetime import date
from pathlib import Path

WORK = Path(os.environ.get("RECORDINGS_WORK", ".recordings-work")).resolve()
ORDER = {"held": 0, "live": 1, "dropped": 2}


def fmt_t(sec: float) -> str:
    sec = int(sec)
    return f"{sec // 3600}:{sec % 3600 // 60:02d}:{sec % 60:02d}" if sec >= 3600 else f"{sec // 60}:{sec % 60:02d}"


def group(manifest: list[dict]) -> "OrderedDict[str, list[dict]]":
    out: OrderedDict[str, list[dict]] = OrderedDict()
    for r in manifest:
        out.setdefault(r["folder"], []).append(r)
    for rows in out.values():
        rows.sort(key=lambda r: (ORDER.get(r["status"], 3), r["startSec"]))
    return out


def counts(rows: list[dict]) -> dict:
    return {k: sum(r["status"] == k for r in rows) for k in ("live", "held", "dropped")}


def setlist_line(r: dict) -> str:
    st = r.get("setlistState")
    if st == "matched":
        return f"setlist: {r['setlistName']}"
    if st == "ambiguous":
        return "setlist: ambiguous (several on this date); every clip held"
    return "setlist: none with songs on this date; library titles only"


def render_md(manifest: list[dict], day: str) -> str:
    lines = [f"# Recordings ingest report, {day}", ""]
    for folder, rows in group(manifest).items():
        c = counts(rows)
        r0 = rows[0]
        files = sorted({r["file"] for r in rows})
        whisper = sum({r["file"]: r.get("whisperSec") or 0 for r in rows}.values())
        lines += [
            f"## {r0['label']} ({folder})",
            "",
            f"- {setlist_line(r0)}",
            f"- source: {', '.join(files)} ({fmt_t(sum({r['file']: r.get('sourceSec') or 0 for r in rows}.values()))}); whisper {whisper:.0f}s ({r0.get('whisperModel')})",
            f"- clips: {c['live']} live, {c['held']} held, {c['dropped']} dropped",
            "",
            "| status | song | in source | conf | reason |",
            "|---|---|---|---|---|",
        ]
        for r in rows:
            if r["status"] == "dropped" and not r.get("title"):
                continue
            lines.append(
                f"| {r['status']} | {r['title'] or '-'} | {fmt_t(r['startSec'])}–{fmt_t(r['endSec'])} | {r['confidence']:.2f} | {r['reason']} |"
            )
        dropped = [r for r in rows if r["status"] == "dropped" and not r.get("title")]
        if dropped:
            lines.append(f"\nDropped (not songs or no match): {len(dropped)} stretches, {fmt_t(sum(r['endSec'] - r['startSec'] for r in dropped))} total.")
        lines.append("")
    return "\n".join(lines)


CSS = """
:root{--bg:#fbfaf7;--ink:#1d1b18;--mute:#6b665e;--line:#e4e0d8;--held:#a3540b;--live:#1f6f43;--drop:#8a8580;--card:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#141311;--ink:#ece8e1;--mute:#a19b92;--line:#2c2a26;--held:#f0a35e;--live:#6fcf97;--drop:#77726b;--card:#1c1b18}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:980px;margin:0 auto;padding:24px 16px 64px}h1{font-size:22px;margin:0 0 4px}h2{font-size:18px;margin:32px 0 4px}
.meta{color:var(--mute);font-size:13px;margin:0 0 12px}.counts span{margin-right:12px}
.clip{display:grid;grid-template-columns:72px 1fr;gap:4px 12px;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:var(--card);margin:8px 0}
.st{font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.04em}.st.held{color:var(--held)}.st.live{color:var(--live)}.st.dropped{color:var(--drop)}
.title{font-weight:600}.why{color:var(--mute);font-size:13px}.snip{color:var(--mute);font-size:12px;font-style:italic}
audio{width:100%;height:36px;grid-column:2}details{margin:8px 0;color:var(--mute)}
"""


def render_html(manifest: list[dict], day: str) -> str:
    e = html.escape
    parts = [f"<!doctype html><html lang=en><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>"
             f"<title>Recordings spot-check</title><style>{CSS}</style><main><h1>Recordings spot-check</h1>"
             f"<p class=meta>{e(day)} · held clips first · nothing here is published yet</p>"]
    for folder, rows in group(manifest).items():
        c = counts(rows)
        r0 = rows[0]
        parts.append(f"<h2>{e(r0['label'])}</h2><p class=meta>{e(folder)} · {e(setlist_line(r0))}<br>"
                     f"<span class=counts><span>{c['live']} live</span><span>{c['held']} held</span><span>{c['dropped']} dropped</span></span></p>")
        kept = [r for r in rows if r["status"] != "dropped"]
        dropped = [r for r in rows if r["status"] == "dropped"]
        for r in kept:
            parts.append(
                f"<div class=clip><div class='st {r['status']}'>{r['status']}<br>{r['confidence']:.2f}</div>"
                f"<div><div class=title>{e(r['title'])}</div><div class=why>{fmt_t(r['startSec'])}–{fmt_t(r['endSec'])} in {e(r['file'])} · {e(r['reason'])}</div></div>"
                f"<div></div><audio controls preload=none src='{e(r['clip'])}'></audio></div>"
            )
        if dropped:
            parts.append(f"<details><summary>{len(dropped)} dropped stretches</summary>")
            for r in dropped:
                parts.append(f"<div class=why>{fmt_t(r['startSec'])}–{fmt_t(r['endSec'])} · {e(r['reason'])}</div>")
            parts.append("</details>")
    parts.append("</main></html>")
    return "".join(parts)


def main(argv: list[str]) -> None:
    day = argv[argv.index("--date") + 1] if "--date" in argv else date.today().isoformat()
    manifest = json.loads((WORK / "manifest.json").read_text(encoding="utf-8"))
    (WORK / f"report-{day}.md").write_text(render_md(manifest, day), encoding="utf-8")
    (WORK / f"spotcheck-{day}.html").write_text(render_html(manifest, day), encoding="utf-8")
    print(WORK / f"spotcheck-{day}.html")


if __name__ == "__main__":
    main(sys.argv[1:])
