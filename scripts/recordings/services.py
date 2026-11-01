"""Recordings ingest: service folders → dates → setlists.

parse_folder_date: the date a Dropbox service folder (or mix file) names.
service_kind:      what kind of service a folder name or a setlist describes.
match_setlist:     the one setlist for a service, or None, or 'ambiguous'.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Literal

# Words that can sit in a folder name without naming a person.
_SERVICE_WORDS = {
    "SAT", "SATURDAY", "MORNING", "SHIR", "SHABBAT", "SHABBATS", "FRIDAY", "NIGHT", "EVENING",
    "SERVICE", "SERVICES", "OLD", "PT", "END", "CRC", "MUSIC", "ONLY", "HH", "REHEARSAL",
    "BAR", "BAT", "BNAI", "BNEI", "B'NAI", "B'NEI", "MITZVAH", "V", "MIX",
}

Kind = Literal["shir_shabbat", "friday", "sat_morning", "bnei_mitzvah", "other"]


def _mk(y: int, m: int, d: int) -> date | None:
    try:
        return date(y, m, d)
    except ValueError:
        return None


def _year(yy: int) -> int:
    return 2000 + yy if yy < 100 else yy


def parse_folder_date(name: str, modified: date | None, slack_days: int = 31) -> date | None:
    """The service date a folder or file name carries.

    Shapes: `1.10_SAT MORNING` (m.d), `6.07.25_BEN WORTHINGTON` (m.d.yy), `26.3.27_SHIR SHABBAT`
    and file names like `SAT MORNING_25.06.07_V1` (yy.m.d: a first part over 12 is the year),
    `8.16 - 8.17` (the first day), `6.19` (m.d).

    With no year in the name, the year is the latest one whose date is on or before the file's
    modified date. Dropbox shows "9 months ago" for older files, so `modified` is approximate;
    `slack_days` lets the service date run that far past it.
    """
    m = re.search(r"(?<![\d.])(\d{1,4})\.(\d{1,2})(?:\.(\d{1,4}))?(?![\d.])", name)
    if not m:
        return None
    a, b = int(m.group(1)), int(m.group(2))
    c = int(m.group(3)) if m.group(3) else None
    if c is not None:
        if a > 12:  # yy.m.d
            return _mk(_year(a), b, c)
        return _mk(_year(c), a, b)  # m.d.yy
    if a > 12 or not (1 <= b <= 31):
        return None
    if modified is None:
        return None
    limit = modified + timedelta(days=slack_days)
    for y in range(limit.year, limit.year - 3, -1):
        d = _mk(y, a, b)
        if d and d <= limit:
            return d
    return None


def service_date(folder_leaf: str, file_name: str, modified: date | None) -> date | None:
    """The folder's date, else a date in the mix file's name (`SHIR SHABBAT_V1_25.10.24`)."""
    stem = re.sub(r"(?i)\.(mp3|wav|m4a)$", "", file_name)
    stem = re.sub(r"(?i)(^|[_ -])V\d+(?=[_ -]|$)", r"\1", stem)
    return parse_folder_date(folder_leaf, modified) or parse_folder_date(stem, modified)


def kind_from_folder(name: str) -> Kind | None:
    """`SHIR SHABBAT` → shir_shabbat; `SAT MORNING` → sat_morning; a person's name or
    `BAR MITZVAH` → bnei_mitzvah; a bare date → None (no hint)."""
    up = re.sub(r"\.(mp3|wav|m4a)$", "", name, flags=re.I).upper()
    if "SHIR SHABBAT" in up:
        return "shir_shabbat"
    if re.search(r"\bB'?(AR|AT|NAI|NEI)\s+MITZVAH", up):
        return "bnei_mitzvah"
    words = [w for w in re.split(r"[^A-Z']+", up) if w]
    if any(w not in _SERVICE_WORDS for w in words):
        return "bnei_mitzvah"  # a person-named folder is a B'nai Mitzvah
    if "SAT" in words or "SATURDAY" in words:
        return "sat_morning"
    if "FRIDAY" in words:
        return "friday"
    return None


def setlist_kind(s: dict) -> Kind:
    t = (s.get("templateType") or "").lower().replace("-", "_")
    occ = (s.get("occasion") or "").lower()
    name = (s.get("name") or "").lower()
    if t == "shir_shabbat" or "shir shabbat" in name:
        return "shir_shabbat"
    if t.startswith("bnei_mitzvah") or occ == "bnei-mitzvah" or "mitzvah" in name:
        return "bnei_mitzvah"
    if t in ("friday_night", "kabbalat_shabbat") or "friday" in name or "kabbalat" in name:
        return "friday"
    if t == "shabbat_morning" or "shabbat morning" in name:
        return "sat_morning"
    return "other"


# A folder hint accepts these setlist kinds, best first.
_COMPATIBLE: dict[str, tuple[str, ...]] = {
    "shir_shabbat": ("shir_shabbat", "friday"),
    "friday": ("friday", "shir_shabbat"),
    "sat_morning": ("sat_morning", "bnei_mitzvah"),
    "bnei_mitzvah": ("bnei_mitzvah", "sat_morning"),
}


def song_rows(s: dict) -> list[dict]:
    """The rows a recording can be cut for: songs (type `song` or absent)."""
    return [t for t in s.get("tracks", []) if (t.get("type") or "song") == "song"]


def match_setlist(day: date, kind_hint: str | None, catalog: dict) -> dict | None | Literal["ambiguous"]:
    """The setlist for a service on `day`.

    Only setlists with at least one song row count (an empty stub can't guide the cut).
    Several on one day: the folder's kind picks (exact kind first, then a compatible one).
    If that still leaves more than one, the answer is 'ambiguous' and the caller holds the
    whole service: two setlists are never mixed.
    """
    iso = day.isoformat()
    cands = [s for s in catalog.get("setlists", []) if (s.get("eventDate") or "")[:10] == iso and song_rows(s)]
    if not cands:
        return None
    if kind_hint is None:
        return cands[0] if len(cands) == 1 else "ambiguous"
    for k in _COMPATIBLE.get(kind_hint, (kind_hint,)):
        hits = [s for s in cands if setlist_kind(s) == k]
        if len(hits) == 1:
            return hits[0]
        if len(hits) > 1:
            return "ambiguous"
    return None


@dataclass
class Service:
    folder: str
    leaf: str
    files: list[dict]
    day: date | None = None
    kind: str | None = None
    setlist: dict | None | str = None
    notes: list[str] = field(default_factory=list)


def resolve_services(inventory: list[dict], catalog: dict) -> list[Service]:
    """Every inventory folder with its date, kind and setlist (for the inventory summary)."""
    out: list[Service] = []
    for e in inventory:
        mp3s = [f for f in e["files"] if f["name"].lower().endswith(".mp3")]
        if not mp3s:
            continue
        mod = mp3s[0].get("modifiedApprox")
        modified = date.fromisoformat(mod) if mod else None
        svc = Service(folder=e["folder"], leaf=e.get("leaf") or e["folder"].split("/")[-1], files=e["files"])
        svc.day = service_date(svc.leaf, mp3s[0]["name"], modified)
        svc.kind = kind_from_folder(svc.leaf) or kind_from_folder(mp3s[0]["name"])
        if e["folder"].upper().startswith("SHIR SHABBATS/") and svc.kind is None:
            svc.kind = "shir_shabbat"
        svc.setlist = match_setlist(svc.day, svc.kind, catalog) if svc.day else None
        out.append(svc)
    return out
