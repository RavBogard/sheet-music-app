"""Recordings ingest: cut a service recording into song segments and match each to a song.

    cut_service(mp3, setlist, songs, transcript=None) -> list[Segment]

1. Decode to 16 kHz mono (ffmpeg) and measure, per second, how music-like the audio is
   (low-energy-frame ratio: speech has many near-silent 20 ms frames between syllables,
   a band playing has few).
2. Whisper text (cached by transcribe.py) gives words with timestamps.
3. ffmpeg silencedetect gives the gaps.
4. Candidate blocks are cut at gaps and at music/speech switches; blocks shorter than
   MIN_BLOCK_SEC merge into a neighbour.
5. With a setlist: blocks are aligned to the setlist's song rows in author order by dynamic
   programming (a song takes a run of consecutive blocks; blocks and songs may be skipped).
   Score = title match in the transcript + duration plausibility + music-likeness.
6. With no setlist: each block is scored against every library title; only a clear match
   (>= NO_SETLIST_MIN) is kept.

Every threshold is a module constant, and each choice is logged in
docs/planning/2026-11-01-recordings/STATE.md.
"""
from __future__ import annotations

import re
import subprocess
from dataclasses import asdict, dataclass, field
from pathlib import Path

import numpy as np

from textmatch import clean_title, title_score

SR = 16000
SILENCE_DB = -35  # ffmpeg silencedetect noise floor
SILENCE_MIN_SEC = 1.2  # shortest gap that counts
MIN_BLOCK_SEC = 25.0  # shorter blocks merge into a neighbour
SONG_MIN_SEC, SONG_MAX_SEC = 60.0, 480.0  # plausible song length
RUN_MAX_SEC = 600.0  # one song never spans more than this
RUN_MAX_BLOCKS = 6
MUSIC_LER_MAX = 0.30  # a second is "music" when its low-energy ratio is at most this
MUSIC_SMOOTH_SEC = 9  # smoothing window for the music/speech label
MIN_LABEL_RUN_SEC = 12  # a music/speech switch must last this long to cut there
TITLE_FLOOR = 0.60  # fuzzy partial matches below this are noise
STRONG_TITLE = 0.85  # a title this clear anchors a song
LIVE_MIN = 0.70  # confidence at or above → live, below → held
NO_SETLIST_MIN = 0.85  # with no setlist, only a title this clear is kept at all
SHORT_FILE_SEC = 600.0  # source files shorter than this are single songs, not cut


@dataclass
class Block:
    start: float
    end: float
    music: float  # 0-1 share of seconds labelled music
    text: str = ""
    words: int = 0

    @property
    def dur(self) -> float:
        return self.end - self.start


@dataclass
class Segment:
    songId: str | None
    title: str
    startSec: float
    endSec: float
    confidence: float
    reason: str
    status: str = "held"  # live | held | dropped
    titleScore: float = 0.0
    music: float = 0.0
    snippet: str = ""
    extra: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)


# --------------------------------------------------------------------------- audio features


def decode_pcm(mp3: Path) -> np.ndarray:
    raw = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(mp3), "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"],
        check=True,
        capture_output=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0


def music_per_second(pcm: np.ndarray) -> np.ndarray:
    """Per-second music likelihood in 0-1 from the low-energy ratio (Scheirer & Slaney)."""
    hop = SR // 50  # 20 ms frames
    n = len(pcm) // hop
    frames = pcm[: n * hop].reshape(n, hop)
    rms = np.sqrt((frames**2).mean(axis=1) + 1e-12)
    secs = n // 50
    rms = rms[: secs * 50].reshape(secs, 50)
    mean = rms.mean(axis=1, keepdims=True)
    ler = (rms < 0.5 * mean).mean(axis=1)
    loud = 20 * np.log10(mean[:, 0] + 1e-9) > -50  # near-silence is neither
    music = ((ler <= MUSIC_LER_MAX) & loud).astype(float)
    k = np.ones(MUSIC_SMOOTH_SEC) / MUSIC_SMOOTH_SEC
    return np.convolve(music, k, mode="same")


