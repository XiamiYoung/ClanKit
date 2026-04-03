#!/usr/bin/env python3
"""
WeChat PC database decryption tool

Supports:
  - Windows WeChat 4.x: ctypes memory scan of Weixin.exe,
    per-DB enc_key extraction, SQLCipher 4 (AES-256-CBC, reserve=80)
  - Windows WeChat 3.x: WeChatWin.dll pattern scan via pymem,
    SQLCipher 3 (PBKDF2-SHA1, 4000 iterations)
  - macOS WeChat: lldb-based memory scan

Usage:
  python wechat_decryptor.py --find-key-only
  python wechat_decryptor.py --db-dir <MSG_DIR> --output ./decrypted/
  python wechat_decryptor.py --key "abcd1234" --db "./MSG0.db" --output "./decrypted/"

Dependencies:
  pip install pycryptodome psutil
  Windows 3.x extra: pip install pymem
"""

import os
import sys
import glob
import json
import struct
import hashlib
import hmac as _hmac_mod
import argparse
import subprocess
from pathlib import Path


IS_WINDOWS = sys.platform == "win32"
IS_MACOS = sys.platform == "darwin"


# === Process discovery =======================================================

def find_wechat_pid():
    """Find a WeChat process PID (3.x / macOS)."""
    try:
        import psutil
    except ImportError:
        print("Please install: pip install psutil", file=sys.stderr)
        sys.exit(1)

    exact_names = (
        {"wechat.exe", "wechatapp.exe", "wechatappex.exe", "weixin.exe"} if IS_WINDOWS
        else {"wechat", "\u5fae\u4fe1"}
    )
    fuzzy_hits = []
    for proc in psutil.process_iter(["pid", "name"]):
        try:
            name = (proc.info["name"] or "").lower()
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
        if name in exact_names:
            return proc.info["pid"]
        if IS_WINDOWS and "wechat" in name and name.endswith(".exe"):
            fuzzy_hits.append((proc.info["pid"], proc.info["name"]))
    if fuzzy_hits:
        return fuzzy_hits[0][0]
    return None


# === WeChat 4.x Windows: ctypes-based multi-key extraction ===================

def _get_weixin_pids():
    """Find all Weixin.exe PIDs via tasklist, sorted by memory descending."""
    try:
        r = subprocess.run(
            ["tasklist", "/FI", "IMAGENAME eq Weixin.exe", "/FO", "CSV", "/NH"],
            capture_output=True, text=True,
        )
    except Exception:
        return []
    pids = []
    for line in r.stdout.strip().split("\n"):
        line = line.strip()
        if not line:
            continue
        parts = line.strip('"').split('","')
        if len(parts) >= 5:
            try:
                pid = int(parts[1])
                mem = int(parts[4].replace(",", "").replace(" K", "").strip() or "0")
                pids.append((pid, mem))
            except (ValueError, IndexError):
                pass
    pids.sort(key=lambda x: x[1], reverse=True)
    return pids


def _collect_db_files_v4(db_dir):
    """
    Walk db_dir recursively and collect all .db files with their salts.

    Returns:
      db_files: [(rel_path, abs_path, size, salt_hex, page1_bytes), ...]
      salt_to_dbs: {salt_hex: [rel_path, ...]}
    """
    PAGE_SZ = 4096
    SALT_SZ = 16
    db_files = []
    salt_to_dbs = {}
    for root, _dirs, files in os.walk(db_dir):
        for name in sorted(files):
            if not name.endswith(".db"):
                continue
            if name.endswith("-wal") or name.endswith("-shm"):
                continue
            path = os.path.join(root, name)
            try:
                size = os.path.getsize(path)
            except OSError:
                continue
            if size < PAGE_SZ:
                continue
            try:
                with open(path, "rb") as f:
                    page1 = f.read(PAGE_SZ)
            except OSError:
                continue
            if len(page1) < PAGE_SZ:
                continue
            rel = os.path.relpath(path, db_dir)
            salt_hex = page1[:SALT_SZ].hex()
            db_files.append((rel, path, size, salt_hex, page1))
            salt_to_dbs.setdefault(salt_hex, []).append(rel)
    return db_files, salt_to_dbs


