"""Tempo detection on synthetic clips: known BPM, half/double time, and beatless audio skipped.

Run: python -m pytest scripts/recordings/tests/test_tempo.py   (needs librosa)
"""
import pytest

pytest.importorskip("librosa")

import synth  # noqa: E402
import tempo  # noqa: E402


def _near(got, want, tol=0.02):
    return got is not None and abs(got / want - 1) <= tol


@pytest.mark.parametrize("bpm", [70, 96, 120, 140])
def test_click_track_tempo_is_found(bpm):
    r = tempo.analyse(synth.click_track(bpm))
    assert r["confident"] is True
    assert _near(r["bpm"], bpm), r
    assert r["confidence"] >= tempo.THRESHOLD
    assert "reason" not in r


@pytest.mark.parametrize("bpm", [84, 120, 150])
def test_groove_reports_the_beat_not_the_hi_hat(bpm):
    """Hi-hat eighths make double time the strongest pulse; the beat is chosen, double is the alt."""
    r = tempo.analyse(synth.groove(bpm))
    assert r["confident"] is True
    assert _near(r["bpm"], bpm), r
    assert _near(r["alt"], bpm * 2) or _near(r["alt"], bpm / 2)


def test_slow_click_is_doubled_into_range_and_keeps_the_alternative():
    r = tempo.analyse(synth.click_track(50))
    assert r["confident"] is True
    assert _near(r["bpm"], 100), r
    assert _near(r["alt"], 50)


def test_fast_click_is_halved_into_range_and_keeps_the_alternative():
    r = tempo.analyse(synth.click_track(180))
    assert r["confident"] is True
    assert _near(r["bpm"], 90), r
    assert _near(r["alt"], 180)


def test_slow_beat_is_not_doubled_when_in_range():
    """A 70 BPM click has no pulse at 140: the in-range tempo the music supports wins."""
    r = tempo.analyse(synth.click_track(70))
    assert _near(r["bpm"], 70)
    assert _near(r["alt"], 35) or _near(r["alt"], 140)


@pytest.mark.parametrize(
    "name,make",
    [
        ("noise", synth.noise),
        ("free-time chant", synth.chant),
        ("random hits", synth.random_hits),
        ("tempo change", lambda: synth.tempo_change(80, 130)),
        ("rubato", lambda: synth.rubato(70, 120)),
    ],
)
def test_no_confident_beat_is_skipped(name, make):
    r = tempo.analyse(make())
    assert r["confident"] is False, (name, r)
    assert r["confidence"] < tempo.THRESHOLD
    assert r["reason"]


def test_silence_and_short_clips_are_skipped_with_a_reason():
    import numpy as np

    assert tempo.analyse(np.zeros(tempo.SR * 30, dtype="float32"))["reason"] == "silent"
    short = tempo.analyse(synth.click_track(120, sec=5))
    assert short["confident"] is False and short["reason"] == "clip too short"


def test_result_shape_is_what_the_recording_doc_stores():
    r = tempo.analyse(synth.click_track(120))
    assert set(r) >= {"bpm", "alt", "confidence", "confident", "method", "threshold"}
    assert r["method"] == tempo.METHOD
    assert 0 <= r["confidence"] <= 1
