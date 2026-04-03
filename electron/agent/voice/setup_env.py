"""
Setup script for ClankAI local voice environment.
Creates a Python venv and installs SenseVoice (STT) + Edge-TTS dependencies.

Usage:
  python setup_env.py --venv-path /path/to/local-voice-env

Outputs JSON progress lines to stdout:
  { "step": "creating_venv", "progress": 10, "message": "Creating virtual environment..." }
  { "step": "complete", "progress": 100, "message": "Setup complete!" }
  { "step": "error", "progress": -1, "message": "..." }
"""

import argparse
import json
import os
import platform
import re
import subprocess
import sys
import threading

home = os.path.expanduser("~")

# Force UTF-8 stdout/stderr on Windows (cp1252 chokes on CJK error messages)
if sys.platform == "win32" and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def emit(step, progress, message):
    """Print a JSON progress line to stdout."""
    print(json.dumps({"step": step, "progress": progress, "message": message}), flush=True)


def _venv_python(venv_path):
    """Return the python executable inside the venv."""
    if platform.system() == "Windows":
        return os.path.join(venv_path, "Scripts", "python.exe")
    return os.path.join(venv_path, "bin", "python")


def _stream_output(proc, step_name, base_progress, on_line):
    """Read stdout/stderr from proc in threads."""
    def _reader(stream):
        buf = ""
        while True:
            chunk = stream.read(256)
            if not chunk:
                if buf.strip():
                    on_line(buf.strip())
                break
            buf += chunk
            while '\n' in buf or '\r' in buf:
                idx_n = buf.find('\n')
                idx_r = buf.find('\r')
                if idx_n == -1:
                    idx = idx_r
                elif idx_r == -1:
                    idx = idx_n
                else:
                    idx = min(idx_n, idx_r)
                line = buf[:idx].strip()
                buf = buf[idx + 1:]
                if line:
                    on_line(line)
        stream.close()

    t_out = threading.Thread(target=_reader, args=(proc.stdout,), daemon=True)
    t_err = threading.Thread(target=_reader, args=(proc.stderr,), daemon=True)
    t_out.start()
    t_err.start()
    proc.wait()
    t_out.join(timeout=10)
    t_err.join(timeout=10)


def run_pip(venv_path, packages, step_name, progress_start, progress_end):
    """Run pip install with live progress streaming."""
    python_bin = _venv_python(venv_path)
    cmd = [python_bin, "-m", "pip", "install", "--prefer-binary", "--progress-bar", "on"] + packages
    emit(step_name, progress_start, f"Installing: {', '.join(packages[:3])}...")

    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"

    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=0, env=env)

    last_msg = ""
    pkg_count = len(packages)
    collected = 0

    def on_line(line):
        nonlocal last_msg, collected
        if line.startswith("[notice]"):
            return
        emit(step_name, -1, f"[log] {line[:150]}")
        if line.startswith("Collecting "):
            collected += 1
            pkg = line.split("Collecting ", 1)[1].split(" ")[0].split("==")[0].split(">=")[0]
            last_msg = f"Collecting {pkg}..."
        elif line.startswith("Downloading "):
            match = re.search(r'Downloading\s+(\S+)\s*(?:\(([^)]+)\))?', line)
            if match:
                fname = match.group(1).split("/")[-1]
                size = match.group(2) or ""
                last_msg = f"Downloading {fname} {size}".strip()
        elif line.startswith("Installing collected"):
            last_msg = line[:100]
        elif line.startswith("Successfully installed"):
            last_msg = line[:100]
        elif "ERROR" in line or "error" in line.lower():
            last_msg = line[:150]
        pct_match = re.search(r'(\d+)%\|', line)
        if pct_match:
            pct = int(pct_match.group(1))
            current = progress_start + int((progress_end - progress_start) * pct / 100)
            emit(step_name, current, last_msg or line[:80])
            return
        pct = progress_start + int((progress_end - progress_start) * min(collected / max(pkg_count * 3, 1), 0.95))
        if last_msg:
            emit(step_name, pct, last_msg)

    _stream_output(proc, step_name, progress_start, on_line)

    if proc.returncode != 0:
        raise RuntimeError(f"pip install failed (exit {proc.returncode}): {last_msg}")
    emit(step_name, progress_end, f"Installed: {', '.join(packages[:3])}")


