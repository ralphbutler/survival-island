# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "google-genai",
# ]
# ///
"""make_voices.py -- generate NPC voice clips with Gemini TTS from voices/lines.json.

    uv run tools/make_voices.py              # make any missing clips
    uv run tools/make_voices.py --force      # remake all clips (after editing lines)
    uv run tools/make_voices.py rory_intro   # (re)make just these ids

Writes voices/<id>.wav (24 kHz mono 16-bit). The free tier allows ~3 TTS requests per
minute, so a full run pauses between lines and takes a few minutes. The game plays a clip if it exists and
shows subtitles either way. Key from GEMINI_API_KEY (or GOOGLE_API_KEY).
"""

import argparse
import json
import os
import re
import sys
import time
import wave
from pathlib import Path

from google import genai
from google.genai import errors, types

ROOT = Path(__file__).resolve().parent.parent
VOICES = ROOT / "voices"
MODELS = ["gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts"]   # fall back if the first is overloaded


def write_wav(path: Path, pcm: bytes, rate: int = 24000) -> None:
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)


def synthesize(client: genai.Client, text: str, voice: str) -> bytes:
    config = types.GenerateContentConfig(
        response_modalities=["AUDIO"],
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=voice))
        ),
    )
    last = None
    for model in MODELS:
        for attempt in range(4):
            try:
                r = client.models.generate_content(model=model, contents=text, config=config)
                return r.candidates[0].content.parts[0].inline_data.data
            except errors.ServerError as e:   # 503 overloaded: wait, then try again / next model
                last = e
                print(f"    {model}: {e.code}, retrying...", file=sys.stderr)
                time.sleep(5 * (attempt + 1))
            except errors.ClientError as e:
                if e.code != 429:
                    raise
                # Free tier allows only a few TTS requests per minute; wait as long as Google asks.
                last = e
                m = re.search(r"retry in ([\d.]+)s", str(e))
                wait = float(m.group(1)) + 2 if m else 30
                print(f"    rate limit -- waiting {wait:.0f}s", file=sys.stderr)
                time.sleep(wait)
    raise last


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("ids", nargs="*", help="only these line ids (default: all)")
    ap.add_argument("--force", action="store_true", help="remake clips that already exist")
    args = ap.parse_args()

    data = json.loads((VOICES / "lines.json").read_text())
    client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY"))

    ids = args.ids or list(data["lines"])
    for line_id in ids:
        line = data["lines"][line_id]
        out = VOICES / f"{line_id}.wav"
        if out.exists() and not (args.force or args.ids):
            print(f"skip  {line_id} (exists)")
            continue
        who = data["voices"][line["speaker"]]
        print(f"make  {line_id} ({line['speaker']}, {who['voice']})")
        pcm = synthesize(client, f"{who['style']} {line['text']}", who["voice"])
        write_wav(out, pcm)
        print(f"      {out.relative_to(ROOT)}  {len(pcm) / 48000:.1f}s")


if __name__ == "__main__":
    main()