def detect_silences(mp3: Path, noise_db: int = SILENCE_DB, min_sec: float = SILENCE_MIN_SEC) -> list[tuple[float, float]]:
    err = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(mp3), "-af", f"silencedetect=noise={noise_db}dB:d={min_sec}", "-f", "null", "-"],
        capture_output=True,
        text=True,
    ).stderr
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", err)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", err)]
    return list(zip(starts, ends))


# --------------------------------------------------------------------------- blocks


def label_switches(music: np.ndarray) -> list[float]:
    """Seconds where the smoothed label flips music↔speech and stays flipped MIN_LABEL_RUN_SEC."""
    lab = music >= 0.5
    cuts: list[float] = []
    i = 0
    n = len(lab)
    while i < n:
        j = i
        while j < n and lab[j] == lab[i]:
            j += 1
        if i > 0 and (j - i) >= MIN_LABEL_RUN_SEC:
            cuts.append(float(i))
        i = j
    return cuts


def build_blocks(duration: float, silences: list[tuple[float, float]], music: np.ndarray, words: list[dict]) -> list[Block]:
    cuts = sorted({round((a + b) / 2, 2) for a, b in silences} | set(label_switches(music)))
    edges = [0.0] + [c for c in cuts if 0 < c < duration] + [duration]
    blocks = [Block(a, b, 0.0) for a, b in zip(edges, edges[1:]) if b - a > 0.5]
    blocks = _merge_short(blocks, music)
    for b in blocks:
        _fill(b, music, words)
    return blocks


def _music_share(a: float, b: float, music: np.ndarray) -> float:
    seg = music[int(a) : max(int(a) + 1, int(b))]
    return float((seg >= 0.5).mean()) if len(seg) else 0.0


def _merge_short(blocks: list[Block], music: np.ndarray) -> list[Block]:
    changed = True
    while changed and len(blocks) > 1:
        changed = False
        for i, b in enumerate(blocks):
            if b.dur >= MIN_BLOCK_SEC:
                continue
            mine = _music_share(b.start, b.end, music) >= 0.5
            cand = []
            for j in (i - 1, i + 1):
                if 0 <= j < len(blocks):
                    nb = blocks[j]
                    same = (_music_share(nb.start, nb.end, music) >= 0.5) == mine
                    cand.append((not same, nb.dur, j))
            _, _, j = min(cand)
            a, z = sorted((i, j))
            blocks[a : z + 1] = [Block(blocks[a].start, blocks[z].end, 0.0)]
            changed = True
            break
    return blocks


def _fill(b: Block, music: np.ndarray, words: list[dict]) -> None:
    b.music = round(_music_share(b.start, b.end, music), 3)
    inside = [w["word"] for w in words if b.start <= (w["start"] + w["end"]) / 2 < b.end]
    b.words = len(inside)
    b.text = "".join(inside).strip()


# --------------------------------------------------------------------------- scoring


def duration_fit(sec: float) -> float:
    if SONG_MIN_SEC <= sec <= SONG_MAX_SEC:
        return 1.0
    if sec < SONG_MIN_SEC:
        return max(0.0, sec / SONG_MIN_SEC)
    return max(0.0, 1.0 - (sec - SONG_MAX_SEC) / SONG_MAX_SEC)


def title_evidence(ts: float) -> float:
    """Map a raw fuzzy title score onto 0-1 evidence, with noise (< TITLE_FLOOR) at 0."""
    return max(0.0, min(1.0, (ts - TITLE_FLOOR) / (STRONG_TITLE - TITLE_FLOOR)))


def run_score(blocks: list[Block], title: str) -> tuple[float, float, float, float]:
    """(gain, confidence, raw title score, music share) for a run of blocks as one song."""
    text = " ".join(b.text for b in blocks)
    dur = blocks[-1].end - blocks[0].start
    ts = title_score(title, text)
    ev = title_evidence(ts)
    mus = sum(b.music * b.dur for b in blocks) / max(dur, 1e-6)
    df = duration_fit(dur)
    conf = 0.55 * ev + 0.20 * df + 0.10 * mus
    gain = 0.6 * ev + 0.25 * df + 0.25 * mus - 0.30
    return gain, conf, ts, mus