def _verify_enc_key_v4(enc_key, page1):
    """
    Verify a WeChat 4.x enc_key against DB page 1 using HMAC-SHA512.

    Algorithm (SQLCipher 4):
      mac_salt = salt XOR 0x3A
      mac_key  = PBKDF2-SHA512(enc_key, mac_salt, iterations=2, dklen=32)
      hmac_msg = page1[16:4032] + struct.pack('<I', 1)
      expected = HMAC-SHA512(mac_key, hmac_msg)
      stored   = page1[4032:4096]
    """
    PAGE_SZ = 4096
    SALT_SZ = 16
    KEY_SZ = 32
    RESERVE_SZ = 80   # IV(16) + HMAC(64)

    salt = page1[:SALT_SZ]
    mac_salt = bytes(b ^ 0x3A for b in salt)
    mac_key = hashlib.pbkdf2_hmac("sha512", enc_key, mac_salt, 2, dklen=KEY_SZ)

    # hmac_data = page1[16 : 4096-80+16] = page1[16:4032]
    hmac_data = page1[SALT_SZ: PAGE_SZ - RESERVE_SZ + SALT_SZ]
    # stored_hmac = page1[4096-64 : 4096] = page1[4032:4096]
    stored_hmac = page1[PAGE_SZ - KEY_SZ * 2: PAGE_SZ]

    hm = _hmac_mod.new(mac_key, hmac_data, hashlib.sha512)
    hm.update(struct.pack("<I", 1))
    return hm.digest() == stored_hmac


def _extract_all_keys_v4(db_files, salt_to_dbs, emit_fn):
    """
    Scan all Weixin.exe process memory regions for per-DB enc_keys.

    WeChat 4.x caches WCDB keys as: x'<64hex_enc_key><32hex_salt>'
    Each candidate is verified via HMAC-SHA512 against collected DB salts.
    Returns {salt_hex: enc_key_hex}.
    """
    import ctypes
    import ctypes.wintypes as wt
    import re as _re

    kernel32 = ctypes.windll.kernel32
    MEM_COMMIT = 0x1000
    READABLE = {0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80}

    class _MBI(ctypes.Structure):
        _fields_ = [
            ("BaseAddress", ctypes.c_uint64),
            ("AllocationBase", ctypes.c_uint64),
            ("AllocationProtect", wt.DWORD),
            ("_pad1", wt.DWORD),
            ("RegionSize", ctypes.c_uint64),
            ("State", wt.DWORD),
            ("Protect", wt.DWORD),
            ("Type", wt.DWORD),
            ("_pad2", wt.DWORD),
        ]

    pids = _get_weixin_pids()
    if not pids:
        return {}

    hex_re = _re.compile(b"x'([0-9a-fA-F]{64,192})'")
    key_map = {}
    remaining_salts = set(salt_to_dbs.keys())

    for pid_idx, (pid, mem_kb) in enumerate(pids):
        if not remaining_salts:
            break

        h = kernel32.OpenProcess(0x0010 | 0x0400, False, pid)
        if not h:
            emit_fn("key", 25, f"Cannot open PID={pid}, skipping")
            continue

        try:
            regions = []
            addr = 0
            mbi = _MBI()
            while addr < 0x7FFFFFFFFFFF:
                if kernel32.VirtualQueryEx(
                        h, ctypes.c_uint64(addr),
                        ctypes.byref(mbi), ctypes.sizeof(mbi)) == 0:
                    break
                if (mbi.State == MEM_COMMIT
                        and mbi.Protect in READABLE
                        and 0 < mbi.RegionSize < 500 * 1024 * 1024):
                    regions.append((mbi.BaseAddress, mbi.RegionSize))
                nxt = mbi.BaseAddress + mbi.RegionSize
                if nxt <= addr:
                    break
                addr = nxt

            total = len(regions)
            emit_fn("key", 20 + pid_idx,
                    f"Scanning PID={pid} ({mem_kb // 1024}MB, {total} regions)...")

            for idx, (base, size) in enumerate(regions):
                if not remaining_salts:
                    break

                buf = ctypes.create_string_buffer(size)
                n = ctypes.c_size_t(0)
                if not kernel32.ReadProcessMemory(
                        h, ctypes.c_uint64(base), buf, size, ctypes.byref(n)):
                    continue
                data = buf.raw[:n.value]
                if not data:
                    continue

                for m in hex_re.finditer(data):
                    hex_str = m.group(1).decode()
                    hex_len = len(hex_str)

                    pairs = []
                    if hex_len == 96:
                        pairs.append((hex_str[:64], hex_str[64:]))
                    elif hex_len == 64:
                        for s in list(remaining_salts):
                            pairs.append((hex_str, s))
                    elif hex_len > 96 and hex_len % 2 == 0:
                        pairs.append((hex_str[:64], hex_str[-32:]))

                    for enc_key_hex, salt_hex in pairs:
                        if salt_hex not in remaining_salts:
                            continue
                        try:
                            enc_key = bytes.fromhex(enc_key_hex)
                        except ValueError:
                            continue
                        for rel, _path, _sz, s, page1 in db_files:
                            if s == salt_hex and _verify_enc_key_v4(enc_key, page1):
                                key_map[salt_hex] = enc_key_hex
                                remaining_salts.discard(salt_hex)
                                dbs = salt_to_dbs[salt_hex]
                                emit_fn("key", 35, f"Key found for: {', '.join(dbs)}")
                                break

                if (idx + 1) % 300 == 0:
                    pct = 22 + int(((idx + 1) / total) * 13)
                    emit_fn("key", pct,
                            f"{idx+1}/{total} regions, {len(key_map)}/{len(salt_to_dbs)} keys")

        finally:
            kernel32.CloseHandle(h)

    # Cross-verify: try known keys against any remaining unmatched salts
    if remaining_salts and key_map:
        for salt_hex in list(remaining_salts):
            for _rel, _path, _sz, s, page1 in db_files:
                if s == salt_hex:
                    for known_key_hex in key_map.values():
                        try:
                            enc_key = bytes.fromhex(known_key_hex)
                            if _verify_enc_key_v4(enc_key, page1):
                                key_map[salt_hex] = known_key_hex
                                remaining_salts.discard(salt_hex)
                                break
                        except ValueError:
                            pass
                    break

    return key_map


