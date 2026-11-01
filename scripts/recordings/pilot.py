"""Recordings ingest: run cut → match → encode for some service folders and write the manifest.

    python -I scripts/recordings/pilot.py "SHIR SHABBATS/6.19" "SERVICES/7.26.25" ...

Reads .recordings-work/{inventory,catalog}.json and the MP3s fetch_dropbox.mjs downloaded
into .recordings-work/src/<folder>/. Writes clips to .recordings-work/clips/<folder>/ and
merges rows into .recordings-work/manifest.json (one row per segment, dropped ones too, so
the report can count them). Nothing is published from here.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import sys
import time
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import cut  # noqa: E402
import encode  # noqa: E402
import services as S  # noqa: E402
from transcribe import transcribe  # noqa: E402

WORK = Path(os.environ.get("RECORDINGS_WORK", ".recordings-work")).resolve()

KIND_LABEL = {
    "shir_shabbat": "Shir Shabbat",
    "friday": "Friday night",
    "sat_morning": "Shabbat morning",
    "bnei_mitzvah": "B'nai Mitzvah",
    None: "Service",
}


def safe_name(folder: str) -> str:
    return re.sub(r'[<>:"\\|?*]', "_", folder).replace("/", "__")


def mix_version(name: str) -> str | None:
    m = re.search(r"(?i)(?:^|[_ -])(V\d+)(?=[_ -.]|$)", name)
    return m.group(1).upper() if m else None


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:40] or "clip"


def service_label(kind: str | None, day: date | None) -> str:
    when = f"{day:%b} {day.day}, {day.year}" if day else "undated"
    return f"{KIND_LABEL.get(kind, 'Service')}, {when}"


def run_folder(folder: str, inventory: list[dict], catalog: dict) -> list[dict]:
    entry = next(e for e in inventory if e["folder"] == folder)
    svc = next(s for s in S.resolve_services([entry], catalog))
    src_dir = WORK / "src" / safe_name(folder)
    mp3s = sorted(src_dir.glob("*.mp3"))
    if not mp3s:
        raise SystemExit(f"no downloaded MP3 in {src_dir}; run fetch_dropbox.mjs download first")
    songs = [{"songId": s["songId"], "title": s["title"]} for s in catalog["songs"] if s.get("songId")]
    setlist = svc.setlist
    rows_ = S.song_rows(setlist) if isinstance(setlist, dict) else None
    rows: list[dict] = []
    shutil.rmtree(WORK / "clips" / safe_name(folder), ignore_errors=True)  # a re-run re-cuts
    for mp3 in mp3s:
        t0 = time.time()
        tr = transcribe(mp3)
        segs, blocks = cut.cut_service(mp3, setlist, songs, rows_, tr)
        clip_dir = WORK / "clips" / safe_name(folder)
        for n, seg in enumerate(segs):
            if seg.status != "dropped" and not seg.songId:
                seg.status = "dropped"
                seg.reason = f"matched '{seg.title}', which has no chart; " + seg.reason
            clip = None
            if seg.status != "dropped":
                clip = clip_dir / f"{n:02d}_{slug(seg.title)}_{int(seg.startSec)}.mp3"
                if not clip.exists():
                    encode.encode_clip(mp3, seg.startSec, seg.endSec, clip)
            rows.append(
                {
                    "folder": folder,
                    "file": mp3.name,
                    "mix": mix_version(mp3.name),
                    "serviceDate": svc.day.isoformat() if svc.day else None,
                    "kind": svc.kind,
                    "label": service_label(svc.kind, svc.day),
                    "setlistId": setlist["id"] if isinstance(setlist, dict) else None,
                    "setlistName": setlist["name"] if isinstance(setlist, dict) else None,
                    "setlistState": "matched" if isinstance(setlist, dict) else (setlist or "none"),
                    "whisperSec": tr.get("seconds"),
                    "whisperModel": tr.get("model"),
                    "sourceSec": tr.get("duration"),
                    "clip": str(clip.relative_to(WORK)).replace("\\", "/") if clip else None,
                    **seg.to_dict(),
                }
            )
        print(f"{folder}/{mp3.name}: {len(blocks)} blocks, "
              f"{sum(r['status'] == 'live' for r in rows)} live, {sum(r['status'] == 'held' for r in rows)} held, "
              f"{sum(r['status'] == 'dropped' for r in rows)} dropped ({time.time() - t0:.0f}s)")
    return rows


def main(folders: list[str]) -> None:
    inventory = json.loads((WORK / "inventory.json").read_text(encoding="utf-8"))
    catalog = json.loads((WORK / "catalog.json").read_text(encoding="utf-8"))
    mpath = WORK / "manifest.json"
    manifest = json.loads(mpath.read_text(encoding="utf-8")) if mpath.exists() else []
    for f in folders:
        manifest = [r for r in manifest if r["folder"] != f] + run_folder(f, inventory, catalog)
    mpath.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1:])
