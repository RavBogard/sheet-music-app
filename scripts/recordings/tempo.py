"""Recordings ingest: detect one clip's tempo (BPM) and how sure we are of it.

    python -I scripts/recordings/tempo.py analyse <clip.mp3> [...]   # JSON per file, one per line

Daniel 2026-11-03: a confident tempo is written automatically into EMPTY bpm fields (the
song's default and the rows bonded to it) by the `apply_recording_tempos` MCP tool. This
module only measures; it never decides a field. Every clip gets a `tempo` record either way,
for audit:

    {"bpm": 118.9 | None, "alt": 59.5 | None, "confidence": 0.0-1.0, "confident": bool,
     "reason": "..." (when not confident), "method": "librosa-tempogram-v1", "threshold": 0.5}

How (librosa): onset strength -> detrended -> tempogram (local autocorrelation, ~6 s windows).
  - periodicity: the mean tempogram at the chosen lag (0 for noise, ~1 for a click track);
  - stability: the share of windows whose own strongest tempo agrees with the chosen one (a
    tempo change or rubato lowers it);
  - steadiness: beats tracked at that tempo, fitted to a straight line; the residual against
    the beat period (a drifting beat lowers it).
confidence = stability * min(1, periodicity / PERIODICITY_FULL) * steadiness.

Half/double time: the tempogram peaks at the beat AND at its octaves. Among octave-related
peaks nearly as strong as the strongest, the fastest one inside 60-160 BPM wins; with none
inside, the strongest is folded into 60-160 by doubling or halving. `alt` is the other octave
(half or double the chosen tempo), whichever the music supports more.

Octave ambiguity: when another octave of the beat ALSO lies inside 60-160 and its tempogram
strength is within OCTAVE_AMBIGUOUS (15%) of the chosen one, the octave is a guess and the
clip is marked not confident ("half or double time is unclear"). This skips most clips at
120-160 BPM whose half-time pulse (60-80) is nearly as strong, which is common.

Calibration limit: THRESHOLD and OCTAVE_AMBIGUOUS were set on synthetic clicks/grooves/
noise/chant/rubato (tests/test_tempo.py) and sanity-checked on 23 real CRC clips with no
ground-truth tempo. Real-world accuracy is unmeasured; the settings err towards skipping.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import numpy as np

SR = 22050
HOP = 256  # 11.6 ms
WIN = 512  # tempogram window, ~5.9 s
MIN_BPM, MAX_BPM = 30.0, 320.0
PREF_LO, PREF_HI = 60.0, 160.0
OCTAVE_SHARE = 0.75  # an octave peak this close to the strongest counts as the same beat
OCTAVE_AMBIGUOUS = 0.85  # another in-range octave this strong (vs the chosen) makes it a guess
PERIODICITY_FULL = 0.35  # periodicity at or above this counts fully
THRESHOLD = 0.5  # calibrated on the synthetic clips in tests/test_tempo.py
MIN_SEC = 12.0
METHOD = "librosa-tempogram-v1"


def decode(path: Path, sr: int = SR) -> np.ndarray:
    raw = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path), "-ac", "1", "-ar", str(sr), "-f", "s16le", "-"],
        check=True,
        capture_output=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0


def _result(bpm: float | None, alt: float | None, confidence: float, reason: str | None = None,
            ambiguous: bool = False, **diag) -> dict:
    confidence = float(round(max(0.0, min(1.0, confidence)), 3))
    confident = bpm is not None and confidence >= THRESHOLD and not ambiguous
    out = {
        "bpm": None if bpm is None else round(float(bpm), 1),
        "alt": None if alt is None else round(float(alt), 1),
        "confidence": confidence,
        "confident": bool(confident),
        "method": METHOD,
        "threshold": THRESHOLD,
    }
    if not confident:
        out["reason"] = reason or "no steady beat"
    if diag:
        out["diag"] = {k: round(float(v), 3) for k, v in diag.items()}
    return out


def _lag_of(bpm: float, sr: int) -> float:
    return 60.0 * sr / (HOP * bpm)


def _bpm_of(lag: float, sr: int) -> float:
    return 60.0 * sr / (HOP * lag)


def _strength(curve: np.ndarray, bpm: float, sr: int) -> float:
    """Curve value near this tempo (best within +-3%), 0 outside the analysed lags."""
    if not (MIN_BPM / 2 <= bpm <= MAX_BPM * 2):
        return 0.0
    lo = int(np.floor(_lag_of(bpm * 1.03, sr)))
    hi = int(np.ceil(_lag_of(bpm / 1.03, sr)))
    lo, hi = max(lo, 1), min(hi, len(curve) - 1)
    if hi < lo:
        return 0.0
    return float(curve[lo : hi + 1].max())


def _refine_lag(curve: np.ndarray, bpm: float, sr: int) -> float:
    """Fractional lag of the peak nearest this tempo (parabolic interpolation)."""
    lo = max(int(np.floor(_lag_of(bpm * 1.03, sr))), 1)
    hi = min(int(np.ceil(_lag_of(bpm / 1.03, sr))), len(curve) - 2)
    i = lo + int(np.argmax(curve[lo : hi + 1]))
    a, b, c = curve[i - 1], curve[i], curve[i + 1]
    den = a - 2 * b + c
    off = 0.5 * (a - c) / den if den < 0 else 0.0
    return i + float(np.clip(off, -0.5, 0.5))


def choose_octave(curve: np.ndarray, sr: int) -> tuple[float, float, float, float, bool] | None:
    """(chosen bpm, alt bpm, beat bpm, strength, ambiguous) from a lag-domain strength curve.

    `beat` is the octave the music itself supports most (what confidence is measured on);
    `chosen` is the tempo reported, which may be `beat` folded into 60-160."""
    lags = np.arange(len(curve))
    with np.errstate(divide="ignore"):
        bpms = np.where(lags > 0, 60.0 * sr / (HOP * np.maximum(lags, 1)), np.inf)
    band = (bpms >= MIN_BPM) & (bpms <= MAX_BPM)
    idx = np.where(band)[0]
    peaks = [i for i in idx[1:-1] if curve[i] > 0 and curve[i] >= curve[i - 1] and curve[i] >= curve[i + 1]]
    if not peaks:
        return None
    best = max(peaks, key=lambda i: curve[i])
    best_bpm, best_s = float(bpms[best]), float(curve[best])
    family = [best_bpm * f for f in (0.25, 0.5, 1.0, 2.0, 4.0)]
    in_range = [b for b in family if PREF_LO <= b <= PREF_HI and _strength(curve, b, sr) >= OCTAVE_SHARE * best_s]
    if in_range:
        chosen = max(in_range)
        beat = chosen
    else:
        beat = best_bpm
        chosen = best_bpm
        while chosen < PREF_LO:
            chosen *= 2
        while chosen > PREF_HI:
            chosen /= 2
    factor = chosen / beat  # a power of two
    beat = _bpm_of(_refine_lag(curve, beat, sr), sr)
    chosen = beat * factor
    half, double = chosen / 2, chosen * 2
    alt = half if _strength(curve, half, sr) >= _strength(curve, double, sr) else double
    win = _strength(curve, chosen, sr)
    ambiguous = any(
        PREF_LO <= o <= PREF_HI and _strength(curve, o, sr) >= OCTAVE_AMBIGUOUS * win
        for o in (half, double)
    )
    return chosen, alt, beat, _strength(curve, beat, sr), ambiguous


def analyse(y: np.ndarray, sr: int = SR) -> dict:
    import librosa  # heavy; imported only when analysing

    if len(y) < MIN_SEC * sr:
        return _result(None, None, 0.0, "clip too short")
    if float(np.sqrt(np.mean(y.astype(np.float64) ** 2))) < 1e-3:
        return _result(None, None, 0.0, "silent")
    oenv = librosa.onset.onset_strength(y=y, sr=sr, hop_length=HOP)
    if not np.any(oenv > 0):
        return _result(None, None, 0.0, "no onsets")
    # Detrend (subtract a ~1 s moving mean) so a busy-but-unpulsed texture reads ~0, not ~0.5.
    k = max(1, int(round(sr / HOP)))
    detr = oenv - np.convolve(oenv, np.ones(k) / k, mode="same")
    tg = librosa.feature.tempogram(onset_envelope=detr, sr=sr, hop_length=HOP, win_length=WIN)
    glob = tg.mean(axis=1)
    picked = choose_octave(glob, sr)
    if picked is None:
        return _result(None, None, 0.0, "no periodic onsets")
    chosen, alt, beat, periodicity, ambiguous = picked

    # Stability: windows whose own strongest tempo is the beat, up to an octave.
    lags = np.arange(tg.shape[0])
    with np.errstate(divide="ignore"):
        bpms = np.where(lags > 0, 60.0 * sr / (HOP * np.maximum(lags, 1)), np.inf)
    band = np.where((bpms >= MIN_BPM) & (bpms <= MAX_BPM))[0]
    agree = 0
    frames = tg.shape[1]
    for t in range(frames):
        col = tg[band, t]
        top = float(col.max())
        if top <= 0.05:
            continue
        ratio = float(bpms[band[int(np.argmax(col))]]) / beat
        octave = 2.0 ** np.round(np.log2(ratio))
        near = abs(ratio / octave - 1.0) <= 0.04 and 0.25 <= octave <= 4
        if near and _strength(tg[:, t], beat, sr) >= 0.6 * top:
            agree += 1
    stability = agree / frames if frames else 0.0

    # Steadiness: beats tracked at this tempo lie on a straight line, evenly spaced.
    _, beats = librosa.beat.beat_track(onset_envelope=oenv, sr=sr, hop_length=HOP, bpm=beat, units="time", tightness=100)
    steadiness, jitter, drift = 0.0, 1.0, 1.0
    if len(beats) >= 8:
        n = np.arange(len(beats))
        slope, icpt = np.polyfit(n, beats, 1)
        period = max(float(slope), 1e-6)
        ibi = np.diff(beats)
        jitter = float(np.median(np.abs(ibi - np.median(ibi)))) / period
        drift = float(np.std(beats - (slope * n + icpt))) / period
        steadiness = float(np.clip(1.0 - 4.0 * jitter, 0.0, 1.0) * np.clip(1.5 - drift, 0.0, 1.0))
        # A beat line that agrees with the tempogram refines the tempo below one frame.
        line_bpm = 60.0 / period
        if abs(line_bpm / beat - 1.0) <= 0.03:
            chosen, alt = chosen * line_bpm / beat, alt * line_bpm / beat

    confidence = stability * min(1.0, periodicity / PERIODICITY_FULL) * steadiness
    if ambiguous and confidence >= THRESHOLD:
        reason = "half or double time is unclear"
    elif stability < 0.5:
        reason = "tempo changes or no steady beat"
    elif periodicity < PERIODICITY_FULL * THRESHOLD:
        reason = "weak pulse"
    else:
        reason = "beat drifts (rubato)"
    return _result(chosen, alt, confidence, reason, ambiguous, periodicity=periodicity, stability=stability,
                   steadiness=steadiness, jitter=jitter, drift=drift)


def analyse_file(path: Path) -> dict:
    return analyse(decode(path))


def main(argv: list[str]) -> None:
    if not argv or argv[0] != "analyse":
        raise SystemExit("usage: tempo.py analyse <file> [...]")
    for p in argv[1:]:
        try:
            out = {"file": p, "tempo": analyse_file(Path(p))}
        except Exception as e:  # one bad file never stops the run
            out = {"file": p, "error": str(e)}
        print(json.dumps(out), flush=True)


if __name__ == "__main__":
    main(sys.argv[1:])