def decrypt_db_v4(db_path, enc_key_hex, output_path):
    """
    Decrypt a WeChat 4.x database (SQLCipher 4).

    Page layout (4096 bytes each):
      Page 1 : salt(16) | encrypted(4000) | IV(16) | HMAC(64)
      Page N : encrypted(4016) | IV(16) | HMAC(64)

    The enc_key IS the AES-256 key (no additional KDF required for decryption).
    """
    try:
        from Crypto.Cipher import AES
    except ImportError:
        print("Please install: pip install pycryptodome", file=sys.stderr)
        return False

    PAGE_SZ = 4096
    RESERVE_SZ = 80
    SQLITE_HDR = b"SQLite format 3\x00"

    try:
        enc_key = bytes.fromhex(enc_key_hex)
    except ValueError:
        return False

    try:
        with open(db_path, "rb") as f:
            raw = f.read()
    except OSError:
        return False

    if len(raw) < PAGE_SZ:
        return False

    total_pages = len(raw) // PAGE_SZ
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

    try:
        with open(output_path, "wb") as fout:
            for pgno in range(total_pages):
                page = raw[pgno * PAGE_SZ: (pgno + 1) * PAGE_SZ]
                if len(page) < PAGE_SZ:
                    break
                # IV is at the start of the reserve area
                iv = page[PAGE_SZ - RESERVE_SZ: PAGE_SZ - RESERVE_SZ + 16]
                if pgno == 0:
                    encrypted = page[16: PAGE_SZ - RESERVE_SZ]
                    cipher = AES.new(enc_key, AES.MODE_CBC, iv)
                    decrypted = cipher.decrypt(encrypted)
                    fout.write(SQLITE_HDR + decrypted + b"\x00" * RESERVE_SZ)
                else:
                    encrypted = page[:PAGE_SZ - RESERVE_SZ]
                    cipher = AES.new(enc_key, AES.MODE_CBC, iv)
                    decrypted = cipher.decrypt(encrypted)
                    fout.write(decrypted + b"\x00" * RESERVE_SZ)
    except OSError:
        return False

    import sqlite3
    try:
        conn = sqlite3.connect(output_path)
        conn.execute("SELECT name FROM sqlite_master LIMIT 1")
        conn.close()
        return True
    except sqlite3.DatabaseError:
        try:
            os.remove(output_path)
        except OSError:
            pass
        return False


# === WeChat data directory helpers ===========================================

