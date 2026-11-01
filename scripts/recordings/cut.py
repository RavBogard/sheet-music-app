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

from textmatch import GENERIC_WORDS, clean_title, title_score

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
TITLE_PARTLY = 0.70  # "title partly sung" from here; below, the transcript doesn't name it
STRONG_TITLE = 0.85  # a title this clear anchors a song
LIVE_MIN = 0.70  # confidence at or above → live, below → held
NO_SETLIST_MIN = 0.85  # with no setlist, only a title this clear is kept at all
NO_SETLIST_LIVE_MIN = 0.92  # ... and only this clear (and unique) goes live
GENERIC_TITLE_CAP = 0.80  # a title made only of everyday prayer words never scores above this
SHORT_FILE_SEC = 600.0  # source files shorter than this are single songs, not cut
SUNG_MIN_WORD_SEC = 0.40  # a line whose median word is longer than this is sung
SPOKEN_MAX_WORD_SEC = 0.36  # a line of 4+ words this short (median) is spoken
TRIM_MIN_SEC = 15.0  # trim talk off a clip's ends only when there's at least this much
TRIM_PAD_SEC = 2.0  # and keep this much before the first / after the last sung line
SPEECH_WINDOW_SEC = 20  # word density is measured over this window
SPEECH_WPS = 1.7  # words/s at or above which a second counts as talk
SPEECH_RUN_MIN_SEC = 15  # a run shorter than this is a cue ("page 24"), not a talk
SPEECH_REPEAT_MAX = 0.3  # a run whose lines repeat this much is sung patter, not talk
SPEECH_REPEAT_CONTEXT_SEC = 120  # repeats are looked for this far either side


@dataclass
class Block:
    start: float
    end: float
    music: float  # 0-1 share of seconds labelled music
    text: str = ""
    words: int = 0
    speech: float = 0.0  # 0-1 share of the block inside a whisper speech run
    sung_text: str | None = None  # text of the words not in spoken-sounding lines (None: all)
    wlist: list = field(default_factory=list)  # the block's words, each tagged sung/spoken

    @property
    def sung(self) -> str:
        return self.text if self.sung_text is None else self.sung_text

    @property
    def musical(self) -> float:
        """Music share with talk over a keyboard pad taken out."""
        return self.music * (1.0 - self.speech)

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


def _norm_line(text: str) -> str:
    return re.sub(r"[^a-z֐-׿]+", " ", text.lower()).strip()