# --------------------------------------------------------------------------- alignment


def align(blocks: list[Block], songs: list[dict]) -> list[tuple[int, int, int]]:
    """Monotone alignment of block runs to songs. Returns [(song_idx, block_i, block_j_excl)]."""
    B, S = len(blocks), len(songs)
    NEG = -1e9
    dp = np.full((B + 1, S + 1), NEG)
    back: dict[tuple[int, int], tuple] = {}
    dp[0, 0] = 0.0
    cache: dict[tuple[int, int, int], float] = {}
    for i in range(B + 1):
        for j in range(S + 1):
            cur = dp[i, j]
            if cur == NEG:
                continue
            if i < B and cur > dp[i + 1, j]:  # drop block i
                dp[i + 1, j] = cur
                back[(i + 1, j)] = ("skipb", i, j)
            if j < S and cur > dp[i, j + 1]:  # song j not found
                dp[i, j + 1] = cur
                back[(i, j + 1)] = ("skips", i, j)
            if i < B and j < S:
                for k in range(1, RUN_MAX_BLOCKS + 1):
                    if i + k > B or blocks[i + k - 1].end - blocks[i].start > RUN_MAX_SEC:
                        break
                    key = (i, i + k, j)
                    if key not in cache:
                        cache[key] = run_score(blocks[i : i + k], songs[j]["title"])[0]
                    g = cache[key]
                    if g > 0 and cur + g > dp[i + k, j + 1]:
                        dp[i + k, j + 1] = cur + g
                        back[(i + k, j + 1)] = ("take", i, j)
    # trace back from the best end state
    i, j = B, S
    out = []
    while (i, j) != (0, 0):
        kind, pi, pj = back[(i, j)]
        if kind == "take":
            out.append((pj, pi, i))
        i, j = pi, pj
    return list(reversed(out))


# --------------------------------------------------------------------------- entry points


def _snippet(text: str, n: int = 80) -> str:
    return text[:n]


def segments_with_setlist(blocks: list[Block], setlist: dict, song_rows: list[dict]) -> list[Segment]:
    pairs = align(blocks, song_rows)
    taken: set[int] = set()
    segs: list[Segment] = []
    for sj, bi, bj in pairs:
        run = blocks[bi:bj]
        _, conf, ts, mus = run_score(run, song_rows[sj]["title"])
        row = song_rows[sj]
        reason = "title heard" if ts >= STRONG_TITLE else ("title partly heard" if ts >= TITLE_FLOOR else "setlist order only")
        if not row.get("songId"):
            reason += "; setlist row has no chart"
        seg = Segment(
            songId=row.get("songId"),
            title=row["title"],
            startSec=round(run[0].start, 2),
            endSec=round(run[-1].end, 2),
            confidence=round(conf, 3),
            reason=reason,
            titleScore=ts,
            music=round(mus, 3),
            snippet=_snippet(" ".join(b.text for b in run)),
            extra={"order": row.get("order"), "blocks": [bi, bj]},
        )
        seg.status = "live" if conf >= LIVE_MIN and seg.songId else "held"
        segs.append(seg)
        taken.update(range(bi, bj))
    for k, b in enumerate(blocks):
        if k not in taken:
            segs.append(_dropped(b, "speech" if b.music < 0.5 else "matched no setlist song"))
    return sorted(segs, key=lambda s: s.startSec)


def best_library_match(text: str, songs: list[dict], hint: str = "") -> tuple[dict | None, float, str]:
    """Best library song for a stretch of text (and an optional file-name hint)."""
    scored = []
    for s in songs:
        ts = max(title_score(s["title"], text), title_score(s["title"], hint) if hint else 0.0)
        scored.append((ts, s))
    scored.sort(key=lambda x: -x[0])
    if not scored:
        return None, 0.0, "no library"
    top_ts, top = scored[0]
    rivals = [s for ts, s in scored[1:] if ts >= top_ts - 0.03 and clean_title(s["title"]) != clean_title(top["title"])]
    same = [s for ts, s in scored[1:] if ts >= top_ts - 0.03 and clean_title(s["title"]) == clean_title(top["title"])]
    note = ""
    if rivals:
        note = f"close to {len(rivals)} other title(s)"
    elif same:
        note = f"{len(same) + 1} charts share this title"
    return top, top_ts, note


