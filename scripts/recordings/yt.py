"""Recordings ingest from the congregation's YouTube channel: every service is there, dated.

    python -X utf8 scripts/recordings/yt.py plan                 # match videos to setlists -> yt-plan.json
    python -X utf8 scripts/recordings/yt.py run [--limit N]      # download, transcribe, cut each planned video
    python -X utf8 scripts/recordings/yt.py run --id <videoId>   # just that one (re-cuts it if already done)

Daniel 2026-11-01: "literally every service is available dated on youtube, so we could go and
match known setlists". A video is used only when its title date has exactly one setlist of
a compatible kind in the app (the per-instrument copies of a setlist don't count). Its audio
is then cut against that setlist, exactly as the Dropbox board mixes were (cut.py).

Reads .recordings-work/{yt-streams,yt-videos}.tsv (yt-dlp --flat-playlist: id, duration,
title) and catalog.json. Audio goes to src/YT__<date>__<id>/; clips to clips/; rows are
merged into manifest-yt.json in the pilot's manifest shape, so publish.ts can take them.
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import time
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import cut  # noqa: E402
import encode  # noqa: E402
import services as S  # noqa: E402
from pilot import WORK, service_label, slug, song_uses  # noqa: E402
from transcribe import transcribe  # noqa: E402

FROM, TO = date(2026, 3, 1), date(2026, 11, 1)  # the months with real setlists in the app
DONE_FROM_DROPBOX = {date(2026, 6, 19)}  # the board mix is better than the stream
MIN_VIDEO_SEC = 1200  # shorter uploads are clips and highlights, not services


def title_date(title: str) -> date | None:
    m = re.search(r"(\d{1,2})/(\d{1,2})/(\d{2,4})\b", title)
    if not m:
        return None
    mo, d, y = (int(x) for x in m.groups())
    y = y + 2000 if y < 100 else y
    try:
        return date(y, mo, d)
    except ValueError:
        return None


def title_kind(title: str) -> str | None:
    t = title.lower()
    if "shir shabbat" in t or "shir keter" in t:
        return "shir_shabbat"
    if "mitzvah" in t:
        return "bnei_mitzvah"
    if "shabbat morning" in t:
        return "sat_morning"
    if "kabbalat shabbat" in t or "erev rav shabbat" in t or "pride shabbat" in t or "rights shabbat" in t:
        return "friday"
    return None  # holidays and specials: only a lone setlist that day matches


def real_setlists(catalog: dict) -> dict:
    """The catalog without per-instrument packet copies ("… · Bb") and "(Copy)" duplicates."""
    keep = [s for s in catalog["setlists"] if " · " not in s.get("name", "") and "(copy)" not in s.get("name", "").lower()]
    return {**catalog, "setlists": keep}


_STOP = {"of", "the", "and", "a", "w", "with", "shabbat", "service", "services", "morning", "day"}


def _words(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z]+", text.lower().replace("'", "")) if w not in _STOP and len(w) > 1}


def by_name(title: str, day: date, catalog: dict) -> dict | str:
    """Several setlists that day (a holiday): the one whose name shares the most words with
    the video title, when that is a clear winner. Two of the same name: the fuller one."""
    iso = day.isoformat()
    cands = [s for s in catalog["setlists"] if (s.get("eventDate") or "")[:10] == iso and S.song_rows(s) and same_service(title, s["name"])]
    if cands and all(_words(c["name"]) == _words(cands[0]["name"]) for c in cands):
        return max(cands, key=lambda c: len(S.song_rows(c)))  # one service saved twice: the fuller copy
    scored = sorted(((len(_words(title) & _words(s["name"])), len(S.song_rows(s)), s) for s in cands), key=lambda x: (-x[0], -x[1]))
    if not scored or scored[0][0] == 0:
        return "ambiguous"
    if len(scored) > 1 and scored[1][0] == scored[0][0]:
        if _words(scored[0][2]["name"]) != _words(scored[1][2]["name"]):
            return "ambiguous"
    return scored[0][2]


# Words that mark a service apart from a regular Shabbat: a video and a setlist disagreeing
# on one of these are different services on the same day (S'lichot vs Shabbat morning,
# a Camp Sabra weekend vs the shul).
_MARKERS = ("slichot", "selichot", "camp", "sabra", "crown", "havdalah", "concert", "children", "alternative")


def same_service(title: str, name: str) -> bool:
    t, n = title.lower().replace("'", ""), name.lower().replace("'", "")
    return all((m in t) == (m in n) for m in _MARKERS)


def plan() -> None:
    catalog = real_setlists(json.loads((WORK / "catalog.json").read_text(encoding="utf-8")))
    videos = []
    for f in ("yt-streams.tsv", "yt-videos.tsv"):
        for line in (WORK / f).read_text(encoding="utf-8", errors="replace").splitlines():
            vid, dur, title = (line.split("\t") + ["", ""])[:3]
            videos.append({"id": vid, "sec": float(dur) if dur not in ("", "NA") else 0.0, "title": title})
    out, skipped = [], []
    for v in videos:
        day = title_date(v["title"])
        if not day or not (FROM <= day <= TO) or day in DONE_FROM_DROPBOX or v["sec"] < MIN_VIDEO_SEC:
            continue
        kind = title_kind(v["title"])
        sl = S.match_setlist(day, kind, catalog)
        if sl == "ambiguous":
            sl = by_name(v["title"], day, catalog)
        if isinstance(sl, dict) and not same_service(v["title"], sl["name"]):
            sl = "a different service that day"
        if not isinstance(sl, dict):
            skipped.append({**v, "day": day.isoformat(), "why": sl or "no setlist"})
            continue
        out.append({**v, "day": day.isoformat(), "kind": kind or S.setlist_kind(sl), "setlistId": sl["id"], "setlistName": sl["name"],
                    "songs": len([r for r in S.song_rows(sl) if r.get("songId")])})
    out.sort(key=lambda x: x["day"])
    (WORK / "yt-plan.json").write_text(json.dumps({"planned": out, "skipped": skipped}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(out)} videos matched to a setlist ({sum(v['sec'] for v in out) / 3600:.1f} h); {len(skipped)} skipped")
    for v in out:
        print(f"  {v['day']} {v['title'][:45]:45} -> {v['setlistName'][:45]} ({v['songs']} songs)")
    for v in skipped:
        print(f"  skip {v['day']} {v['title'][:45]:45} ({v['why']})")


def download(v: dict) -> Path:
    d = WORK / "src" / f"YT__{v['day']}__{v['id']}"
    d.mkdir(parents=True, exist_ok=True)
    have = list(d.glob(f"{v['id']}.*"))
    if have:
        return have[0]
    subprocess.run([sys.executable, "-m", "yt_dlp", "-q", "--no-warnings", "-f", "bestaudio[ext=m4a]/bestaudio",
                    "-o", str(d / "%(id)s.%(ext)s"), f"https://www.youtube.com/watch?v={v['id']}"], check=True)
    return next(d.glob(f"{v['id']}.*"))


def run_video(v: dict, catalog: dict, songs: list[dict]) -> list[dict]:
    sl = next(s for s in catalog["setlists"] if s["id"] == v["setlistId"])
    rows_ = S.song_rows(sl)
    src = download(v)
    t0 = time.time()
    tr = transcribe(src)
    segs, blocks = cut.cut_service(src, sl, songs, rows_, tr)
    day = date.fromisoformat(v["day"])
    folder = f"YOUTUBE/{v['day']}/{v['id']}"
    clip_dir = WORK / "clips" / f"YT__{v['day']}__{v['id']}"
    shutil.rmtree(clip_dir, ignore_errors=True)
    rows = []
    for n, seg in enumerate(segs):
        if seg.status != "dropped" and not seg.songId:
            seg.status = "dropped"
            seg.reason = f"matched '{seg.title}', which has no chart; " + seg.reason
        clip = None
        if seg.status != "dropped":
            clip = clip_dir / f"{n:02d}_{slug(seg.title)}_{int(seg.startSec)}.mp3"
            encode.encode_clip(src, seg.startSec, seg.endSec, clip)
        rows.append({
            "folder": folder, "file": src.name, "mix": "youtube", "youtubeId": v["id"], "youtubeTitle": v["title"],
            "serviceDate": v["day"], "kind": v["kind"], "label": service_label(v["kind"], day),
            "setlistId": sl["id"], "setlistName": sl["name"], "setlistState": "matched",
            "whisperSec": tr.get("seconds"), "whisperModel": tr.get("model"), "sourceSec": tr.get("duration"),
            "clip": str(clip.relative_to(WORK)).replace("\\", "/") if clip else None, **seg.to_dict(),
        })
    print(f"{v['day']} {v['title'][:40]}: {len(blocks)} blocks, {sum(r['status'] == 'live' for r in rows)} live, "
          f"{sum(r['status'] == 'held' for r in rows)} held ({time.time() - t0:.0f}s)", flush=True)
    return rows


def run(limit: int | None, only: str | None = None) -> None:
    p = json.loads((WORK / "yt-plan.json").read_text(encoding="utf-8"))["planned"]
    catalog = real_setlists(json.loads((WORK / "catalog.json").read_text(encoding="utf-8")))
    uses = song_uses(catalog)
    songs = [{"songId": s["songId"], "title": s["title"], "uses": uses.get(s["songId"], 0)} for s in catalog["songs"] if s.get("songId")]
    mpath = WORK / "manifest-yt.json"
    manifest = json.loads(mpath.read_text(encoding="utf-8")) if mpath.exists() else []
    done = {r["youtubeId"] for r in manifest}
    todo = [v for v in reversed(p) if v["id"] not in done][: limit or None]  # newest first: the current repertoire
    if only:
        todo = [v for v in p if v["id"] == only]
    for v in todo:
        try:
            rows = run_video(v, catalog, songs)
        except Exception as e:  # one bad video must not stop the night's run
            print(f"{v['day']} {v['id']}: FAILED {e}", flush=True)
            continue
        manifest = [r for r in manifest if r["youtubeId"] != v["id"]] + rows
        mpath.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    if sys.argv[1:2] == ["plan"]:
        plan()
    elif sys.argv[1:2] == ["run"]:
        run(int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else None,
            sys.argv[sys.argv.index("--id") + 1] if "--id" in sys.argv else None)
    else:
        raise SystemExit(__doc__)
