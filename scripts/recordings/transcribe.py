"""Recordings ingest: one whisper pass over a source file, cached as JSON in the work dir.

    python -I scripts/recordings/transcribe.py <mp3> [<mp3> ...]

Writes `<work>/transcripts/<sha1 of path>.json`: {file, model, device, seconds, language,
segments: [{start, end, text, lang, no_speech, avg_logprob, words: [{start, end, word}]}]}.
Transcripts are working data: they stay in the gitignored work dir, never in git or Firestore.
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
import time
from pathlib import Path

WORK = Path(os.environ.get("RECORDINGS_WORK", ".recordings-work")).resolve()


def transcript_path(mp3: Path) -> Path:
    key = hashlib.sha1(str(Path(mp3).resolve()).encode("utf-8")).hexdigest()[:16]
    return WORK / "transcripts" / f"{key}.json"


def _add_cuda_dlls() -> None:
    """On Windows, CTranslate2 needs cuBLAS/cuDNN DLLs; the pip wheels
    (nvidia-cublas-cu12, nvidia-cudnn-cu12) put them under site-packages/nvidia/*/bin."""
    if os.name != "nt":
        return
    try:
        import nvidia  # namespace package from the pip wheels
    except ImportError:
        return
    for base in nvidia.__path__:
        for sub in ("cublas", "cudnn", "cuda_runtime", "cuda_nvrtc"):
            d = Path(base) / sub / "bin"
            if d.is_dir():
                os.add_dll_directory(str(d))
                os.environ["PATH"] = f"{d}{os.pathsep}{os.environ.get('PATH', '')}"


def load_model():
    _add_cuda_dlls()
    from faster_whisper import WhisperModel

    try:
        return WhisperModel("large-v3", device="cuda", compute_type="float16"), "large-v3/cuda"
    except Exception as e:  # CUDA unavailable: fall back as the plan allows
        print(f"CUDA failed ({e}); falling back to medium on CPU int8", file=sys.stderr)
        return WhisperModel("medium", device="cpu", compute_type="int8"), "medium/cpu"


def transcribe(mp3: Path, model=None, label: str = "") -> dict:
    out = transcript_path(mp3)
    if out.exists():
        return json.loads(out.read_text(encoding="utf-8"))
    if model is None:
        model, label = load_model()
    t0 = time.time()
    segs, info = model.transcribe(
        str(mp3),
        word_timestamps=True,
        vad_filter=False,
        multilingual=True,
        condition_on_previous_text=False,
        beam_size=5,
    )
    rows = []
    for s in segs:
        rows.append(
            {
                "start": round(s.start, 2),
                "end": round(s.end, 2),
                "text": s.text.strip(),
                "no_speech": round(s.no_speech_prob, 3),
                "avg_logprob": round(s.avg_logprob, 3),
                "words": [{"start": round(w.start, 2), "end": round(w.end, 2), "word": w.word} for w in (s.words or [])],
            }
        )
    data = {
        "file": str(mp3),
        "model": label,
        "seconds": round(time.time() - t0, 1),
        "duration": round(info.duration, 1),
        "language": info.language,
        "segments": rows,
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    return data


if __name__ == "__main__":
    model, label = load_model()
    for p in sys.argv[1:]:
        d = transcribe(Path(p), model, label)
        print(f"{p}: {len(d['segments'])} segments, {d['duration']}s audio, whisper {d['seconds']}s ({d['model']})")