def segments_without_setlist(blocks: list[Block], songs: list[dict]) -> list[Segment]:
    segs: list[Segment] = []
    for b in blocks:
        if b.music < 0.5 and b.words > 0:
            segs.append(_dropped(b, "speech"))
            continue
        song, ts, note = best_library_match(b.text, songs)
        if not song or ts < NO_SETLIST_MIN:
            segs.append(_dropped(b, f"no clear library title (best {ts:.2f}{': ' + song['title'] if song else ''})"))
            continue
        conf = ts * (0.85 if note else 1.0)
        seg = Segment(
            songId=song["songId"], title=song["title"], startSec=round(b.start, 2), endSec=round(b.end, 2),
            confidence=round(conf, 3), reason="no setlist; library title heard" + (f"; {note}" if note else ""),
            titleScore=ts, music=b.music, snippet=_snippet(b.text),
        )
        seg.status = "live" if conf >= LIVE_MIN and not note else "held"
        segs.append(seg)
    return segs


def segment_single_song(duration: float, text: str, file_name: str, songs: list[dict]) -> list[Segment]:
    """A short source file is one song: match its file name and transcript, no cutting."""
    stem = re.sub(r"(?i)\.(mp3|wav)$", "", file_name)
    stem = re.sub(r"(?i)(^|[_ ])V\d+(?=[_ ]|$)", " ", stem)
    stem = re.sub(r"[\d.]+_", " ", stem).replace("_", " ")
    song, ts, note = best_library_match(text, songs, hint=stem)
    if not song or ts < NO_SETLIST_MIN:
        return [Segment(None, stem.strip(), 0.0, round(duration, 2), 0.0, f"single-song file; no clear library title (best {ts:.2f})", status="dropped")]
    conf = ts * (0.85 if note else 1.0)
    seg = Segment(song["songId"], song["title"], 0.0, round(duration, 2), round(conf, 3),
                  "single-song file; title from file name/transcript" + (f"; {note}" if note else ""), titleScore=ts,
                  snippet=_snippet(text))
    seg.status = "live" if conf >= LIVE_MIN and not note else "held"
    return [seg]


def _dropped(b: Block, why: str) -> Segment:
    return Segment(None, "", round(b.start, 2), round(b.end, 2), 0.0, why, status="dropped", music=b.music, snippet=_snippet(b.text))


def cut_service(mp3: Path, setlist: dict | str | None, songs: list[dict], song_rows: list[dict] | None = None,
                transcript: dict | None = None) -> tuple[list[Segment], list[Block]]:
    """Cut and match one source file. `setlist` may be a setlist dict, None, or 'ambiguous'."""
    from transcribe import transcribe

    transcript = transcript or transcribe(mp3)
    duration = float(transcript["duration"])
    words = [w for s in transcript["segments"] for w in s.get("words", [])]
    if duration < SHORT_FILE_SEC:
        text = " ".join(s["text"] for s in transcript["segments"])
        cands = song_rows if isinstance(setlist, dict) and song_rows else songs
        return segment_single_song(duration, text, Path(mp3).name, [r for r in cands if r.get("songId")]), []
    music = music_per_second(decode_pcm(mp3))
    blocks = build_blocks(duration, detect_silences(mp3), music, words)
    if isinstance(setlist, dict):
        segs = segments_with_setlist(blocks, setlist, song_rows or [])
    else:
        segs = segments_without_setlist(blocks, songs)
    if setlist == "ambiguous":
        for s in segs:
            if s.status == "live":
                s.status = "held"
                s.reason = "ambiguous setlist; " + s.reason
    return segs, blocks