def _detect_all_v4_db_dirs_windows():
    """Detect ALL WeChat 4.x db_storage paths on Windows.

    Returns a list of db_storage paths sorted by most recently active first.
    """
    appdata = os.environ.get("APPDATA", "")
    config_dir = os.path.join(appdata, "Tencent", "xwechat", "config")
    if not os.path.isdir(config_dir):
        return []

    data_roots = []
    for ini_file in glob.glob(os.path.join(config_dir, "*.ini")):
        try:
            content = None
            for enc in ("utf-8", "gbk"):
                try:
                    with open(ini_file, "r", encoding=enc) as f:
                        content = f.read(1024).strip()
                    break
                except UnicodeDecodeError:
                    continue
            if not content or any(c in content for c in "\n\r\x00"):
                continue
            if os.path.isdir(content):
                data_roots.append(content)
        except OSError:
            continue

    seen = set()
    candidates = []
    for root in data_roots:
        pattern = os.path.join(root, "xwechat_files", "*", "db_storage")
        for match in glob.glob(pattern):
            normalized = os.path.normcase(os.path.normpath(match))
            if os.path.isdir(match) and normalized not in seen:
                seen.add(normalized)
                candidates.append(match)
    return candidates


def get_wechat_data_dir():
    """Return the WeChat user data root directory (single, for 3.x/macOS)."""
    if IS_WINDOWS:
        dirs = _detect_all_v4_db_dirs_windows()
        if dirs:
            return dirs[0]
        # WeChat 3.x fallback
        documents = Path.home() / "Documents" / "WeChat Files"
        if documents.exists():
            return str(documents)
        try:
            alt = Path("C:/Users") / os.getlogin() / "Documents" / "WeChat Files"
            if alt.exists():
                return str(alt)
        except Exception:
            pass
    elif IS_MACOS:
        containers = (Path.home() / "Library" / "Containers"
                      / "com.tencent.xinWeChat" / "Data")
        if containers.exists():
            return str(containers)
        app_support = (Path.home() / "Library" / "Application Support"
                       / "com.tencent.xinWeChat")
        if app_support.exists():
            return str(app_support)
    return None


def find_db_files(db_dir):
    """Find WeChat message database files under db_dir (3.x / macOS paths)."""
    db_dir = Path(db_dir)
    candidates = []

    for i in range(20):
        p = db_dir / f"MSG{i}.db"
        if p.exists():
            candidates.append(str(p))

    multi_dir = db_dir / "Multi"
    if multi_dir.exists():
        for i in range(20):
            p = multi_dir / f"MSG{i}.db"
            if p.exists():
                candidates.append(str(p))

    message_dir = db_dir / "Message"
    if message_dir.exists():
        for f in sorted(message_dir.glob("msg_*.db")):
            candidates.append(str(f))

    micro_msg = db_dir / "MicroMsg.db"
    if micro_msg.exists():
        candidates.insert(0, str(micro_msg))

    if not candidates:
        for f in sorted(db_dir.glob("**/MSG*.db")):
            candidates.append(str(f))
        for f in sorted(db_dir.glob("**/msg_*.db")):
            candidates.append(str(f))
        micro = list(db_dir.glob("**/MicroMsg.db"))
        if micro:
            candidates.insert(0, str(micro[0]))

    return candidates


def find_wxid_dirs(data_dir):
    """Find account directories inside the WeChat data root."""
    data_path = Path(data_dir)

    if IS_WINDOWS:
        wxid_dirs = [d for d in data_path.iterdir()
                     if d.is_dir() and d.name.startswith("wxid_")]
        if not wxid_dirs:
            wxid_dirs = [d for d in data_path.iterdir()
                         if d.is_dir() and (d / "Msg").exists()]
    elif IS_MACOS:
        wxid_dirs = []
        for version_dir in data_path.iterdir():
            if not version_dir.is_dir():
                continue
            for account_dir in version_dir.iterdir():
                if not account_dir.is_dir():
                    continue
                if (account_dir / "Message").exists() or (account_dir / "Msg").exists():
                    wxid_dirs.append(account_dir)
    else:
        wxid_dirs = []

    return wxid_dirs


def find_msg_dir(wxid_dir):
    """Locate the message database subdirectory within an account dir."""
    for name in ("Message", "Msg", "msg"):
        candidate = wxid_dir / name
        if candidate.exists():
            return candidate
    return wxid_dir


# === Windows 3.x key extraction (pymem / WeChatWin.dll) ======================

def _find_pid_with_dll(dll_name):
    """Return (pid, pymem_instance, module) for the first WeChat process with dll_name."""
    try:
        import pymem
        import pymem.process
        import psutil
    except ImportError:
        return None

    for proc in psutil.process_iter(["pid", "name"]):
        try:
            name = (proc.info["name"] or "").lower()
            if "wechat" not in name:
                continue
            pm = pymem.Pymem(proc.info["pid"])
            module = pymem.process.module_from_name(pm.process_handle, dll_name)
            if module:
                return (proc.info["pid"], pm, module)
        except Exception:
            continue
    return None


