"""Synthetic clips for the tempo tests: click tracks, a drum groove, and beatless audio."""
from __future__ import annotations

import numpy as np

SR = 22050


def _click(sr: int = SR, freq: float = 1500.0, dur: float = 0.03, amp: float = 0.8) -> np.ndarray:
    t = np.arange(int(dur * sr)) / sr
    return amp * np.sin(2 * np.pi * freq * t) * np.exp(-t * 120)


def _place(out: np.ndarray, times: np.ndarray, sound: np.ndarray, sr: int = SR) -> None:
    for s in times:
        i = int(round(s * sr))
        if i >= len(out):
            break
        n = min(len(sound), len(out) - i)
        out[i : i + n] += sound[:n]


def click_track(bpm: float, sec: float = 40.0, sr: int = SR, seed: int = 0) -> np.ndarray:
    """A metronome with an accented downbeat every four, over quiet noise."""
    rng = np.random.default_rng(seed)
    out = 0.01 * rng.standard_normal(int(sec * sr)).astype(np.float32)
    times = np.arange(0, sec, 60.0 / bpm)
    _place(out, times, _click(sr, 1000.0, amp=0.5))
    _place(out, times[::4], _click(sr, 2000.0, amp=0.5))
    return out.astype(np.float32)


def groove(bpm: float, sec: float = 40.0, sr: int = SR, seed: int = 1) -> np.ndarray:
    """Kick on 1 and 3, snare on 2 and 4, hi-hat eighths, over a held chord."""
    rng = np.random.default_rng(seed)
    n = int(sec * sr)
    t = np.arange(n) / sr
    out = 0.05 * (np.sin(2 * np.pi * 220 * t) + np.sin(2 * np.pi * 277 * t) + np.sin(2 * np.pi * 330 * t))
    beat = 60.0 / bpm
    kt = np.arange(int(0.15 * sr)) / sr
    kick = 0.9 * np.sin(2 * np.pi * (60 + 80 * np.exp(-kt * 30)) * kt) * np.exp(-kt * 18)
    snare = 0.5 * rng.standard_normal(int(0.12 * sr)) * np.exp(-np.arange(int(0.12 * sr)) / sr * 35)
    hat = 0.15 * rng.standard_normal(int(0.03 * sr)) * np.exp(-np.arange(int(0.03 * sr)) / sr * 150)
    beats = np.arange(0, sec, beat)
    _place(out, beats[::2], kick)
    _place(out, beats[1::2], snare)
    _place(out, np.arange(0, sec, beat / 2), hat)
    return out.astype(np.float32)


def noise(sec: float = 40.0, sr: int = SR, seed: int = 2) -> np.ndarray:
    rng = np.random.default_rng(seed)
    return (0.2 * rng.standard_normal(int(sec * sr))).astype(np.float32)


def chant(sec: float = 40.0, sr: int = SR, seed: int = 3) -> np.ndarray:
    """Free-time chant: a voice-like tone gliding between notes at irregular times, no pulse."""
    rng = np.random.default_rng(seed)
    n = int(sec * sr)
    changes = np.cumsum(rng.uniform(0.6, 3.5, size=200))
    changes = changes[changes < sec]
    notes = 196.0 * 2 ** (rng.integers(0, 8, size=len(changes) + 1) / 12)
    idx = np.searchsorted(changes, np.arange(n) / sr)
    f = notes[idx]
    # glide between notes (~80 ms), a little vibrato, and soft syllable swells
    k = int(0.08 * sr)
    f = np.convolve(f, np.ones(k) / k, mode="same")
    f = f * (1 + 0.006 * np.sin(2 * np.pi * 5.3 * np.arange(n) / sr))
    phase = 2 * np.pi * np.cumsum(f) / sr
    env = 0.6 + 0.4 * np.sin(2 * np.pi * np.cumsum(rng.uniform(0.2, 0.6, size=n) / sr))
    tone = np.sin(phase) + 0.4 * np.sin(2 * phase) + 0.2 * np.sin(3 * phase)
    return (0.2 * env * tone + 0.005 * rng.standard_normal(n)).astype(np.float32)


def random_hits(sec: float = 40.0, sr: int = SR, seed: int = 4) -> np.ndarray:
    """Clicks at random (Poisson) times: onsets, but no beat."""
    rng = np.random.default_rng(seed)
    out = 0.01 * rng.standard_normal(int(sec * sr)).astype(np.float32)
    times = np.cumsum(rng.exponential(0.45, size=400))
    _place(out, times[times < sec], _click(sr, 1200.0))
    return out.astype(np.float32)


def tempo_change(bpm_a: float, bpm_b: float, sec: float = 40.0, sr: int = SR) -> np.ndarray:
    """Half the clip at one tempo, half at another."""
    a = groove(bpm_a, sec / 2, sr, seed=5)
    b = groove(bpm_b, sec / 2, sr, seed=6)
    return np.concatenate([a, b]).astype(np.float32)


def rubato(bpm_lo: float, bpm_hi: float, sec: float = 40.0, sr: int = SR, seed: int = 7) -> np.ndarray:
    """A beat that speeds up and slows down (sinusoidal tempo, period ~10 s)."""
    rng = np.random.default_rng(seed)
    out = 0.01 * rng.standard_normal(int(sec * sr)).astype(np.float32)
    t, times = 0.0, []
    while t < sec:
        times.append(t)
        bpm = (bpm_lo + bpm_hi) / 2 + (bpm_hi - bpm_lo) / 2 * np.sin(2 * np.pi * t / 10.0)
        t += 60.0 / bpm
    _place(out, np.array(times), _click(sr, 1000.0, amp=0.6))
    return out.astype(np.float32)