def run_model_download(venv_path, script, step_name, progress_start, progress_end, description):
    """Run a Python model download script with live output streaming."""
    python_bin = _venv_python(venv_path)
    emit(step_name, progress_start, f"Downloading {description}...")

    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"

    proc = subprocess.Popen(
        [python_bin, "-u", "-c", script],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=0, env=env,
    )

    last_msg = f"Downloading {description}..."
    progress_range = progress_end - progress_start
    last_pct = 0
    last_emit_time = [0]

    def on_line(line):
        nonlocal last_msg, last_pct
        import time
        now = time.time()

        tqdm_match = re.search(r'(\d+)%\|.*?\|\s*([\d.]+\w*/[\d.]+\w*)\s*\[[\d:]+<([\d:]+),\s*([\d.]+\w+/s)', line)
        if tqdm_match:
            pct = int(tqdm_match.group(1))
            size_info = tqdm_match.group(2)
            eta = tqdm_match.group(3)
            speed = tqdm_match.group(4)
            if pct > last_pct:
                last_pct = pct
            current = progress_start + int(progress_range * pct / 100)
            last_msg = f"{description}: {pct}% · {size_info} · {speed} · ETA {eta}"
            if now - last_emit_time[0] >= 2 or pct >= 99:
                emit(step_name, current, last_msg)
                last_emit_time[0] = now
            return

        pct_match = re.search(r'(\d+)%', line)
        if pct_match:
            pct = int(pct_match.group(1))
            if pct > last_pct:
                last_pct = pct
            current = progress_start + int(progress_range * pct / 100)
            parts = [f"{description}: {pct}%"]
            speed_match = re.search(r'([\d.]+\s*[KMG]?B/s)', line)
            size_match = re.search(r'([\d.]+\w*/[\d.]+\w*)', line)
            if size_match:
                parts.append(size_match.group(1))
            if speed_match:
                parts.append(speed_match.group(1))
            last_msg = " · ".join(parts)
            if now - last_emit_time[0] >= 2 or pct >= 99:
                emit(step_name, current, last_msg)
                last_emit_time[0] = now
            return

        if "Downloading" in line or "downloading" in line or "Fetching" in line:
            clean = line.strip()[:120]
            if clean:
                last_msg = clean
                emit(step_name, progress_start + progress_range // 10, last_msg)
        elif "error" in line.lower() or "Error" in line:
            last_msg = line.strip()[:150]
            emit(step_name, progress_start, f"[error] {last_msg}")

    _stream_output(proc, step_name, progress_start, on_line)

    if proc.returncode != 0:
        raise RuntimeError(f"Download failed (exit {proc.returncode}): {last_msg}")
    else:
        emit(step_name, progress_end, f"{description} ready.")


def _pkg_installed(venv_path, pkg_name):
    """Check if a package is already installed in the venv."""
    python_bin = _venv_python(venv_path)
    try:
        result = subprocess.run(
            [python_bin, "-m", "pip", "show", pkg_name],
            capture_output=True, text=True, timeout=30,
        )
        return result.returncode == 0
    except Exception:
        return False


def _has_model_files(dir_path):
    """Check if directory (or its subdirs) contains model weight files."""
    if not os.path.isdir(dir_path):
        return False
    exts = ('.bin', '.pt', '.pth', '.safetensors', '.onnx')
    for root, dirs, files in os.walk(dir_path):
        if any(f.endswith(exts) for f in files):
            return True
    return False


# HuggingFace model ID mapping: modelscope ID → HF ID
HF_MODEL_MAP = {
    "iic/SenseVoiceSmall": "FunAudioLLM/SenseVoiceSmall",
}


def _model_cached(model_id):
    """Check if a model is already cached on disk."""
    cache_dir = os.environ.get("MODELSCOPE_CACHE") or os.path.join(home, ".cache", "modelscope")
    hf_cache = os.environ.get("HF_HUB_CACHE") or os.path.join(home, ".cache", "huggingface", "hub")
    hf_id = HF_MODEL_MAP.get(model_id, model_id)

    candidates = [
        os.path.join(cache_dir, "hub", *model_id.split("/")),
        os.path.join(cache_dir, "hub", "models", *model_id.split("/")),
        os.path.join(hf_cache, hf_id.replace("/", "--")),
        os.path.join(cache_dir, hf_id.replace("/", "--")),
        os.path.join(home, ".cache", "huggingface", "hub", "models--" + model_id.replace("/", "--")),
        os.path.join(home, ".cache", "huggingface", "hub", "models--" + hf_id.replace("/", "--")),
    ]

    for p in candidates:
        if _has_model_files(p):
            emit("checking", -1, f"Model {model_id} found in cache: {p}")
            return True
    return False


def main():
    parser = argparse.ArgumentParser(description="Setup ClankAI local voice environment")
    parser.add_argument("--venv-path", required=True, help="Path to create the virtual environment")
    args = parser.parse_args()

    venv_path = os.path.abspath(args.venv_path)
    anything_installed = False

    try:
        # Step 1: Create venv
        python_bin = _venv_python(venv_path)
        if os.path.exists(python_bin):
            emit("creating_venv", 5, "Virtual environment exists, resuming...")
        else:
            emit("creating_venv", 2, "Creating virtual environment...")
            os.makedirs(venv_path, exist_ok=True)
            subprocess.run(
                [sys.executable, "-m", "venv", venv_path],
                check=True, capture_output=True, text=True, timeout=120,
            )
            emit("creating_venv", 5, "Virtual environment created.")
            anything_installed = True

        # Step 2: Ensure pip + setuptools + wheel
        if _pkg_installed(venv_path, "setuptools") and _pkg_installed(venv_path, "wheel"):
            emit("upgrading_pip", 10, "pip/setuptools/wheel already installed, skipping.")
        else:
            emit("upgrading_pip", 6, "Installing pip, setuptools, wheel...")
            subprocess.run(
                [python_bin, "-m", "pip", "install", "--upgrade", "pip", "setuptools", "wheel"],
                capture_output=True, text=True, timeout=120,
            )
            emit("upgrading_pip", 10, "pip/setuptools/wheel ready.")
            anything_installed = True

        # Step 3: Install PyTorch — CUDA if GPU available, CPU otherwise
        torch_installed = _pkg_installed(venv_path, "torch")

        # Detect NVIDIA GPU + check CUDA Compute Capability (≥5.0 for CUDA 12.1)
        gpu_name = None
        gpu_cuda_ok = False
        try:
            nv = subprocess.run(
                ["nvidia-smi", "--query-gpu=name,compute_cap", "--format=csv,noheader"],
                capture_output=True, text=True, timeout=10)
            if nv.returncode == 0 and nv.stdout.strip():
                parts = nv.stdout.strip().split('\n')[0].split(',')
                gpu_name = parts[0].strip()
                if len(parts) > 1:
                    cap = float(parts[1].strip())
                    gpu_cuda_ok = cap >= 5.0 if cap > 0 else True  # if can't read CC, assume ok
                else:
                    gpu_cuda_ok = True  # can't check, assume ok
        except (FileNotFoundError, subprocess.TimeoutExpired, ValueError):
            pass

        if torch_installed:
            emit("installing_torch", 50, "PyTorch already installed, skipping.")
        else:
            anything_installed = True
            if gpu_name and gpu_cuda_ok:
                emit("installing_torch", 14, f"Installing CUDA PyTorch for {gpu_name} (~3.5GB)...")
                run_pip(venv_path,
                    ["torch", "torchaudio", "--index-url", "https://download.pytorch.org/whl/cu121"],
                    "installing_torch", 14, 50)
            else:
                reason = f"{gpu_name} does not support CUDA 12.1" if gpu_name and not gpu_cuda_ok else "No NVIDIA GPU detected"
                emit("installing_torch", 14, f"{reason} — installing CPU PyTorch (~2GB)...")
                run_pip(venv_path,
                    ["torch", "torchaudio"],
                    "installing_torch", 14, 50)

        # Step 4: Install FunASR (SenseVoice STT)
        if _pkg_installed(venv_path, "funasr"):
            emit("installing_funasr", 65, "FunASR already installed, skipping.")
        else:
            anything_installed = True
            run_pip(venv_path, ["funasr"], "installing_funasr", 51, 65)

        # Step 5: Install server dependencies (Edge-TTS for TTS, no local TTS model needed)
        server_deps = ["fastapi", "uvicorn", "python-multipart", "numpy", "huggingface_hub", "soundfile", "edge-tts"]
        if all(_pkg_installed(venv_path, p) for p in server_deps):
            emit("installing_server_deps", 75, "Server dependencies already installed, skipping.")
        else:
            anything_installed = True
            run_pip(venv_path, server_deps, "installing_server_deps", 66, 75)

        # Step 6: Download STT model (SenseVoice-Small, ~600MB)
        use_hf = os.environ.get("MODEL_SOURCE", "modelscope") == "huggingface"
        src_label = "HuggingFace" if use_hf else "ModelScope"

        if _model_cached("iic/SenseVoiceSmall"):
            emit("downloading_stt_model", 90, "SenseVoice-Small model already cached, skipping.")
        else:
            anything_installed = True
            if use_hf:
                stt_script = (
                    "from huggingface_hub import snapshot_download; "
                    "import os; "
                    "cache = os.environ.get('HF_HUB_CACHE', os.path.expanduser('~/.cache/huggingface/hub')); "
                    "local_dir = os.path.join(cache, 'FunAudioLLM--SenseVoiceSmall'); "
                    "snapshot_download('FunAudioLLM/SenseVoiceSmall', local_dir=local_dir, local_dir_use_symlinks=False); "
                    "print('done')"
                )
            else:
                stt_script = (
                    "from funasr import AutoModel; "
                    "AutoModel(model='iic/SenseVoiceSmall', trust_remote_code=True, device='cpu'); "
                    "print('done')"
                )
            run_model_download(venv_path, stt_script, "downloading_stt_model", 76, 90,
                               f"SenseVoice-Small STT model (~600MB, {src_label})")

        # Step 7: Verify STT model loads
        if not anything_installed:
            emit("verifying", 99, "All components already installed and verified, skipping.")
            emit("complete", 100, "Setup complete! Everything up to date.")
            sys.exit(0)

        emit("verifying", 92, "Verifying STT model loads correctly...")
        use_hf = os.environ.get("MODEL_SOURCE", "modelscope") == "huggingface"
        if use_hf:
            stt_verify = (
                "import os; "
                "cache = os.environ.get('HF_HUB_CACHE', os.path.expanduser('~/.cache/huggingface/hub')); "
                "local_dir = os.path.join(cache, 'FunAudioLLM--SenseVoiceSmall'); "
                "from funasr import AutoModel; "
                "m = AutoModel(model=local_dir, trust_remote_code=True, device='cpu', disable_update=True); "
                "print('STT OK')"
            )
        else:
            stt_verify = (
                "from funasr import AutoModel; "
                "m = AutoModel(model='iic/SenseVoiceSmall', trust_remote_code=True, device='cpu', disable_update=True); "
                "print('STT OK')"
            )

        python_bin = _venv_python(venv_path)
        env = os.environ.copy()
        env["PYTHONUNBUFFERED"] = "1"

        def verify_log(step_pct):
            def on_line(line):
                clean = line.strip()[:120]
                if clean:
                    emit("verifying", step_pct, f"[log] {clean}")
            return on_line

        proc = subprocess.Popen(
            [python_bin, "-u", "-c", stt_verify],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=0, env=env,
        )
        _stream_output(proc, "verifying", 92, verify_log(92))
        if proc.returncode != 0:
            raise RuntimeError("STT model verification failed — model could not be loaded")
        emit("verifying", 98, "STT model verified.")

        # Verify Edge-TTS connectivity
        emit("verifying", 98, "Verifying Edge-TTS connectivity...")
        edge_verify = "import asyncio, edge_tts; asyncio.run(edge_tts.list_voices()); print('Edge-TTS OK')"
        proc = subprocess.Popen(
            [python_bin, "-u", "-c", edge_verify],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=0, env=env,
        )
        _stream_output(proc, "verifying", 98, verify_log(98))
        if proc.returncode != 0:
            emit("verifying", 99, "Edge-TTS connectivity check failed (may work later with internet)")
        else:
            emit("verifying", 99, "Edge-TTS verified.")

        emit("complete", 100, "Setup complete! STT + Edge-TTS ready.")

    except subprocess.TimeoutExpired as e:
        cmd_str = ' '.join(e.cmd) if isinstance(e.cmd, list) else str(e.cmd)
        emit("error", -1, f"Timed out after {e.timeout}s running: {cmd_str[:100]}. Check your network connection and try again.")
        sys.exit(1)
    except Exception as e:
        emit("error", -1, str(e)[:500])
        sys.exit(1)


if __name__ == "__main__":
    main()
