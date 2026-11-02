"""Lived-service timelines: what actually happened in each recorded service, and for how long.

    python -X utf8 scripts/recordings/timeline.py            # -> <work>/timelines.json

Daniel 2026-11-01: "are we using these things to gather data on lived services? we should".
Built from what the cutter already wrote to manifest-yt.json: every ~30 s block of a service
with its music share, the song it was matched to (live or held) and a transcript snippet.
Each block gets a kind, neighbours of the same kind merge into segments, and each service
gets totals. Heuristic, not a ruling: a held song name is the cutter's guess until reviewed.

Kinds: song (matched to a setlist row), music (sung or played, unnamed), torah, teaching
(one speaker for 5+ minutes), announcements, speech, quiet; "before" and "after" for the
room before the service starts and after it ends.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pilot import WORK  # noqa: E402

TORAH = re.compile(r"torah|aliyah|aliyot|parash|haftar|asher bachar|hamevorach|v'?zot ha|etz chayim|eitz chayim|hagbah|chumash|scroll", re.I)
ANNOUNCE = re.compile(r"announce|kiddush|oneg|please join us|join us (for|after)|sign up|next week|thank you all for coming|lunch", re.I)
START = re.compile(r"good shabbo|shabbat shalom|we begin|welcome,? everyone|welcome to", re.I)
TORAH_OPEN = re.compile(r"torah service|take (out )?the torah|open(ing)? the ark|the ark|aron|hakaf|stand as we take|aliyah|aliyot|ya.?amod|hamevorach", re.I)
TORAH_SPAN_MAX_SEC = 70 * 60
EITZ = re.compile(r"e[i]?tz chayim|etz chaim", re.I)
HEBREW = re.compile(r"[֐-׿]")
TEACHING_MIN_SEC = 300
MUSIC_SHARE = 0.6


def block_kind(r: dict) -> str:
    if r["status"] in ("live", "held") and r.get("title"):
        return "song"
    text = r.get("snippet") or ""
    mus = r.get("music") or 0.0
    if TORAH.search(text) or (HEBREW.search(text) and mus < MUSIC_SHARE):
        return "torah"
    if mus >= MUSIC_SHARE:
        return "music"
    if ANNOUNCE.search(text):
        return "announcements"
    if not text.strip() or text.strip() in ("Thank you.", "you"):
        return "quiet"
    return "speech"


def segments_for(rows: list[dict]) -> list[dict]:
    rows = sorted(rows, key=lambda r: r["startSec"])
    blocks = [{"kind": block_kind(r), "start": r["startSec"], "end": r["endSec"],
               "title": r.get("title") if r["status"] in ("live", "held") else None,
               "status": r["status"], "snippet": (r.get("snippet") or "")[:120]} for r in rows]
    # Service start: the first greeting, or the first named song, whichever comes first.
    first = next((i for i, b in enumerate(blocks) if b["kind"] == "song" or START.search(b["snippet"])), 0)
    for b in blocks[:first]:
        b["kind"] = "before"
    # The Torah service is one span: from its first sign to Eitz Chayim (or the last Torah
    # mention). Unnamed talk and music inside it are the reading, aliyot and blessings.
    opens = [i for i, b in enumerate(blocks) if b["kind"] == "torah" and TORAH_OPEN.search(b["snippet"])]
    if opens:
        a = opens[0]
        limit = blocks[a]["start"] + TORAH_SPAN_MAX_SEC
        hits = [i for i, b in enumerate(blocks) if i >= a and b["kind"] == "torah" and b["start"] <= limit]
        z = next((i for i, b in enumerate(blocks) if i > a and b["start"] <= limit and b["kind"] == "song"
                  and EITZ.search(b["title"] or "")), hits[-1])
        for b in blocks[a : z + 1]:
            if b["kind"] != "song":
                b["kind"] = "torah"
    # Service end: after the last song or announcement, trailing talk and quiet is the room.
    last = max((i for i, b in enumerate(blocks) if b["kind"] in ("song", "announcements", "music")), default=len(blocks) - 1)
    for b in blocks[last + 1:]:
        b["kind"] = "after"
    segs: list[dict] = []
    for b in blocks:
        same = segs and segs[-1]["kind"] == b["kind"] and b["kind"] != "song"
        if same:
            segs[-1]["end"] = b["end"]
            segs[-1]["snippets"].append(b["snippet"])
        else:
            segs.append({"kind": b["kind"], "start": b["start"], "end": b["end"], "title": b["title"],
                         "status": b["status"], "snippets": [b["snippet"]]})
    for s in segs:
        if s["kind"] == "speech" and s["end"] - s["start"] >= TEACHING_MIN_SEC:
            s["kind"] = "teaching"
    # Short quiet gaps inside the service are part of whatever surrounds them.
    out: list[dict] = []
    for s in segs:
        if out and s["kind"] == "quiet" and s["end"] - s["start"] < 60:
            out[-1]["end"] = s["end"]
            continue
        if out and out[-1]["kind"] == s["kind"] and s["kind"] != "song":
            out[-1]["end"] = s["end"]
            out[-1]["snippets"] += s["snippets"]
            continue
        out.append(s)
    for s in out:
        s["sec"] = round(s["end"] - s["start"])
        s["start"], s["end"] = round(s["start"]), round(s["end"])
        s["snippet"] = next((t for t in s.pop("snippets") if t.strip() and t.strip() != "Thank you."), "")
    return out


def summary(segs: list[dict]) -> dict:
    inside = [s for s in segs if s["kind"] not in ("before", "after")]
    by: dict[str, int] = {}
    for s in inside:
        by[s["kind"]] = by.get(s["kind"], 0) + s["sec"]
    return {
        "startSec": inside[0]["start"] if inside else 0,
        "lengthSec": (inside[-1]["end"] - inside[0]["start"]) if inside else 0,
        "byKind": by,
        "songs": sum(1 for s in inside if s["kind"] == "song"),
        "longestTeachingSec": max((s["sec"] for s in inside if s["kind"] == "teaching"), default=0),
    }


def main() -> None:
    man = json.loads((WORK / "manifest-yt.json").read_text(encoding="utf-8"))
    services: dict[str, list[dict]] = {}
    for r in man:
        services.setdefault(r["youtubeId"], []).append(r)
    out = []
    for vid, rows in services.items():
        r0 = rows[0]
        segs = segments_for(rows)
        out.append({"youtubeId": vid, "date": r0["serviceDate"], "kind": r0["kind"], "title": r0["youtubeTitle"],
                    "setlistName": r0["setlistName"], "sourceSec": r0.get("sourceSec"),
                    "summary": summary(segs), "segments": segs})
    out.sort(key=lambda s: s["date"])
    (WORK / "timelines.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    for s in out:
        m = s["summary"]
        kinds = ", ".join(f"{k} {v // 60}m" for k, v in sorted(m["byKind"].items(), key=lambda kv: -kv[1]))
        print(f"{s['date']} {s['kind']:13} {m['lengthSec'] // 60:3d} min, {m['songs']:2d} songs | {kinds}")


if __name__ == "__main__":
    main()
