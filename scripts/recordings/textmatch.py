"""Recordings ingest: how well a stretch of transcript matches a song title.

Whisper writes sung Hebrew in Hebrew script, in a Latin transliteration, or (often) as
English-ish phonetics. Chart titles are Latin transliterations with composer tags and file
noise ("L'Cha Dodi Dmin .pdf", "Shema (major).pdf"). So a title is compared two ways:
  - as cleaned Latin words (partial fuzzy match), and
  - as a consonant skeleton, which lines up Hebrew script with its transliteration
    (לכה דודי → LKDD; "L'cha Dodi" → LKDD).
"""
from __future__ import annotations

import re
import unicodedata

try:
    from rapidfuzz import fuzz

    def _partial(a: str, b: str) -> float:
        return fuzz.partial_ratio(a, b) / 100.0

    def _ratio(a: str, b: str) -> float:
        return fuzz.ratio(a, b) / 100.0

except ImportError:  # pragma: no cover - difflib fallback
    from difflib import SequenceMatcher

    def _ratio(a: str, b: str) -> float:
        return SequenceMatcher(None, a, b).ratio()

    def _partial(a: str, b: str) -> float:
        short, long_ = (a, b) if len(a) <= len(b) else (b, a)
        if not short:
            return 0.0
        n = len(short)
        best = 0.0
        for i in range(0, max(1, len(long_) - n + 1), max(1, n // 4)):
            best = max(best, SequenceMatcher(None, short, long_[i : i + n]).ratio())
        return best


_NOISE_WORDS = {
    "pdf", "musicxml", "mxl", "xml", "chart", "lead", "sheet", "v1", "v2", "v3", "final", "copy",
    "trad", "traditional", "major", "minor", "walkdown", "version", "arr", "key", "in",
}
_KEY_TOKEN = re.compile(r"^[a-g](#|b|m|min|maj)?$", re.I)


def clean_title(title: str) -> str:
    """'L'Cha Dodi Dmin .pdf' → 'lcha dodi'; 'Shema (major).pdf' → 'shema'."""
    t = re.sub(r"\.(pdf|musicxml|mxl|xml|png|jpe?g)$", "", title.strip(), flags=re.I)
    t = re.sub(r"\([^)]*\)|\[[^\]]*\]", " ", t)  # composer / version tags
    t = t.replace("_", "'")
    t = unicodedata.normalize("NFKD", t)
    t = "".join(c for c in t if not unicodedata.combining(c))
    t = re.sub(r"['’`]", "", t.lower())
    words = [w for w in re.split(r"[^a-z0-9]+", t) if w]
    words = [w for w in words if w not in _NOISE_WORDS and not _KEY_TOKEN.match(w)]
    # "Dmin" style key suffixes glued to the last word
    if words and re.fullmatch(r"[a-g](min|maj|m)", words[-1]):
        words.pop()
    return " ".join(words)


_HEB = {
    "א": "", "ב": "B", "ג": "G", "ד": "D", "ה": "", "ו": "", "ז": "Z", "ח": "K", "ט": "T", "י": "",
    "כ": "K", "ך": "K", "ל": "L", "מ": "M", "ם": "M", "נ": "N", "ן": "N", "ס": "S", "ע": "", "פ": "P",
    "ף": "P", "צ": "Z", "ץ": "Z", "ק": "K", "ר": "R", "ש": "S", "ת": "T",
}
_LAT = [
    ("tz", "Z"), ("ts", "Z"), ("sh", "S"), ("ch", "K"), ("kh", "K"), ("ph", "P"), ("th", "T"),
    ("ck", "K"), ("c", "K"), ("q", "K"), ("k", "K"), ("x", "KS"), ("v", "B"), ("w", ""), ("f", "P"),
    ("j", "G"), ("b", "B"), ("d", "D"), ("g", "G"), ("l", "L"), ("m", "M"), ("n", "N"), ("p", "P"),
    ("r", "R"), ("s", "S"), ("t", "T"), ("z", "Z"),
]


def skeleton(text: str) -> str:
    """Consonant skeleton shared by Hebrew script and its Latin transliteration."""
    out: list[str] = []
    for word in re.split(r"\s+", text.lower()):
        if not word:
            continue
        if any("֐" <= c <= "׿" for c in word):
            sk = "".join(_HEB.get(c, "") for c in word)
        else:
            w = re.sub(r"([a-z])\1", r"\1", re.sub(r"[^a-z]", "", word))
            sk = ""
            i = 0
            while i < len(w):
                for src, dst in _LAT:
                    if w.startswith(src, i):
                        sk += dst
                        i += len(src)
                        break
                else:
                    i += 1  # vowels, h, y
        if sk:
            out.append(sk)
    return " ".join(out)


def latin_text(text: str) -> str:
    t = unicodedata.normalize("NFKD", text.lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    t = re.sub(r"['’`]", "", t)
    return " ".join(w for w in re.split(r"[^a-z0-9֐-׿]+", t) if w)


def title_score(title: str, transcript: str) -> float:
    """0–1: how clearly the transcript contains the song's title."""
    ct = clean_title(title)
    if not ct or not transcript.strip():
        return 0.0
    lt = latin_text(transcript)
    lat = _partial(ct, lt) if len(ct) >= 4 else (1.0 if f" {ct} " in f" {lt} " else 0.0)
    sk_t, sk_x = skeleton(ct), skeleton(transcript)
    ske = 0.0
    if len(sk_t.replace(" ", "")) >= 3 and sk_x:
        ske = _partial(sk_t, sk_x) * 0.95  # skeletons collide more easily; shade them
    # Very short titles ("Shema", "Barchu") collide with anything; damp them.
    damp = min(1.0, 0.6 + 0.05 * len(ct.replace(" ", "")))
    return round(max(lat, ske) * damp, 3)