def extract_key_windows(pid):
    """Extract WeChat 3.x key from WeChatWin.dll via pymem."""
    try:
        import pymem
        import pymem.process
    except ImportError:
        print("Please install: pip install pymem", file=sys.stderr)
        sys.exit(1)

    found = _find_pid_with_dll("WeChatWin.dll")
    if not found:
        print("Error: WeChatWin.dll not found in any WeChat process", file=sys.stderr)
        return None

    _, pm, wechat_module = found
    key_candidates = []

    try:
        module_base = wechat_module.lpBaseOfDll
        module_size = wechat_module.SizeOfImage
        chunk_size = 0x100000
        phone_pattern = b"iphone\x00"
        offset = 0

        while offset < module_size:
            to_read = min(chunk_size, module_size - offset)
            try:
                chunk = pm.read_bytes(module_base + offset, to_read)
            except Exception:
                offset += chunk_size
                continue

            pos = 0
            while True:
                idx = chunk.find(phone_pattern, pos)
                if idx == -1:
                    break
                key_offset = idx - 0x70
                if key_offset >= 0:
                    key_candidate = chunk[key_offset: key_offset + 32]
                    if len(key_candidate) == 32 and key_candidate != b"\x00" * 32:
                        key_candidates.append(key_candidate)
                pos = idx + 1
            offset += chunk_size

    except Exception as e:
        print(f"Memory scan error: {e}", file=sys.stderr)

    if not key_candidates:
        return _fallback_key_windows(pm)

    return key_candidates[0].hex()


def _fallback_key_windows(pm):
    """Fallback key extraction for WeChat 3.9.x and below."""
    known_prefixes = [
        bytes.fromhex("0400000020000000"),
        bytes.fromhex("0100000020000000"),
    ]
    try:
        import pymem.process
        for module in pm.list_modules():
            mod_name = getattr(module, "name", None) or getattr(module, "szModule", b"")
            if isinstance(mod_name, bytes):
                mod_name = mod_name.decode(errors="ignore")
            if "WeChatWin" not in mod_name:
                continue
            base = module.lpBaseOfDll
            size = module.SizeOfImage
            chunk_size = 0x200000
            offset = 0
            while offset < size:
                to_read = min(chunk_size, size - offset)
                try:
                    chunk = pm.read_bytes(base + offset, to_read)
                except Exception:
                    offset += chunk_size
                    continue
                for prefix in known_prefixes:
                    idx = 0
                    while True:
                        found = chunk.find(prefix, idx)
                        if found == -1:
                            break
                        key_start = found + len(prefix)
                        key_candidate = chunk[key_start: key_start + 32]
                        if len(key_candidate) == 32 and key_candidate != b"\x00" * 32:
                            return key_candidate.hex()
                        idx = found + 1
                offset += chunk_size
    except Exception:
        pass
    return None


# === macOS key extraction =====================================================

def extract_key_macos(pid):
    """Extract WeChat key from macOS process memory."""
    key = _extract_key_macos_lldb(pid)
    if key:
        return key
    return _extract_key_macos_keychain()


def _extract_key_macos_lldb(pid):
    lldb_script = f"""
import lldb
debugger = lldb.SBDebugger.Create()
debugger.SetAsync(False)
target = debugger.CreateTarget("")
error = lldb.SBError()
process = target.AttachToProcessWithID(debugger.GetListener(), {pid}, error)
if error.Fail():
    print("ATTACH_FAILED:" + error.GetCString())
else:
    regions = process.GetMemoryRegions()
    found_keys = []
    for i in range(regions.GetSize()):
        region = lldb.SBMemoryRegionInfo()
        regions.GetMemoryRegionAtIndex(i, region)
        if not region.IsReadable():
            continue
        base = region.GetRegionBase()
        size = region.GetRegionEnd() - base
        if size > 0x1000000 or size < 0x1000:
            continue
        try:
            content = process.ReadMemory(base, min(size, 0x200000), error)
            if error.Fail() or not content:
                continue
            for pattern in [b"iphone\\x00", b"android\\x00"]:
                idx = 0
                while True:
                    pos = content.find(pattern, idx)
                    if pos == -1:
                        break
                    key_offset = pos - 0x70
                    if key_offset >= 0:
                        candidate = content[key_offset:key_offset+32]
                        if len(candidate) == 32 and candidate != b"\\x00" * 32:
                            found_keys.append(candidate.hex())
                    idx = pos + 1
        except:
            continue
    process.Detach()
    if found_keys:
        print("KEY_FOUND:" + found_keys[0])
    else:
        print("KEY_NOT_FOUND")
"""
    try:
        result = subprocess.run(
            ["python3", "-c", f"exec({repr(lldb_script)})"],
            capture_output=True, text=True, timeout=30,
        )
        for line in result.stdout.splitlines():
            if line.startswith("KEY_FOUND:"):
                return line.split(":", 1)[1].strip()
    except Exception as e:
        print(f"lldb method failed: {e}", file=sys.stderr)
    return None


