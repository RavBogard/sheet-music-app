"""Recordings ingest, round 2: guess the songs in services that have no setlist in the app.

    python -X utf8 scripts/recordings/guess.py [<folder> ...]     (default: every skipped folder)

Daniel 2026-11-01 ("go ahead and do those ... see what you can figure out and guess"): the
services skipped in round 1 for having no setlist are cut against the USUAL order of that
kind of service (USUAL below, from the templates and the reviewed 6.19 service) instead of a
real setlist. A song whose title is clearly heard can claim its place out of order, as
with a setlist. Music that matches nothing in the usual order becomes "unknown" for Daniel
to label, with the library titles its words come closest to.

Nothing here is published. It writes .recordings-work/guesses.json and a small review clip
per item (mono AAC in .mp4, which artifact assets accept) under .recordings-work/review2/.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import cut  # noqa: E402
import services as S  # noqa: E402
from pilot import WORK, mix_version, safe_name, service_label, song_uses  # noqa: E402
from textmatch import clean_title, title_score  # noqa: E402
from transcribe import transcribe  # noqa: E402

REVIEW = WORK / "review2"
MIN_SEC = 35.0  # shorter music isn't worth a listen
UNKNOWN_MUSIC_MIN = 0.55  # an unmatched block must be at least this musical to be offered
SUGGEST_MIN = 0.62  # library titles scoring at least this are offered as suggestions

# The usual running order of each kind of service: (chart songId, title). From the
# B'nai Mitzvah / Randy Shabbat morning / Shir Shabbat templates, with the Shir Shabbat
# order corrected by Daniel's 6.19 review.
SAT = [
    ("11w4r08HnXYR-eRFzcMIs-ud4k1Ut1jwB", "Fiddley Tune"),
    ("1t7fPtGbxIVUUaskwynvKjMYactKDbvGq", "Modeh ani - Klepper"),
    ("1VSB3wRDJN_1nvab8nyNG3W65QXup2YQV", "Ma tovu / Hinei ma tov"),
    ("1lhfSuwVN0-QmiaXm-nVQBlgIOX3bGkby", "Psukei d'zimrah"),
    ("1LPfmwfa8On5YHco9nC-dt5IyWk7QO4gV", "Barchu (Friedman)"),
    ("1ds1Ql2M3Fb9LRX-k8tGxbixPHZ756WE0", "Barchu / Ahava raba / V'haeir eineinu"),
    ("1-NNEkYLm4R7PJ7ttd1HVVQ55FYqps5fT", "Shema"),
    ("1oOys8D12_uDOG_2vcssAq8k5PLf4ZhBQ", "Mi chamocha (Moshav)"),
    ("12Q_6mN94HnSFNcDsHZtvzXX2TqXm9sqh", "Adonai sfatai"),
    ("1Mqje155L1D2TpfeoLycAL_pxEs04epFw", "Veshamru"),
    ("1cqxulkFHUjA0-w6tmUwK6t4TnPgLWbpx", "V'Shamru (Old Skool)"),
    ("1jiX9o2PFj6fGb-qDC5Uw5EtOTOnydzWh", "Kedusha"),
    ("c98dd389-724e-4ffe-9eb0-8eed621b782b", "Sim Shalom (Silver)"),
    ("1j0vPyAIniwYKOh3mdo7Tly4WwugWuKLw", "Rtsei"),
    ("1u2g0w4OLjbL5JfjACyL_3kDzUZpaGjng", "Oseh shalom - Nava tehila"),
    ("1czN_ywRWm2bnjIrnNVg7ad4RyynM_GcR", "Mizmor Shiru Ladonai (Hakafah)"),
    ("19FuqP-rbkufIUdAVCGMbXLuvDJKnicZM", "Mi shebeirach"),
    ("1sNPYY73-mI4XBfASJBoHaTwxQH3IHr50", "Eitz chayim - Weisenberg"),
    ("1bOTH11M28N7_c7avQGTYwzhhQlM2vKEK", "Aleinu Shur"),
]
SHIR = [
    ("upload-43de1988-3e69-4d9d-b13b-f95d74170b18", "Lechu Goldman"),
    ("1AIwCXDw1mGHm_uhaoJfbpkri-ibzOLI4", "Shiru L'Adonai"),
    ("1czN_ywRWm2bnjIrnNVg7ad4RyynM_GcR", "Mizmor Shiru Ladonai"),
    ("1EiJJKn3ZmsWnXVYiEjMHQmR17t0ByDbG", "Mizmor l'David"),
    ("19W6W99B9smYQqqZEtU2fYUTLvrV4HjDG", "L'Cha Dodi Dmin"),
    ("upload-e4df5f9c-fd96-4631-9699-c85734ee6df2", "L'Cha Dodi (Nava)"),
    ("19XVik7nlDmoUr8CcBJbjDsecLuqInQ_Z", "Shema (major)"),
    ("b60cd3c4-3e50-4449-a115-c068a81cb75e", "V'Ahavta (Silver)"),
    ("1pToiRfD44ioU26hX8u8c3eayNYc6KOMb", "Mi Chamocha Ana B'Koach"),
    ("12Q_6mN94HnSFNcDsHZtvzXX2TqXm9sqh", "Adonai sfatai (trad)"),
    ("1bOTH11M28N7_c7avQGTYwzhhQlM2vKEK", "Aleinu Shur"),
]
USUAL = {"sat_morning": SAT, "bnei_mitzvah": SAT, "shir_shabbat": SHIR, "friday": SHIR}


def display_title(t: str) -> str:
    t = re.sub(r"(?i)\.(pdf|musicxml|mxl|xml)$", "", t.strip()).replace("_", "'")
    return re.sub(r"\s+", " ", t).strip()


def suggestions(text: str, songs: list[dict], exclude: str | None, n: int = 3) -> list[dict]:
    """Library titles whose words the transcript comes closest to, one chart per title."""
    if not text.strip():
        return []
    scored = sorted(((title_score(s["title"], text), s) for s in songs), key=lambda x: -x[0])
    out, seen = [], set()
    for ts, s in scored:
        if ts < SUGGEST_MIN or len(out) >= n:
            break
        key = clean_title(s["title"])
        if s["songId"] == exclude or key in seen:
            continue
        seen.add(key)
        out.append({"songId": s["songId"], "title": display_title(s["title"])})
    return out


def why_for(seg: cut.Segment) -> str:
    r = seg.reason
    if r.startswith("title sung"):
        why = "I can hear the words of the title."
    elif r.startswith("title partly sung"):
        why = "I can partly hear the title."
    else:
        why = "A guess from where it falls in the usual service; I couldn't hear the title."
    if "out of setlist order" in r:
        why += " It came at an unusual point in the service."
    return why


def encode_review(src: Path, a: float, z: float, out: Path) -> None:
    dur = z - a
    fade = min(1.5, dur / 4)
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{a:.3f}", "-to", f"{z:.3f}", "-i", str(src),
        "-af", f"afade=t=in:st=0:d={fade},afade=t=out:st={max(0.0, dur - fade):.3f}:d={fade}",
        "-vn", "-ac", "1", "-c:a", "aac", "-b:a", "56k", "-movflags", "+faststart", str(out),
    ], check=True)


def item_id(folder: str, file: str, a: float) -> str:
    return hashlib.sha1(f"{folder}|{file}|{a:.2f}".encode()).hexdigest()[:12]


def guess_folder(folder: str, inventory: list[dict], catalog: dict, songs: list[dict]) -> list[dict]:
    entry = next(e for e in inventory if e["folder"] == folder)
    svc = next(iter(S.resolve_services([entry], catalog)))
    kind = svc.kind or ("sat_morning" if "SAT MORNING" in folder.upper() else None)
    usual = USUAL.get(kind or "", [])
    rows = [{"songId": sid, "title": t, "order": i} for i, (sid, t) in enumerate(usual)]
    out: list[dict] = []
    for mp3 in sorted((WORK / "src" / safe_name(folder)).glob("*.mp3")):
        tr = transcribe(mp3)
        label = service_label(kind, svc.day)
        if "REHEARSAL" in mp3.name.upper():
            label = f"High Holiday rehearsal, {svc.day:%b} {svc.day.day}, {svc.day.year}" if svc.day else "Rehearsal"
            rows_here = []
        else:
            rows_here = rows
        duration = float(tr["duration"])
        words = cut.tag_words(tr["segments"])
        if duration < cut.SHORT_FILE_SEC:
            text = " ".join(s["text"] for s in tr["segments"])
            segs = cut.segment_single_song(duration, text, mp3.name, songs)
            blocks = []
        else:
            music = cut.music_per_second(cut.decode_pcm(mp3))
            blocks = cut.build_blocks(duration, cut.detect_silences(mp3), music, words, cut.speech_runs(tr["segments"]))
            segs = cut.segments_with_setlist(blocks, {"tracks": rows_here}, rows_here) if rows_here else [
                cut._dropped(b, "speech" if b.musical < 0.5 else "matched no setlist song") for b in blocks
            ]
        for seg in segs:
            dur = seg.endSec - seg.startSec
            if dur < MIN_SEC:
                continue
            bi, bj = seg.extra.get("blocks", [None, None]) if seg.extra else (None, None)
            text = " ".join(b.sung for b in blocks[bi:bj]) if bi is not None else seg.snippet
            if seg.status == "dropped":
                if seg.reason != "matched no setlist song" and not seg.reason.startswith("single-song"):
                    continue
                blk = next((b for b in blocks if abs(b.start - seg.startSec) < 0.01), None)
                if blk and blk.musical < UNKNOWN_MUSIC_MIN:
                    continue
                text = blk.sung if blk else seg.snippet
                kind_ = "unknown"
                guess = None
                why = "Music I couldn't place in the usual service."
            else:
                kind_ = "guess"
                guess = {"songId": seg.songId, "title": display_title(seg.title)}
                why = why_for(seg) if not seg.reason.startswith("single-song") else "A single-song file; guessed from its file name and words."
            iid = item_id(folder, mp3.name, seg.startSec)
            clip = REVIEW / f"{iid}.mp4"
            if not clip.exists():
                encode_review(mp3, seg.startSec, seg.endSec, clip)
            out.append({
                "id": iid, "kind": kind_, "folder": folder, "file": mp3.name, "mix": mix_version(mp3.name),
                "serviceDate": svc.day.isoformat() if svc.day else None, "service": label,
                "start": seg.startSec, "end": seg.endSec, "guess": guess, "why": why,
                "suggest": suggestions(text, songs, guess["songId"] if guess else None),
                "heard": text[:140], "confidence": seg.confidence, "reason": seg.reason,
                "clip": str(clip.relative_to(WORK)).replace("\\", "/"), "mb": round(clip.stat().st_size / 1e6, 2),
            })
        print(f"{folder}/{mp3.name}: {sum(o['file'] == mp3.name and o['kind'] == 'guess' for o in out)} guesses, "
              f"{sum(o['file'] == mp3.name and o['kind'] == 'unknown' for o in out)} unknown", flush=True)
    return out


def main(folders: list[str]) -> None:
    inventory = json.loads((WORK / "inventory.json").read_text(encoding="utf-8"))
    catalog = json.loads((WORK / "catalog.json").read_text(encoding="utf-8"))
    manifest = json.loads((WORK / "manifest.json").read_text(encoding="utf-8"))
    if not folders:
        folders = [r["folder"] for r in manifest if r["status"] == "skipped"]
    uses = song_uses(catalog)
    songs = [{"songId": s["songId"], "title": s["title"], "uses": uses.get(s["songId"], 0)} for s in catalog["songs"] if s.get("songId")]
    REVIEW.mkdir(parents=True, exist_ok=True)
    path = WORK / "guesses.json"
    items = json.loads(path.read_text(encoding="utf-8")) if path.exists() else []
    for f in folders:
        items = [i for i in items if i["folder"] != f] + guess_folder(f, inventory, catalog, songs)
        path.write_text(json.dumps(items, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(items)} items: {sum(i['kind'] == 'guess' for i in items)} guesses, {sum(i['kind'] == 'unknown' for i in items)} unknown")


if __name__ == "__main__":
    main(sys.argv[1:])
