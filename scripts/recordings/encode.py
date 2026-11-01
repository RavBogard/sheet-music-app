"""Recordings ingest: cut one clip out of a source file as a 128 kbps MP3 with short fades."""
from __future__ import annotations

import subprocess
from pathlib import Path

FADE_SEC = 0.4
BITRATE = "128k"


def encode_args(src: Path, start: float, end: float, out: Path) -> list[str]:
    dur = max(0.0, end - start)
    fade_out_at = max(0.0, dur - FADE_SEC)
    return [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-ss", f"{start:.3f}", "-to", f"{end:.3f}", "-i", str(src),
        "-af", f"afade=t=in:st=0:d={FADE_SEC},afade=t=out:st={fade_out_at:.3f}:d={FADE_SEC}",
        "-vn", "-c:a", "libmp3lame", "-b:a", BITRATE,
        str(out),
    ]


def encode_clip(src: Path, start: float, end: float, out: Path) -> Path:
    if end <= start:
        raise ValueError(f"empty clip {start}-{end}")
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(".part.mp3")
    subprocess.run(encode_args(src, start, end, tmp), check=True)
    tmp.replace(out)
    return out
