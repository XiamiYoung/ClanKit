"""
Local Voice Server — SenseVoice (STT) + Edge-TTS (TTS)
FastAPI server managed by Electron's LocalVoiceServer.js.

Usage:
  python local_voice_server.py --port 8199 --stt-model iic/SenseVoiceSmall

Endpoints:
  POST /stt          — audio file → { "text": "...", "elapsed": 0.5 }
  POST /tts          — { "text", "voice", "language" } → audio/mpeg
  GET  /health       — { "status": "ok", "stt_model": "...", "gpu": true }
  GET  /edge-voices  — list available Edge-TTS voices
"""

import argparse
import io
import os
import signal
import sys
import tempfile
import time

# Force UTF-8 stdout/stderr on Windows
if sys.platform == "win32" and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

import numpy as np
import torch
import uvicorn
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import Response, JSONResponse

app = FastAPI(title="ClankAI Local Voice Server")

# Global state
stt_model = None
stt_model_name = ""
has_gpu = False
model_source = "modelscope"

# Default Edge-TTS voices by language
EDGE_VOICE_DEFAULTS = {
    "zh": "zh-CN-XiaoxiaoNeural",
    "en": "en-US-AriaNeural",
    "ja": "ja-JP-NanamiNeural",
    "ko": "ko-KR-SunHiNeural",
}


# ── STT Model Loading ────────────────────────────────────────────────────────

def _resolve_stt_path(model_name: str) -> str:
    """Resolve STT model to local path for HuggingFace, or return name for ModelScope."""
    if model_source != "huggingface":
        return model_name
    hf_map = {"iic/SenseVoiceSmall": "FunAudioLLM/SenseVoiceSmall"}
    hf_id = hf_map.get(model_name, model_name)
    cache_base = os.environ.get("HF_HUB_CACHE") or os.path.join(os.path.expanduser("~"), ".cache", "huggingface", "hub")
    local_path = os.path.join(cache_base, hf_id.replace("/", "--"))
    if os.path.isdir(local_path):
        return local_path
    # Fallback: download
    from huggingface_hub import snapshot_download
    print(f"[HuggingFace] Downloading {hf_id} to {local_path}...", flush=True)
    snapshot_download(hf_id, local_dir=local_path, local_dir_use_symlinks=False)
    return local_path


def load_stt_model(model_name: str):
    """Load SenseVoice STT model via FunASR."""
    global stt_model, stt_model_name
    from funasr import AutoModel

    print(f"[STT] Loading model: {model_name} (source: {model_source})...", flush=True)
    local_dir = _resolve_stt_path(model_name)

    # Remove model's requirements.txt to prevent AutoModel from pip installing at runtime
    if os.path.isdir(str(local_dir)):
        req_file = os.path.join(local_dir, "requirements.txt")
        if os.path.isfile(req_file):
            try:
                os.rename(req_file, req_file + ".bak")
            except OSError:
                pass

    stt_model = AutoModel(
        model=local_dir,
        trust_remote_code=True,
        device="cuda" if has_gpu else "cpu",
        disable_update=True,
        disable_log=True,
    )
    stt_model_name = model_name
    print(f"[STT] Model loaded: {model_name}", flush=True)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "stt_model": stt_model_name,
        "tts_engine": "edge",
        "gpu": has_gpu,
    }


@app.post("/stt")
async def speech_to_text(
    file: UploadFile = File(...),
    language: str = Form("auto"),
):
    """Transcribe audio using SenseVoice."""
    if stt_model is None:
        return JSONResponse(status_code=503, content={"error": "STT model not loaded"})

    import re
    import soundfile as sf

    audio_bytes = await file.read()

    # Try soundfile first (WAV, FLAC, OGG)
    audio_data = None
    sample_rate = 16000
    try:
        audio_data, sample_rate = sf.read(io.BytesIO(audio_bytes), dtype="float32")
    except Exception:
        # Fallback: convert webm → wav via ffmpeg
        tmp_in = tempfile.NamedTemporaryFile(delete=False, suffix=".webm")
        tmp_out = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
        try:
            tmp_in.write(audio_bytes)
            tmp_in.flush()
            tmp_in.close()
            tmp_out.close()
            ffmpeg_bin = "ffmpeg"
            try:
                import static_ffmpeg
                static_ffmpeg.add_paths()
            except ImportError:
                pass
            from subprocess import run as sp_run
            sp_run([ffmpeg_bin, "-y", "-i", tmp_in.name, "-ar", "16000", "-ac", "1", "-f", "wav", tmp_out.name],
                   capture_output=True, timeout=30)
            audio_data, sample_rate = sf.read(tmp_out.name, dtype="float32")
        finally:
            try: os.unlink(tmp_in.name)
            except OSError: pass
            try: os.unlink(tmp_out.name)
            except OSError: pass

    if audio_data is None:
        return JSONResponse(status_code=400, content={"error": "Could not decode audio"})

    if len(audio_data.shape) > 1:
        audio_data = audio_data.mean(axis=1)

    start_time = time.time()
    result = stt_model.generate(
        input=audio_data,
        batch_size_s=0,
        language=language if language != "auto" else None,
        fs=sample_rate,
    )
    elapsed = time.time() - start_time

    text = ""
    if result and len(result) > 0:
        text = re.sub(r"<\|[^|]*\|>", "", result[0].get("text", "")).strip()

    return {"text": text, "duration": 0.0, "elapsed": round(elapsed, 3)}