def speech_runs(segments: list[dict]) -> list[tuple[float, float]]:
    """Stretches of continuous talk (a welcome, a d'var, the names before Kaddish).

    Whisper hears talk densely (about 2-3 words/s over 20 s on 6.19) and hears singing
    sparsely (mostly 0-1.5 words/s: long notes, instrumental breaks, lines it skips).
    A second is talk when the words in the 20 s around it reach SPEECH_WPS; runs shorter
    than SPEECH_RUN_MIN_SEC don't count. Fast sung patter ("Mississippi Goddam") is dense
    too, but its lines repeat: a run whose lines repeat >= SPEECH_REPEAT_MAX is singing."""
    words = [w for s in segments for w in (s.get("words") or [])]
    if not words:
        return []
    n = int(max(w["end"] for w in words)) + 2
    per = np.zeros(n)
    for w in words:
        per[min(n - 1, int(w["start"]))] += 1
    half = SPEECH_WINDOW_SEC // 2
    dens = np.convolve(per, np.ones(SPEECH_WINDOW_SEC) / SPEECH_WINDOW_SEC, mode="same")
    talk = dens >= SPEECH_WPS
    out = []
    i = 0
    while i < n:
        if not talk[i]:
            i += 1
            continue
        j = i
        while j < n and talk[j]:
            j += 1
        a, z = max(0, i - half // 2), min(n, j + half // 2)
        if z - a >= SPEECH_RUN_MIN_SEC:
            inside = [_norm_line(s["text"]) for s in segments if a <= s["start"] < z and s["text"].strip()]
            near = [_norm_line(s["text"]) for s in segments
                    if (a - SPEECH_REPEAT_CONTEXT_SEC <= s["start"] < a or z <= s["start"] < z + SPEECH_REPEAT_CONTEXT_SEC)]
            pool = near + inside
            repeated = sum(1 for ln in inside if pool.count(ln) > 1) / max(1, len(inside))
            if repeated < SPEECH_REPEAT_MAX:
                if out and a <= out[-1][1]:
                    out[-1] = (out[-1][0], float(z))
                else:
                    out.append((float(a), float(z)))
        i = j
    return out


def build_blocks(duration: float, silences: list[tuple[float, float]], music: np.ndarray, words: list[dict],
                 speech: list[tuple[float, float]] | None = None) -> list[Block]:
    speech = speech or []
    cuts = {round((a + b) / 2, 2) for a, b in silences} | set(label_switches(music))
    for a, b in speech:
        cuts |= {round(a, 2), round(b, 2)}
    cuts = sorted(cuts)
    edges = [0.0] + [c for c in cuts if 0 < c < duration] + [duration]
    blocks = [Block(a, b, 0.0) for a, b in zip(edges, edges[1:]) if b - a > 0.5]
    fill = lambda b: _fill(b, music, words, speech)  # noqa: E731
    for b in blocks:
        fill(b)
    return _merge_short(blocks, fill)


def _music_share(a: float, b: float, music: np.ndarray) -> float:
    seg = music[int(a) : max(int(a) + 1, int(b))]
    return float((seg >= 0.5).mean()) if len(seg) else 0.0


def _overlap(a: float, b: float, spans: list[tuple[float, float]]) -> float:
    if b <= a:
        return 0.0
    return sum(max(0.0, min(b, e) - max(a, s)) for s, e in spans) / (b - a)


def _merge_short(blocks: list[Block], fill) -> list[Block]:
    """Blocks shorter than MIN_BLOCK_SEC join a neighbour, preferring one of the same
    kind (music or talk), then the shorter one."""
    changed = True
    while changed and len(blocks) > 1:
        changed = False
        for i, b in enumerate(blocks):
            if b.dur >= MIN_BLOCK_SEC:
                continue
            mine = b.musical >= 0.5
            cand = []
            for j in (i - 1, i + 1):
                if 0 <= j < len(blocks):
                    nb = blocks[j]
                    cand.append(((nb.musical >= 0.5) != mine, nb.dur, j))
            _, _, j = min(cand)
            a, z = sorted((i, j))
            merged = Block(blocks[a].start, blocks[z].end, 0.0)
            fill(merged)
            blocks[a : z + 1] = [merged]
            changed = True
            break
    return blocks


def _fill(b: Block, music: np.ndarray, words: list[dict], speech: list[tuple[float, float]] | None = None) -> None:
    b.music = round(_music_share(b.start, b.end, music), 3)
    b.speech = round(_overlap(b.start, b.end, speech or []), 3)
    ws = [w for w in words if b.start <= (w["start"] + w["end"]) / 2 < b.end]
    b.wlist = ws
    b.sung_text = "".join(w["word"] for w in ws if w.get("kind") != "spoken").strip()
    inside = [w["word"] for w in ws]
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
    text = " ".join(b.sung for b in blocks)  # a title only spoken (an introduction) doesn't count
    dur = blocks[-1].end - blocks[0].start
    ts = title_score(title, text)
    ev = title_evidence(ts)
    mus = sum(b.musical * b.dur for b in blocks) / max(dur, 1e-6)
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


def _seg_for(blocks: list[Block], bi: int, bj: int, row: dict, out_of_order: bool = False) -> Segment:
    run = blocks[bi:bj]
    _, conf, ts, mus = run_score(run, row["title"])
    if ts >= STRONG_TITLE:
        reason = "title sung"
    elif ts >= TITLE_PARTLY:
        reason = "title partly sung"
    elif title_score(row["title"], " ".join(b.text for b in run)) >= STRONG_TITLE:
        reason = "title only spoken (an introduction?), placed by setlist order; check by ear"
    else:
        reason = "placed by setlist order only; the transcript doesn't name it; check by ear"
    if out_of_order:
        reason += ", out of setlist order"
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
    a, z, note = trim_talk(run)
    if note:
        seg.startSec, seg.endSec = round(a, 2), round(z, 2)
        seg.reason += f"; {note}"
    seg.status = "live" if conf >= LIVE_MIN and seg.songId else "held"
    return seg


def trim_talk(run: list[Block]) -> tuple[float, float, str]:
    """Cut spoken lines off the ends of a song's run: talk before the first sung line (a
    teaching over the piano) and after the last one. Only trims of TRIM_MIN_SEC or more,
    leaving TRIM_PAD_SEC so an instrumental lead-in or tail survives."""
    words = [w for b in run for w in b.wlist]
    a, z = run[0].start, run[-1].end
    sung = [w for w in words if w.get("kind") == "sung"]
    if not sung:
        return a, z, ""
    notes = []
    first, last = sung[0]["start"], sung[-1]["end"]
    spoken_before = [w for w in words if w.get("kind") == "spoken" and w["end"] <= first]
    if spoken_before:
        na = spoken_before[-1]["end"] + TRIM_PAD_SEC
        if na - a >= TRIM_MIN_SEC and na < first:
            notes.append(f"trimmed {na - a:.0f}s of talk at the start")
            a = na
    spoken_after = [w for w in words if w.get("kind") == "spoken" and w["start"] >= last]
    if spoken_after:
        nz = spoken_after[0]["start"] - TRIM_PAD_SEC
        if z - nz >= TRIM_MIN_SEC and nz > last:
            notes.append(f"trimmed {z - nz:.0f}s of talk at the end")
            z = nz
    return a, z, "; ".join(notes)


def tag_words(segments: list[dict]) -> list[dict]:
    """Every whisper word, tagged by its line: 'sung' (long words: median >
    SUNG_MIN_WORD_SEC), 'spoken' (4+ short words: median <= SPOKEN_MAX_WORD_SEC), or
    'unclear'. Title evidence comes only from sung and unclear words."""
    out = []
    for seg in segments:
        ws = seg.get("words") or []
        kind = "unclear"
        if len(ws) >= 3:
            durs = sorted(x["end"] - x["start"] for x in ws)
            md = durs[len(durs) // 2]
            if md > SUNG_MIN_WORD_SEC:
                kind = "sung"
            elif len(ws) >= 4 and md <= SPOKEN_MAX_WORD_SEC:
                # 6.19: a teaching read slowly over the piano runs ~1 word/s but its words
                # are short; sung lines' median word is 0.5-1.4 s.
                kind = "spoken"
        out.extend({**w, "kind": kind} for w in ws)
    return out


def _extend_strong(blocks: list[Block], by_song: dict[int, Segment], song_rows: list[dict]) -> None:
    """A clearly heard song keeps going into the next free block while that block is
    music with no talk, or still clearly carries the title (a long song's later verses can
    read as talk to the talk detector). It stops at talk without the title, at another song's block, or at
    SONG_MAX_SEC."""
    owned = {k for sg in by_song.values() for k in range(*sg.extra["blocks"])}
    for sj, sg in list(by_song.items()):
        if sg.titleScore < STRONG_TITLE:
            continue
        bi, bj = sg.extra["blocks"]
        title = song_rows[sj]["title"]

        def ok(k: int) -> bool:
            b = blocks[k]
            return k not in owned and ((b.speech < 0.5 and b.music >= 0.5) or title_score(title, b.text) >= STRONG_TITLE)

        while bj < len(blocks) and ok(bj) and blocks[bj].end - blocks[bi].start <= SONG_MAX_SEC:
            owned.add(bj)
            bj += 1
        if (bi, bj) != tuple(sg.extra["blocks"]):
            new = _seg_for(blocks, bi, bj, song_rows[sj], out_of_order="out of setlist order" in sg.reason)
            new.reason += "; extended over the song's later verses"
            by_song[sj] = new


def segments_with_setlist(blocks: list[Block], setlist: dict, song_rows: list[dict]) -> list[Segment]:
    """Align in author order, then let a clearly heard title claim its block even when the
    band played it out of setlist order (a strong title beats an order-only guess)."""
    by_song: dict[int, Segment] = {}
    for sj, bi, bj in align(blocks, song_rows):
        by_song[sj] = _seg_for(blocks, bi, bj, song_rows[sj])

    def owner(k: int) -> int | None:
        for sj, sg in by_song.items():
            a, z = sg.extra["blocks"]
            if a <= k < z:
                return sj
        return None

    cands = []
    for sj, row in enumerate(song_rows):
        if sj in by_song and by_song[sj].titleScore >= STRONG_TITLE:
            continue
        for bi in range(len(blocks)):
            for bj in (bi + 1, bi + 2):
                if bj > len(blocks):
                    continue
                gain, conf, ts, mus = run_score(blocks[bi:bj], row["title"])
                if ts >= STRONG_TITLE and mus >= 0.5:
                    cands.append((ts, conf, sj, bi, bj))
    for ts, conf, sj, bi, bj in sorted(cands, reverse=True):
        if sj in by_song and by_song[sj].titleScore >= STRONG_TITLE:
            continue
        owners = {owner(k) for k in range(bi, bj)} - {None}
        if any(by_song[o].titleScore >= STRONG_TITLE for o in owners):
            continue
        for o in owners:  # weaker claims on these blocks give way
            del by_song[o]
        by_song[sj] = _seg_for(blocks, bi, bj, song_rows[sj], out_of_order=True)

    _extend_strong(blocks, by_song, song_rows)
    segs = list(by_song.values())
    taken = {k for sg in segs for k in range(*sg.extra["blocks"])}
    for k, b in enumerate(blocks):
        if k not in taken:
            segs.append(_dropped(b, "speech" if b.musical < 0.5 else "matched no setlist song"))
    return sorted(segs, key=lambda s: s.startSec)


def best_library_match(text: str, songs: list[dict], hint: str = "") -> tuple[dict | None, float, str]:
    """Best library song for a stretch of text (and an optional file-name hint)."""
    scored = []
    for s in songs:
        ts = max(title_score(s["title"], text), title_score(s["title"], hint) if hint else 0.0)
        if ts > GENERIC_TITLE_CAP and all(w in GENERIC_WORDS for w in clean_title(s["title"]).split()):
            ts = GENERIC_TITLE_CAP  # "Kadosh Kadosh", "Sh'ma Yisrael": words every service sings
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
        # Daniel 2026-11-01: several charts of one tune → the one we play most (used in the
        # most CRC setlists). A tie, or no usage at all, is held.
        group = [top] + same
        uses = sorted(((g.get("uses", 0), g) for g in group), key=lambda x: -x[0])
        if uses[0][0] > 0 and (len(uses) == 1 or uses[0][0] > uses[1][0]):
            top = uses[0][1]
            note = ""
            top = {**top, "_picked": f"most-played of {len(group)} charts ({uses[0][0]} setlists)"}
        else:
            note = f"{len(group)} charts share this title, none played most"
    return top, top_ts, note


def segments_without_setlist(blocks: list[Block], songs: list[dict]) -> list[Segment]:
    segs: list[Segment] = []
    for b in blocks:
        if b.musical < 0.5 and b.words > 0:
            segs.append(_dropped(b, "speech"))
            continue
        song, ts, note = best_library_match(b.text, songs)
        if not song or ts < NO_SETLIST_MIN:
            segs.append(_dropped(b, f"no clear library title (best {ts:.2f}{': ' + song['title'] if song else ''})"))
            continue
        conf = ts * (0.85 if note else 1.0)
        seg = Segment(
            songId=song["songId"], title=song["title"], startSec=round(b.start, 2), endSec=round(b.end, 2),
            confidence=round(conf, 3), reason="no setlist; library title heard" + (f"; {note}" if note else "")
            + (f"; {song['_picked']}" if song.get("_picked") else ""),
            titleScore=ts, music=b.music, snippet=_snippet(b.text),
        )
        seg.status = "live" if ts >= NO_SETLIST_LIVE_MIN and not note else "held"
        segs.append(seg)
    # The same song heard in several places of one service is a false friend: hold them all.
    seen: dict[str, list[Segment]] = {}
    for sg in segs:
        if sg.songId:
            seen.setdefault(sg.songId, []).append(sg)
    for dup in (v for v in seen.values() if len(v) > 1):
        for sg in dup:
            sg.status = "held"
            sg.reason += f"; matched in {len(dup)} places"
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
                  "single-song file; title from file name/transcript" + (f"; {note}" if note else "")
                  + (f"; {song['_picked']}" if song.get("_picked") else ""), titleScore=ts,
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
    words = tag_words(transcript["segments"])
    if duration < SHORT_FILE_SEC:
        text = " ".join(s["text"] for s in transcript["segments"])
        cands = song_rows if isinstance(setlist, dict) and song_rows else songs
        return segment_single_song(duration, text, Path(mp3).name, [r for r in cands if r.get("songId")]), []
    music = music_per_second(decode_pcm(mp3))
    blocks = build_blocks(duration, detect_silences(mp3), music, words, speech_runs(transcript["segments"]))
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