def _extract_key_macos_keychain():
    try:
        result = subprocess.run(
            ["security", "find-generic-password", "-s", "com.tencent.xinWeChat", "-w"],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    except Exception:
        pass
    return None


# === Key validation & decryption (3.x / macOS) ===============================

def test_key(db_path, key_hex):
    """Validate a 3.x key against a DB (PBKDF2-SHA1 / AES-CBC)."""
    try:
        key_bytes = bytes.fromhex(key_hex)
        with open(db_path, "rb") as f:
            header = f.read(4096)
        if len(header) < 4096:
            return False
        from Crypto.Hash import HMAC, SHA1
        from Crypto.Protocol.KDF import PBKDF2
        from Crypto.Cipher import AES
        salt = header[:16]
        key = PBKDF2(key_bytes, salt, dkLen=32, count=4000,
                     prf=lambda p, s: HMAC.new(p, s, SHA1).digest())
        iv = header[16:32]
        cipher = AES.new(key, AES.MODE_CBC, iv)
        decrypted = cipher.decrypt(header[32:48])
        return decrypted != b"\x00" * 16
    except Exception:
        return False


def decrypt_db(db_path, key_hex, output_path):
    """
    Decrypt a WeChat 3.x / macOS database (SQLCipher 3).
    Parameters: AES-256-CBC, PBKDF2-SHA1, 4000 iterations.
    """
    try:
        from Crypto.Hash import HMAC, SHA1
        from Crypto.Protocol.KDF import PBKDF2
        from Crypto.Cipher import AES
    except ImportError:
        print("Please install: pip install pycryptodome", file=sys.stderr)
        sys.exit(1)

    PAGE_SIZE = 4096
    SQLITE_HEADER = b"SQLite format 3\x00"
    key_bytes = bytes.fromhex(key_hex)

    with open(db_path, "rb") as f:
        raw = f.read()

    if len(raw) < PAGE_SIZE:
        return False

    salt = raw[:16]
    key = PBKDF2(key_bytes, salt, dkLen=32, count=4000,
                 prf=lambda p, s: HMAC.new(p, s, SHA1).digest())
    output = bytearray()

    for page_num in range(len(raw) // PAGE_SIZE):
        page = raw[page_num * PAGE_SIZE: (page_num + 1) * PAGE_SIZE]
        if page_num == 0:
            iv = page[16:32]
            cipher = AES.new(key, AES.MODE_CBC, iv)
            decrypted_content = cipher.decrypt(page[32: PAGE_SIZE - 32])
            decrypted_page = SQLITE_HEADER + decrypted_content[len(SQLITE_HEADER):]
            output.extend(decrypted_page)
            output.extend(b"\x00" * 32)
        else:
            iv = page[-48:-32]
            cipher = AES.new(key, AES.MODE_CBC, iv)
            decrypted_content = cipher.decrypt(page[:PAGE_SIZE - 48])
            output.extend(decrypted_content)
            output.extend(b"\x00" * 48)

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    with open(output_path, "wb") as f:
        f.write(output)

    import sqlite3
    try:
        conn = sqlite3.connect(output_path)
        conn.execute("SELECT name FROM sqlite_master LIMIT 1")
        conn.close()
        return True
    except sqlite3.DatabaseError:
        os.remove(output_path)
        return False


# === Main entry point =========================================================

def main():
    if not IS_WINDOWS and not IS_MACOS:
        print("Error: only Windows and macOS are supported", file=sys.stderr)
        sys.exit(1)

    parser = argparse.ArgumentParser(
        description="WeChat PC/Mac database decryption tool",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--db-dir", help="WeChat message database directory")
    parser.add_argument("--db", help="Single database file path")
    parser.add_argument("--output", default="./decrypted",
                        help="Output directory (default: ./decrypted)")
    parser.add_argument("--key", help="Known key hex string (skips memory extraction)")
    parser.add_argument("--find-key-only", action="store_true",
                        help="Print key(s) and exit without decrypting")
    parser.add_argument("--test-db",
                        help="Test --key validity against this DB file")
    parser.add_argument("--json-progress", action="store_true",
                        help="Emit progress as JSON lines on stdout")
    parser.add_argument("--output-file",
                        help="Write final JSON result to file (for elevated subprocess)")
    args = parser.parse_args()

    def emit(step, progress, message, **extra):
        if args.json_progress:
            obj = {"step": step, "progress": progress, "message": message}
            obj.update(extra)
            print(json.dumps(obj, ensure_ascii=False), flush=True)
        else:
            print(message, flush=True)
        if args.output_file and step in ("error", "done"):
            try:
                payload = {"success": step == "done",
                           "error": message if step == "error" else None}
                payload.update(extra)
                with open(args.output_file, "w", encoding="utf-8") as _f:
                    json.dump(payload, _f, ensure_ascii=False)
            except Exception:
                pass

    platform_name = "Windows" if IS_WINDOWS else "macOS"
    emit("init", 0, f"Platform: {platform_name}")

    # ── WeChat 4.x Windows: Weixin.exe detected ───────────────────────────────
    if IS_WINDOWS and not args.key:
        v4_pids = _get_weixin_pids()
        if v4_pids:
            emit("key", 5,
                 f"WeChat 4.x detected (Weixin.exe, {len(v4_pids)} process(es))")

            # Determine DB directory(s)
            db_dirs = []
            if args.db_dir:
                db_dirs = [args.db_dir]
            else:
                v4_dirs = _detect_all_v4_db_dirs_windows()
                if v4_dirs:
                    db_dirs = v4_dirs
                    emit("key", 8,
                         f"Found {len(v4_dirs)} account(s): "
                         + ", ".join(Path(d).parent.name for d in v4_dirs))
                else:
                    # Fall back to 3.x-style detection
                    data_dir = get_wechat_data_dir()
                    if data_dir:
                        wxid_dirs = find_wxid_dirs(data_dir)
                        db_dirs = [str(d) for d in wxid_dirs] if wxid_dirs else [data_dir]

            if not db_dirs:
                emit("error", 0,
                     "WeChat data directory not found. Use --db-dir to specify.")
                sys.exit(1)

            # Collect all DB files from all account directories
            emit("key", 10, "Collecting database files...")
            db_files = []
            salt_to_dbs = {}
            for dd in db_dirs:
                df, std = _collect_db_files_v4(dd)
                # Prefix relative paths with account name to avoid collisions
                if len(db_dirs) > 1:
                    acct_name = Path(dd).parent.name  # e.g. "xiami0409_833a"
                    df = [(os.path.join(acct_name, rel), p, sz, sh, pg)
                          for rel, p, sz, sh, pg in df]
                    std = {k: [os.path.join(acct_name, r) for r in v]
                           for k, v in std.items()}
                db_files.extend(df)
                for k, v in std.items():
                    salt_to_dbs.setdefault(k, []).extend(v)

            if not db_files:
                emit("error", 0,
                     f"No database files found in {db_dir}. "
                     "Use --db-dir to specify the correct directory.")
                sys.exit(1)

            emit("key", 15,
                 f"Found {len(db_files)} DB file(s), {len(salt_to_dbs)} unique salt(s)")

            if args.find_key_only:
                key_map = _extract_all_keys_v4(db_files, salt_to_dbs, emit)
                emit("done", 100, f"Found {len(key_map)}/{len(salt_to_dbs)} keys",
                     keys=key_map)
                if not args.json_progress:
                    for sh, kh in key_map.items():
                        print(f"  salt={sh}  enc_key={kh}")
                return

            if args.test_db:
                key_map = _extract_all_keys_v4(db_files, salt_to_dbs, emit)
                if not key_map:
                    emit("error", 0, "No keys found in memory")
                    sys.exit(1)
                with open(args.test_db, "rb") as f:
                    p1 = f.read(4096)
                sh = p1[:16].hex()
                kh = key_map.get(sh)
                if kh and _verify_enc_key_v4(bytes.fromhex(kh), p1):
                    emit("done", 100, "Key is valid (WeChat 4.x)")
                else:
                    emit("error", 0, "Key not found or invalid for this database")
                return

            # Scan memory for per-DB enc_keys
            emit("key", 18, "Scanning Weixin.exe memory for enc_keys...")
            key_map = _extract_all_keys_v4(db_files, salt_to_dbs, emit)

            if not key_map:
                emit("error", 0,
                     "Failed to extract any keys. "
                     "Make sure WeChat is logged in and running.")
                sys.exit(1)

            emit("key", 40,
                 f"Extracted {len(key_map)}/{len(salt_to_dbs)} key(s)")

            # Decrypt each DB with its matching enc_key
            output_dir = Path(args.output)
            output_dir.mkdir(parents=True, exist_ok=True)

            success_count = 0
            for i, (rel, path, size, salt_hex, _page1) in enumerate(db_files):
                enc_key_hex = key_map.get(salt_hex)
                pct = 40 + int((i / len(db_files)) * 55)
                if not enc_key_hex:
                    emit("warn", pct, f"No key for {rel}, skipping")
                    continue
                out_path = str(output_dir / rel)
                os.makedirs(os.path.dirname(out_path), exist_ok=True)
                emit("decrypt", pct, f"Decrypting {rel}...")
                if decrypt_db_v4(path, enc_key_hex, out_path):
                    success_count += 1
                else:
                    emit("warn", pct, f"Failed to decrypt {rel}")

            emit("done", 100,
                 f"Decrypted {success_count}/{len(db_files)} files",
                 output_dir=str(output_dir.absolute()),
                 decrypted_count=success_count)
            return

    # ── WeChat 3.x / macOS: single-key flow ───────────────────────────────────
    key_hex = args.key

    if not key_hex:
        emit("key", 5, "Locating WeChat process...")
        pid = find_wechat_pid()
        if not pid:
            emit("error", 0, "WeChat process not found. Please open WeChat and log in.")
            sys.exit(1)
        emit("key", 15, f"Found WeChat process PID: {pid}")

        emit("key", 20, "Extracting key from process memory...")
        if IS_WINDOWS:
            key_hex = extract_key_windows(pid)
        else:
            key_hex = extract_key_macos(pid)

        if not key_hex:
            emit("error", 0,
                 "Failed to extract key. Make sure WeChat is running and logged in.")
            sys.exit(1)
        emit("key", 40, "Key extracted successfully")

    if args.find_key_only:
        emit("done", 100, "Key extracted", key=key_hex)
        if not args.json_progress:
            print(f"\nKey (hex): {key_hex}")
        return

    if args.test_db:
        if test_key(args.test_db, key_hex):
            emit("done", 100, "Key is valid")
        else:
            emit("error", 0, "Key is invalid or file format not supported")
        return

    db_files_list = []
    if args.db:
        db_files_list = [args.db]
    elif args.db_dir:
        db_files_list = find_db_files(args.db_dir)
        if not db_files_list:
            emit("error", 0, f"No database files found in {args.db_dir}")
            sys.exit(1)
        emit("decrypt", 45, f"Found {len(db_files_list)} database file(s)")
    else:
        data_dir = get_wechat_data_dir()
        if not data_dir:
            emit("error", 0,
                 "WeChat data directory not found. Use --db-dir to specify manually.")
            sys.exit(1)
        emit("decrypt", 42, f"WeChat data dir: {data_dir}")
        wxid_dirs = find_wxid_dirs(data_dir)
        if not wxid_dirs:
            emit("error", 0,
                 "No account directories found. Use --db-dir to specify manually.")
            sys.exit(1)
        wxid_dir = wxid_dirs[0]
        msg_dir = find_msg_dir(wxid_dir)
        db_files_list = find_db_files(str(msg_dir))
        emit("decrypt", 45,
             f"Found {len(db_files_list)} database file(s) in account {wxid_dir.name}")

    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    success_count = 0
    for i, db_path in enumerate(db_files_list):
        db_name = Path(db_path).name
        out_path = str(output_dir / db_name)
        pct = 45 + int((i / len(db_files_list)) * 50)
        emit("decrypt", pct, f"Decrypting {db_name}...")
        if decrypt_db(db_path, key_hex, out_path):
            success_count += 1
        else:
            emit("warn", pct, f"Failed to decrypt {db_name} (key mismatch?)")

    emit("done", 100,
         f"Decrypted {success_count}/{len(db_files_list)} files",
         output_dir=str(output_dir.absolute()),
         decrypted_count=success_count)


if __name__ == "__main__":
    main()