@app.post("/tts")
async def text_to_speech(
    text: str = Form(...),
    voice: str = Form("default"),
    language: str = Form("auto"),
):
    """Generate speech audio via Edge-TTS (fast, free, online)."""
    if not text or not text.strip():
        return JSONResponse(status_code=400, content={"error": "Empty text"})

    try:
        import edge_tts
        t0 = time.time()

        # Resolve voice name
        if voice and voice != "default" and "Neural" in voice:
            voice_name = voice
        else:
            voice_name = EDGE_VOICE_DEFAULTS.get(language, EDGE_VOICE_DEFAULTS.get("zh"))

        communicate = edge_tts.Communicate(text, voice_name)
        buf = io.BytesIO()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                buf.write(chunk["data"])

        elapsed = time.time() - t0
        audio_bytes = buf.getvalue()
        print(f"[TTS:edge] {len(text)} chars -> {len(audio_bytes)} bytes in {elapsed:.2f}s ({voice_name})", flush=True)

        return Response(
            content=audio_bytes,
            media_type="audio/mpeg",
            headers={"Content-Disposition": "inline; filename=speech.mp3"},
        )
    except Exception as e:
        print(f"[TTS] Error: {e}", flush=True)
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/edge-voices")
async def list_edge_voices():
    """List available Edge-TTS voices."""
    try:
        import edge_tts
        voices = await edge_tts.list_voices()
        # Return simplified list
        result = []
        for v in voices:
            result.append({
                "id": v["ShortName"],
                "name": v.get("FriendlyName", v["ShortName"]),
                "gender": v.get("Gender", ""),
                "locale": v.get("Locale", ""),
            })
        return {"voices": result}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/tts-preview")
async def tts_preview(
    voice: str = Form(...),
    language: str = Form("auto"),
):
    """Generate a short preview of a voice."""
    preview_texts = {
        "zh": "你好，很高兴认识你。今天天气真不错。",
        "en": "Hello, nice to meet you. How are you today?",
        "ja": "こんにちは、お会いできて嬉しいです。",
        "ko": "안녕하세요, 만나서 반갑습니다.",
    }
    # Determine language from voice locale
    lang = language if language != "auto" else "zh"
    if voice:
        locale = voice.split("-")[0] if "-" in voice else "zh"
        lang = locale

    text = preview_texts.get(lang, preview_texts["en"])

    try:
        import edge_tts
        t0 = time.time()
        communicate = edge_tts.Communicate(text, voice)
        buf = io.BytesIO()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                buf.write(chunk["data"])

        elapsed = time.time() - t0
        print(f"[TTS:preview] {voice} in {elapsed:.2f}s", flush=True)

        return Response(
            content=buf.getvalue(),
            media_type="audio/mpeg",
            headers={"Content-Disposition": "inline; filename=preview.mp3"},
        )
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="ClankAI Local Voice Server")
    parser.add_argument("--port", type=int, default=8199)
    parser.add_argument("--stt-model", default="iic/SenseVoiceSmall")
    parser.add_argument("--pid-file", default="")
    parser.add_argument("--model-source", default="modelscope", choices=["modelscope", "huggingface"])
    parser.add_argument("--device", default="auto", choices=["auto", "cpu", "cuda"])
    args = parser.parse_args()

    global model_source, has_gpu
    model_source = args.model_source

    if args.pid_file:
        with open(args.pid_file, "w") as f:
            f.write(str(os.getpid()))

    # GPU detection
    cuda_available = torch.cuda.is_available()
    if args.device == "cuda":
        has_gpu = cuda_available
        if not cuda_available:
            print("[Server] WARNING: CUDA requested but not available — falling back to CPU", flush=True)
    elif args.device == "cpu":
        has_gpu = False
    else:
        has_gpu = cuda_available

    gpu_info = ""
    if has_gpu:
        gpu_info = f" — {torch.cuda.get_device_name(0)}, {torch.cuda.get_device_properties(0).total_memory // 1048576}MB VRAM"
    print(f"[Server] Device: {'CUDA' if has_gpu else 'CPU'}{gpu_info}", flush=True)

    # Load STT model
    try:
        load_stt_model(args.stt_model)
    except Exception as e:
        print(f"[STT] Failed to load model: {e}", flush=True)

    print(f"[Server] TTS engine: Edge-TTS (online)", flush=True)

    # Graceful shutdown
    def handle_sigterm(signum, frame):
        print("[Server] Received SIGTERM, shutting down...", flush=True)
        if args.pid_file and os.path.exists(args.pid_file):
            os.unlink(args.pid_file)
        sys.exit(0)

    signal.signal(signal.SIGTERM, handle_sigterm)

    print(f"[Server] Starting on port {args.port}...", flush=True)
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
