'use strict';

/**
 * WeChat PC database decryption tool (Node.js port)
 *
 * Supports:
 *   - Windows WeChat 4.x: koffi-based memory scan of Weixin.exe,
 *     per-DB enc_key extraction, SQLCipher 4 (AES-256-CBC, reserve=80)
 *   - Windows WeChat 3.x: process memory pattern scan,
 *     SQLCipher 3 (PBKDF2-SHA1, 4000 iterations)
 *   - macOS WeChat: lldb-based memory scan + Keychain
 *
 * Dependencies:
 *   npm install koffi better-sqlite3
 *   koffi is lazy-loaded and only required on Windows for memory scanning.
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const IS_WINDOWS = process.platform === 'win32';
const IS_MACOS = process.platform === 'darwin';

const PAGE_SZ = 4096;
const SALT_SZ = 16;
const KEY_SZ = 32;
const RESERVE_SZ = 80; // IV(16) + HMAC(64)
const SQLITE_HDR = Buffer.from('SQLite format 3\x00');


// =============================================================================
// A. Process Discovery
// =============================================================================

/**
 * Find a WeChat process PID (3.x / macOS).
 * On Windows: parse `tasklist` output.
 * On macOS: parse `ps` output.
 * @returns {number|null}
 */
function findWechatPid() {
  if (IS_WINDOWS) {
    const exactNames = new Set([
      'wechat.exe', 'wechatapp.exe', 'wechatappex.exe', 'weixin.exe',
    ]);
    try {
      const out = execFileSync('tasklist', ['/FO', 'CSV', '/NH'], {
        encoding: 'utf-8',
        windowsHide: true,
      });
      let fuzzyPid = null;
      for (const line of out.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const parts = trimmed.replace(/^"|"$/g, '').split('","');
        if (parts.length < 2) continue;
        const name = (parts[0] || '').toLowerCase();
        const pid = parseInt(parts[1], 10);
        if (isNaN(pid)) continue;
        if (exactNames.has(name)) return pid;
        if (name.includes('wechat') && name.endsWith('.exe') && !fuzzyPid) {
          fuzzyPid = pid;
        }
      }
      return fuzzyPid;
    } catch {
      return null;
    }
  }

  if (IS_MACOS) {
    try {
      const out = execFileSync('ps', ['-eo', 'pid,comm'], { encoding: 'utf-8' });
      for (const line of out.split('\n')) {
        const trimmed = line.trim();
        const spaceIdx = trimmed.indexOf(' ');
        if (spaceIdx === -1) continue;
        const pid = parseInt(trimmed.slice(0, spaceIdx), 10);
        const comm = trimmed.slice(spaceIdx + 1).trim().toLowerCase();
        const basename = path.basename(comm);
        if (basename === 'wechat' || basename === '\u5fae\u4fe1') {
          return pid;
        }
      }
    } catch {
      // ignore
    }
    return null;
  }

  return null;
}

/**
 * Find all Weixin.exe PIDs sorted by memory descending.
 * @returns {Array<{pid: number, memKb: number}>}
 */
function getWeixinPids() {
  if (!IS_WINDOWS) return [];
  try {
    const out = execFileSync(
      'tasklist',
      ['/FI', 'IMAGENAME eq Weixin.exe', '/FO', 'CSV', '/NH'],
      { encoding: 'utf-8', windowsHide: true }
    );
    const pids = [];
    for (const line of out.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.replace(/^"|"$/g, '').split('","');
      if (parts.length < 5) continue;
      try {
        const pid = parseInt(parts[1], 10);
        const memStr = (parts[4] || '').replace(/,/g, '').replace(/\s*K\s*/i, '').trim();
        const mem = parseInt(memStr, 10) || 0;
        if (!isNaN(pid)) pids.push({ pid, memKb: mem });
      } catch {
        // skip malformed line
      }
    }
    pids.sort((a, b) => b.memKb - a.memKb);
    return pids;
  } catch {
    return [];
  }
}


// =============================================================================
// B. WeChat 4.x Directory Detection
// =============================================================================

/**
 * Detect ALL WeChat 4.x db_storage paths on Windows.
 * Reads %APPDATA%/Tencent/xwechat/config/ *.ini files, each containing a data root path.
 * Then globs for {root}/xwechat_files/{account}/db_storage/.
 * @returns {string[]} db_storage paths sorted by most recently active first
 */
function detectAllV4DbDirsWindows() {
  const appdata = process.env.APPDATA || '';
  const configDir = path.join(appdata, 'Tencent', 'xwechat', 'config');
  if (!_isDir(configDir)) return [];

  const dataRoots = [];
  let iniFiles;
  try {
    iniFiles = fs.readdirSync(configDir).filter(f => f.endsWith('.ini'));
  } catch {
    return [];
  }

  for (const iniName of iniFiles) {
    const iniPath = path.join(configDir, iniName);
    try {
      let content = null;
      for (const enc of ['utf-8', 'latin1']) {
        try {
          content = fs.readFileSync(iniPath, { encoding: enc }).slice(0, 1024).trim();
          break;
        } catch {
          continue;
        }
      }
      if (!content) continue;
      // Skip if content has newlines or null bytes (not a simple path)
      if (/[\n\r\x00]/.test(content)) continue;
      if (_isDir(content)) {
        dataRoots.push(content);
      }
    } catch {
      continue;
    }
  }

  const seen = new Set();
  const candidates = [];
  for (const root of dataRoots) {
    const xwechatFiles = path.join(root, 'xwechat_files');
    if (!_isDir(xwechatFiles)) continue;
    let entries;
    try {
      entries = fs.readdirSync(xwechatFiles);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const dbStorage = path.join(xwechatFiles, entry, 'db_storage');
      if (!_isDir(dbStorage)) continue;
      const normalized = path.normalize(dbStorage).toLowerCase();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        candidates.push(dbStorage);
      }
    }
  }
  return candidates;
}

/**
 * Return the WeChat user data root directory (single, for 3.x / macOS).
 * @returns {string|null}
 */
function getWechatDataDir() {
  if (IS_WINDOWS) {
    const dirs = detectAllV4DbDirsWindows();
    if (dirs.length > 0) return dirs[0];

    // WeChat 3.x fallback
    const documents = path.join(os.homedir(), 'Documents', 'WeChat Files');
    if (_isDir(documents)) return documents;

    try {
      const alt = path.join('C:\\Users', os.userInfo().username, 'Documents', 'WeChat Files');
      if (_isDir(alt)) return alt;
    } catch {
      // ignore
    }
  } else if (IS_MACOS) {
    const containers = path.join(
      os.homedir(), 'Library', 'Containers',
      'com.tencent.xinWeChat', 'Data'
    );
    if (_isDir(containers)) return containers;

    const appSupport = path.join(
      os.homedir(), 'Library', 'Application Support',
      'com.tencent.xinWeChat'
    );
    if (_isDir(appSupport)) return appSupport;
  }
  return null;
}

/**
 * Find WeChat message database files under dbDir (3.x / macOS paths).
 * @param {string} dbDir
 * @returns {string[]}
 */
function findDbFiles(dbDir) {
  const candidates = [];

  // MSG0..MSG19 in root
  for (let i = 0; i < 20; i++) {
    const p = path.join(dbDir, `MSG${i}.db`);
    if (_isFile(p)) candidates.push(p);
  }

  // Multi/MSG0..MSG19
  const multiDir = path.join(dbDir, 'Multi');
  if (_isDir(multiDir)) {
    for (let i = 0; i < 20; i++) {
      const p = path.join(multiDir, `MSG${i}.db`);
      if (_isFile(p)) candidates.push(p);
    }
  }

  // Message/msg_*.db
  const messageDir = path.join(dbDir, 'Message');
  if (_isDir(messageDir)) {
    try {
      const files = fs.readdirSync(messageDir)
        .filter(f => /^msg_.*\.db$/.test(f))
        .sort();
      for (const f of files) {
        candidates.push(path.join(messageDir, f));
      }
    } catch {
      // ignore
    }
  }

  // MicroMsg.db at front
  const microMsg = path.join(dbDir, 'MicroMsg.db');
  if (_isFile(microMsg)) {
    candidates.unshift(microMsg);
  }

  // Fallback: recursive glob
  if (candidates.length === 0) {
    const found = _globRecursive(dbDir, /^MSG.*\.db$/i);
    candidates.push(...found.sort());
    const msgFiles = _globRecursive(dbDir, /^msg_.*\.db$/i);
    candidates.push(...msgFiles.sort());
    const micro = _globRecursive(dbDir, /^MicroMsg\.db$/i);
    if (micro.length > 0) candidates.unshift(micro[0]);
  }

  return candidates;
}

/**
 * Find account directories inside the WeChat data root.
 * @param {string} dataDir
 * @returns {string[]}
 */
function findWxidDirs(dataDir) {
  if (IS_WINDOWS) {
    let entries;
    try {
      entries = fs.readdirSync(dataDir);
    } catch {
      return [];
    }
    // Look for wxid_ prefixed directories
    let wxidDirs = entries
      .filter(e => e.startsWith('wxid_'))
      .map(e => path.join(dataDir, e))
      .filter(p => _isDir(p));
    // Fallback: directories containing a Msg subdirectory
    if (wxidDirs.length === 0) {
      wxidDirs = entries
        .map(e => path.join(dataDir, e))
        .filter(p => _isDir(p) && _isDir(path.join(p, 'Msg')));
    }
    return wxidDirs;
  }

  if (IS_MACOS) {
    const wxidDirs = [];
    let versionDirs;
    try {
      versionDirs = fs.readdirSync(dataDir);
    } catch {
      return [];
    }
    for (const vd of versionDirs) {
      const versionPath = path.join(dataDir, vd);
      if (!_isDir(versionPath)) continue;
      let accountDirs;
      try {
        accountDirs = fs.readdirSync(versionPath);
      } catch {
        continue;
      }
      for (const ad of accountDirs) {
        const accountPath = path.join(versionPath, ad);
        if (!_isDir(accountPath)) continue;
        if (_isDir(path.join(accountPath, 'Message')) || _isDir(path.join(accountPath, 'Msg'))) {
          wxidDirs.push(accountPath);
        }
      }
    }
    return wxidDirs;
  }

  return [];
}

/**
 * Locate the message database subdirectory within an account dir.
 * @param {string} wxidDir
 * @returns {string}
 */
function findMsgDir(wxidDir) {
  for (const name of ['Message', 'Msg', 'msg']) {
    const candidate = path.join(wxidDir, name);
    if (_isDir(candidate)) return candidate;
  }
  return wxidDir;
}


// =============================================================================
// C. DB File Collection for 4.x
// =============================================================================

/**
 * Walk dbDir recursively, collect all .db files with their page-1 salt.
 * @param {string} dbDir
 * @returns {{ dbFiles: Array<{rel: string, absPath: string, size: number, saltHex: string, page1: Buffer}>, saltToDbs: Object<string, string[]> }}
 */
function collectDbFilesV4(dbDir) {
  const dbFiles = [];
  const saltToDbs = {};

  _walkDir(dbDir, (absPath) => {
    const name = path.basename(absPath);
    if (!name.endsWith('.db')) return;
    if (name.endsWith('-wal') || name.endsWith('-shm')) return;

    let size;
    try {
      size = fs.statSync(absPath).size;
    } catch {
      return;
    }
    if (size < PAGE_SZ) return;

    let page1;
    try {
      const fd = fs.openSync(absPath, 'r');
      page1 = Buffer.alloc(PAGE_SZ);
      const bytesRead = fs.readSync(fd, page1, 0, PAGE_SZ, 0);
      fs.closeSync(fd);
      if (bytesRead < PAGE_SZ) return;
    } catch {
      return;
    }

    const rel = path.relative(dbDir, absPath);
    const saltHex = page1.subarray(0, SALT_SZ).toString('hex');
    dbFiles.push({ rel, absPath, size, saltHex, page1 });
    if (!saltToDbs[saltHex]) saltToDbs[saltHex] = [];
    saltToDbs[saltHex].push(rel);
  });

  return { dbFiles, saltToDbs };
}


// =============================================================================
// D. Crypto
// =============================================================================

/**
 * Verify a WeChat 4.x enc_key against DB page 1 using HMAC-SHA512.
 *
 * Algorithm (SQLCipher 4):
 *   macSalt  = salt XOR 0x3A (each byte)
 *   macKey   = PBKDF2-SHA512(encKey, macSalt, iterations=2, dklen=32)
 *   hmacData = page1[16:4032]
 *   storedHmac = page1[4032:4096]
 *   Compute HMAC-SHA512(macKey, hmacData + LE32(1))
 *   Compare with storedHmac
 *
 * @param {Buffer} encKey - 32-byte encryption key
 * @param {Buffer} page1 - 4096-byte first page
 * @returns {boolean}
 */
function verifyEncKeyV4(encKey, page1) {
  const salt = page1.subarray(0, SALT_SZ);

  // macSalt = salt XOR 0x3A
  const macSalt = Buffer.alloc(SALT_SZ);
  for (let i = 0; i < SALT_SZ; i++) {
    macSalt[i] = salt[i] ^ 0x3A;
  }

  // macKey = PBKDF2-SHA512(encKey, macSalt, 2 iterations, 32 bytes)
  const macKey = crypto.pbkdf2Sync(encKey, macSalt, 2, KEY_SZ, 'sha512');

  // hmacData = page1[16:4032]
  const hmacData = page1.subarray(SALT_SZ, PAGE_SZ - RESERVE_SZ + SALT_SZ);
  // storedHmac = page1[4032:4096]
  const storedHmac = page1.subarray(PAGE_SZ - KEY_SZ * 2, PAGE_SZ);

  // Compute HMAC-SHA512(macKey, hmacData + LE32(1))
  const pageNumberBuf = Buffer.alloc(4);
  pageNumberBuf.writeUInt32LE(1, 0);

  const hmac = crypto.createHmac('sha512', macKey);
  hmac.update(hmacData);
  hmac.update(pageNumberBuf);
  const computed = hmac.digest();

  return crypto.timingSafeEqual(computed.subarray(0, 64), storedHmac);
}

/**
 * Decrypt a WeChat 4.x database (SQLCipher 4).
 *
 * Page layout (4096 bytes each):
 *   Page 1: salt(16) | encrypted(4000) | IV(16) | HMAC(64)
 *   Page N: encrypted(4016) | IV(16) | HMAC(64)
 *
 * The enc_key IS the AES-256 key (no additional KDF for decryption).
 *
 * @param {string} dbPath - path to encrypted DB
 * @param {string} encKeyHex - hex-encoded 32-byte key
 * @param {string} outputPath - path for decrypted output
 * @returns {boolean}
 */
function decryptDbV4(dbPath, encKeyHex, outputPath) {
  let encKey;
  try {
    encKey = Buffer.from(encKeyHex, 'hex');
  } catch {
    return false;
  }
  if (encKey.length !== KEY_SZ) return false;

  let raw;
  try {
    raw = fs.readFileSync(dbPath);
  } catch {
    return false;
  }
  if (raw.length < PAGE_SZ) return false;

  const totalPages = Math.floor(raw.length / PAGE_SZ);
  const outDir = path.dirname(outputPath);
  if (outDir && outDir !== '.') {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const zeroPad = Buffer.alloc(RESERVE_SZ);
  const chunks = [];

  for (let pgno = 0; pgno < totalPages; pgno++) {
    const page = raw.subarray(pgno * PAGE_SZ, (pgno + 1) * PAGE_SZ);
    if (page.length < PAGE_SZ) break;

    // IV is at the start of the reserve area
    const iv = page.subarray(PAGE_SZ - RESERVE_SZ, PAGE_SZ - RESERVE_SZ + 16);

    if (pgno === 0) {
      const encrypted = page.subarray(16, PAGE_SZ - RESERVE_SZ);
      const decipher = crypto.createDecipheriv('aes-256-cbc', encKey, iv);
      decipher.setAutoPadding(false);
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      chunks.push(SQLITE_HDR);
      chunks.push(decrypted);
      chunks.push(zeroPad);
    } else {
      const encrypted = page.subarray(0, PAGE_SZ - RESERVE_SZ);
      const decipher = crypto.createDecipheriv('aes-256-cbc', encKey, iv);
      decipher.setAutoPadding(false);
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      chunks.push(decrypted);
      chunks.push(zeroPad);
    }
  }

  try {
    fs.writeFileSync(outputPath, Buffer.concat(chunks));
  } catch {
    return false;
  }

  // Verify the output is a valid SQLite database
  return _verifySqlite(outputPath);
}

/**
 * Decrypt a WeChat 3.x / macOS database (SQLCipher 3).
 * Parameters: AES-256-CBC, PBKDF2-SHA1, 4000 iterations.
 *
 * @param {string} dbPath
 * @param {string} keyHex
 * @param {string} outputPath
 * @returns {boolean}
 */
function decryptDb(dbPath, keyHex, outputPath) {
  let keyBytes;
  try {
    keyBytes = Buffer.from(keyHex, 'hex');
  } catch {
    return false;
  }

  let raw;
  try {
    raw = fs.readFileSync(dbPath);
  } catch {
    return false;
  }
  if (raw.length < PAGE_SZ) return false;

  const salt = raw.subarray(0, 16);
  const key = crypto.pbkdf2Sync(keyBytes, salt, 4000, 32, 'sha1');

  const chunks = [];
  const totalPages = Math.floor(raw.length / PAGE_SZ);

  for (let pageNum = 0; pageNum < totalPages; pageNum++) {
    const page = raw.subarray(pageNum * PAGE_SZ, (pageNum + 1) * PAGE_SZ);

    if (pageNum === 0) {
      // Page 1: salt(16) | IV(16) | encrypted(4032) | zeros(32)
      const iv = page.subarray(16, 32);
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      decipher.setAutoPadding(false);
      const encrypted = page.subarray(32, PAGE_SZ - 32);
      const decryptedContent = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      // Replace start with SQLite header
      const decryptedPage = Buffer.concat([
        SQLITE_HDR,
        decryptedContent.subarray(SQLITE_HDR.length),
      ]);
      chunks.push(decryptedPage);
      chunks.push(Buffer.alloc(32)); // zeros
    } else {
      // Page N: encrypted(4048) | IV(16) | zeros(32) -> total 4096
      // IV at [-48:-32], encrypted at [0:4048]
      const iv = page.subarray(PAGE_SZ - 48, PAGE_SZ - 32);
      const encrypted = page.subarray(0, PAGE_SZ - 48);
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      decipher.setAutoPadding(false);
      const decryptedContent = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      chunks.push(decryptedContent);
      chunks.push(Buffer.alloc(48)); // zeros
    }
  }

  const outDir = path.dirname(outputPath);
  if (outDir && outDir !== '.') {
    fs.mkdirSync(outDir, { recursive: true });
  }

  try {
    fs.writeFileSync(outputPath, Buffer.concat(chunks));
  } catch {
    return false;
  }

  return _verifySqlite(outputPath);
}

/**
 * Validate a 3.x key against a DB (PBKDF2-SHA1 / AES-CBC).
 * @param {string} dbPath
 * @param {string} keyHex
 * @returns {boolean}
 */
function testKey(dbPath, keyHex) {
  try {
    const keyBytes = Buffer.from(keyHex, 'hex');
    const fd = fs.openSync(dbPath, 'r');
    const header = Buffer.alloc(PAGE_SZ);
    const bytesRead = fs.readSync(fd, header, 0, PAGE_SZ, 0);
    fs.closeSync(fd);
    if (bytesRead < PAGE_SZ) return false;

    const salt = header.subarray(0, 16);
    const key = crypto.pbkdf2Sync(keyBytes, salt, 4000, 32, 'sha1');
    const iv = header.subarray(16, 32);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    decipher.setAutoPadding(false);
    const decrypted = Buffer.concat([
      decipher.update(header.subarray(32, 48)),
      decipher.final(),
    ]);
    return !decrypted.equals(Buffer.alloc(16));
  } catch {
    return false;
  }
}


// =============================================================================
// E. Memory Scanning (Windows only, via koffi)
// =============================================================================

/**
 * Scan all Weixin.exe process memory regions for per-DB enc_keys.
 *
 * WeChat 4.x caches WCDB keys as: x'<64hex_enc_key><32hex_salt>'
 * Each candidate is verified via HMAC-SHA512 against collected DB salts.
 *
 * @param {Array<{rel: string, absPath: string, size: number, saltHex: string, page1: Buffer}>} dbFiles
 * @param {Object<string, string[]>} saltToDbs
 * @param {function} emitFn - (step, progress, message) callback
 * @returns {Object<string, string>} saltHex -> encKeyHex map
 */
function extractAllKeysV4(dbFiles, saltToDbs, emitFn) {
  if (!IS_WINDOWS) return {};

  // Lazy-load koffi only when actually scanning (cached to avoid duplicate type registration)
  if (!extractAllKeysV4._koffiCache) {
    let koffi;
    try {
      koffi = require('koffi');
    } catch (err) {
      emitFn('key', 0, `Failed to load koffi: ${err.message}`);
      return {};
    }

    const kernel32 = koffi.load('kernel32.dll');
    const MEMORY_BASIC_INFORMATION = koffi.struct('MEMORY_BASIC_INFORMATION', {
      BaseAddress: 'uint64',
      AllocationBase: 'uint64',
      AllocationProtect: 'uint32',
      __alignment1: 'uint32',
      RegionSize: 'uint64',
      State: 'uint32',
      Protect: 'uint32',
      Type: 'uint32',
      __alignment2: 'uint32',
    });

    extractAllKeysV4._koffiCache = {
      koffi,
      MEMORY_BASIC_INFORMATION,
      OpenProcess: kernel32.func('void* __stdcall OpenProcess(uint32_t, bool, uint32_t)'),
      CloseHandle: kernel32.func('bool __stdcall CloseHandle(void*)'),
      VirtualQueryEx: kernel32.func(
        'size_t __stdcall VirtualQueryEx(void*, uint64_t, _Out_ MEMORY_BASIC_INFORMATION*, size_t)'
      ),
      ReadProcessMemory: kernel32.func(
        'bool __stdcall ReadProcessMemory(void*, uint64_t, _Out_ uint8_t*, size_t, _Out_ size_t*)'
      ),
    };
  }

  const { koffi, MEMORY_BASIC_INFORMATION, OpenProcess, CloseHandle, VirtualQueryEx, ReadProcessMemory } = extractAllKeysV4._koffiCache;

  const MEM_COMMIT = 0x1000;
  const READABLE = new Set([0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80]);
  const PROCESS_VM_READ = 0x0010;
  const PROCESS_QUERY_INFORMATION = 0x0400;

  const hexRe = /x'([0-9a-fA-F]{64,192})'/g;
  const keyMap = {};
  const remainingSalts = new Set(Object.keys(saltToDbs));

  const pids = getWeixinPids();
  if (pids.length === 0) return {};

  for (let pidIdx = 0; pidIdx < pids.length; pidIdx++) {
    if (remainingSalts.size === 0) break;
    const { pid, memKb } = pids[pidIdx];

    const hProcess = OpenProcess(PROCESS_VM_READ | PROCESS_QUERY_INFORMATION, false, pid);
    if (!hProcess) {
      emitFn('key', 25, `Cannot open PID=${pid}, skipping`);
      continue;
    }

    try {
      // Enumerate memory regions
      const regions = [];
      let addr = 0;
      const mbi = {};
      const mbiSize = koffi.sizeof(MEMORY_BASIC_INFORMATION);

      while (addr < 0x7FFFFFFFFFFF) {
        const result = VirtualQueryEx(hProcess, addr, mbi, mbiSize);
        if (result === 0) break;

        if (
          mbi.State === MEM_COMMIT &&
          READABLE.has(mbi.Protect) &&
          mbi.RegionSize > 0 &&
          mbi.RegionSize < 500 * 1024 * 1024
        ) {
          regions.push({ base: mbi.BaseAddress, size: Number(mbi.RegionSize) });
        }

        const next = Number(mbi.BaseAddress) + Number(mbi.RegionSize);
        if (next <= addr) break;
        addr = next;
      }

      const total = regions.length;
      emitFn(
        'key', 20 + pidIdx,
        `Scanning PID=${pid} (${Math.floor(memKb / 1024)}MB, ${total} regions)...`
      );

      for (let idx = 0; idx < regions.length; idx++) {
        if (remainingSalts.size === 0) break;
        const { base, size } = regions[idx];

        const buf = Buffer.alloc(size);
        const bytesRead = [0];
        const ok = ReadProcessMemory(hProcess, base, buf, size, bytesRead);
        if (!ok || bytesRead[0] === 0) continue;

        const data = buf.subarray(0, bytesRead[0]);
        // Convert to string for regex matching (latin1 preserves byte values 1:1)
        const dataStr = data.toString('latin1');

        let match;
        hexRe.lastIndex = 0;
        while ((match = hexRe.exec(dataStr)) !== null) {
          const hexStr = match[1];
          const hexLen = hexStr.length;

          const pairs = [];
          if (hexLen === 96) {
            pairs.push({ encKeyHex: hexStr.slice(0, 64), saltHex: hexStr.slice(64) });
          } else if (hexLen === 64) {
            for (const s of remainingSalts) {
              pairs.push({ encKeyHex: hexStr, saltHex: s });
            }
          } else if (hexLen > 96 && hexLen % 2 === 0) {
            pairs.push({ encKeyHex: hexStr.slice(0, 64), saltHex: hexStr.slice(-32) });
          }

          for (const { encKeyHex, saltHex } of pairs) {
            if (!remainingSalts.has(saltHex)) continue;
            let encKey;
            try {
              encKey = Buffer.from(encKeyHex, 'hex');
            } catch {
              continue;
            }
            if (encKey.length !== KEY_SZ) continue;

            // Verify against the DB file(s) with this salt
            for (const entry of dbFiles) {
              if (entry.saltHex === saltHex && verifyEncKeyV4(encKey, entry.page1)) {
                keyMap[saltHex] = encKeyHex;
                remainingSalts.delete(saltHex);
                const dbs = saltToDbs[saltHex];
                emitFn('key', 35, `Key found for: ${dbs.join(', ')}`);
                break;
              }
            }
          }
        }

        // Progress reporting every 300 regions
        if ((idx + 1) % 300 === 0) {
          const pct = 22 + Math.floor(((idx + 1) / total) * 13);
          emitFn(
            'key', pct,
            `${idx + 1}/${total} regions, ${Object.keys(keyMap).length}/${Object.keys(saltToDbs).length} keys`
          );
        }
      }
    } finally {
      CloseHandle(hProcess);
    }
  }

  // Cross-verify: try known keys against any remaining unmatched salts
  if (remainingSalts.size > 0 && Object.keys(keyMap).length > 0) {
    for (const saltHex of [...remainingSalts]) {
      for (const entry of dbFiles) {
        if (entry.saltHex === saltHex) {
          for (const knownKeyHex of Object.values(keyMap)) {
            try {
              const encKey = Buffer.from(knownKeyHex, 'hex');
              if (verifyEncKeyV4(encKey, entry.page1)) {
                keyMap[saltHex] = knownKeyHex;
                remainingSalts.delete(saltHex);
                break;
              }
            } catch {
              // skip invalid key
            }
          }
          break;
        }
      }
    }
  }

  return keyMap;
}

/**
 * Extract WeChat 3.x key from process memory on Windows.
 * Scans all process memory for "iphone\x00" pattern and known prefixes.
 * Uses the same VirtualQueryEx approach as 4.x scanning.
 *
 * @param {number} pid
 * @returns {string|null} hex key string or null
 */
function extractKeyWindows(pid) {
  if (!IS_WINDOWS) return null;

  // Cached to avoid duplicate koffi type registration on repeated calls
  if (!extractKeyWindows._koffiCache) {
    let koffi;
    try {
      koffi = require('koffi');
    } catch {
      return null;
    }

    const kernel32 = koffi.load('kernel32.dll');
    const MBI_3X = koffi.struct('MBI_3x', {
      BaseAddress: 'uint64',
      AllocationBase: 'uint64',
      AllocationProtect: 'uint32',
      __alignment1: 'uint32',
      RegionSize: 'uint64',
      State: 'uint32',
      Protect: 'uint32',
      Type: 'uint32',
      __alignment2: 'uint32',
    });

    extractKeyWindows._koffiCache = {
      koffi,
      MBI_3X,
      OpenProcess: kernel32.func('void* __stdcall OpenProcess(uint32_t, bool, uint32_t)'),
      CloseHandle: kernel32.func('bool __stdcall CloseHandle(void*)'),
      VirtualQueryEx: kernel32.func(
        'size_t __stdcall VirtualQueryEx(void*, uint64_t, _Out_ MBI_3x*, size_t)'
      ),
      ReadProcessMemory: kernel32.func(
        'bool __stdcall ReadProcessMemory(void*, uint64_t, _Out_ uint8_t*, size_t, _Out_ size_t*)'
      ),
    };
  }

  const { koffi, MBI_3X, OpenProcess, CloseHandle, VirtualQueryEx, ReadProcessMemory } = extractKeyWindows._koffiCache;

  const MEM_COMMIT = 0x1000;
  const READABLE = new Set([0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80]);
  const PROCESS_VM_READ = 0x0010;
  const PROCESS_QUERY_INFORMATION = 0x0400;

  const hProcess = OpenProcess(PROCESS_VM_READ | PROCESS_QUERY_INFORMATION, false, pid);
  if (!hProcess) return null;

  const phonePattern = Buffer.from('iphone\x00');
  const keyCandidates = [];
  const knownPrefixes = [
    Buffer.from('0400000020000000', 'hex'),
    Buffer.from('0100000020000000', 'hex'),
  ];

  try {
    let addr = 0;
    const mbi = {};
    const mbiSize = koffi.sizeof(MBI_3X);

    while (addr < 0x7FFFFFFFFFFF) {
      const result = VirtualQueryEx(hProcess, addr, mbi, mbiSize);
      if (result === 0) break;

      if (
        mbi.State === MEM_COMMIT &&
        READABLE.has(mbi.Protect) &&
        mbi.RegionSize > 0 &&
        mbi.RegionSize < 500 * 1024 * 1024
      ) {
        const regionSize = Number(mbi.RegionSize);
        const buf = Buffer.alloc(regionSize);
        const bytesRead = [0];
        const ok = ReadProcessMemory(hProcess, mbi.BaseAddress, buf, regionSize, bytesRead);

        if (ok && bytesRead[0] > 0) {
          const data = buf.subarray(0, bytesRead[0]);

          // Search for "iphone\x00" pattern, key is at offset -0x70
          let pos = 0;
          while (true) {
            const idx = data.indexOf(phonePattern, pos);
            if (idx === -1) break;
            const keyOffset = idx - 0x70;
            if (keyOffset >= 0) {
              const candidate = data.subarray(keyOffset, keyOffset + 32);
              if (candidate.length === 32 && !candidate.equals(Buffer.alloc(32))) {
                keyCandidates.push(Buffer.from(candidate));
              }
            }
            pos = idx + 1;
          }

          // Fallback: search for known prefixes
          for (const prefix of knownPrefixes) {
            let searchPos = 0;
            while (true) {
              const found = data.indexOf(prefix, searchPos);
              if (found === -1) break;
              const keyStart = found + prefix.length;
              if (keyStart + 32 <= data.length) {
                const candidate = data.subarray(keyStart, keyStart + 32);
                if (candidate.length === 32 && !candidate.equals(Buffer.alloc(32))) {
                  keyCandidates.push(Buffer.from(candidate));
                }
              }
              searchPos = found + 1;
            }
          }
        }
      }

      const next = Number(mbi.BaseAddress) + Number(mbi.RegionSize);
      if (next <= addr) break;
      addr = next;
    }
  } finally {
    CloseHandle(hProcess);
  }

  if (keyCandidates.length === 0) return null;
  return keyCandidates[0].toString('hex');
}


// =============================================================================
// F. macOS Key Extraction
// =============================================================================

/**
 * Extract WeChat key from macOS process memory using lldb + Keychain fallback.
 * @param {number} pid
 * @returns {string|null}
 */
function extractKeyMacos(pid) {
  const key = _extractKeyMacosLldb(pid);
  if (key) return key;
  return extractKeyMacosKeychain();
}

/**
 * Extract key via python3/lldb subprocess on macOS.
 * @param {number} pid
 * @returns {string|null}
 */
function _extractKeyMacosLldb(pid) {
  const lldbScript = `
import lldb
debugger = lldb.SBDebugger.Create()
debugger.SetAsync(False)
target = debugger.CreateTarget("")
error = lldb.SBError()
process = target.AttachToProcessWithID(debugger.GetListener(), ${pid}, error)
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
`;

  try {
    const result = execFileSync(
      'python3',
      ['-c', `exec(${JSON.stringify(lldbScript)})`],
      { encoding: 'utf-8', timeout: 30000 }
    );
    for (const line of result.split('\n')) {
      if (line.startsWith('KEY_FOUND:')) {
        return line.split(':')[1].trim();
      }
    }
  } catch {
    // lldb method failed
  }
  return null;
}

/**
 * Extract key from macOS Keychain via security CLI.
 * @returns {string|null}
 */
function extractKeyMacosKeychain() {
  try {
    const result = execFileSync(
      'security',
      ['find-generic-password', '-s', 'com.tencent.xinWeChat', '-w'],
      { encoding: 'utf-8', timeout: 5000 }
    );
    const key = result.trim();
    return key || null;
  } catch {
    return null;
  }
}


// =============================================================================
// G. Main Orchestration
// =============================================================================

/**
 * Main entry point for WeChat database decryption.
 *
 * @param {object} options
 * @param {string} [options.dbDir] - WeChat message database directory
 * @param {string} [options.key] - Known key hex string (skips memory extraction)
 * @param {string} [options.output='./decrypted'] - Output directory
 * @param {boolean} [options.findKeyOnly=false] - Only extract key, no decryption
 * @param {boolean} [options.jsonProgress=false] - Emit JSON progress
 * @param {function} [options.emitFn] - Progress callback (step, progress, message, extra)
 * @returns {{ success: boolean, outputDir?: string, decryptedCount?: number, keyMap?: object, key?: string, error?: string }}
 */
function decrypt(options = {}) {
  const {
    dbDir: userDbDir,
    key: userKey,
    output = './decrypted',
    findKeyOnly = false,
    emitFn: userEmitFn,
  } = options;

  const emitFn = userEmitFn || ((step, progress, message) => {
    // eslint-disable-next-line no-console
    console.log(`[${step}] ${progress}% - ${message}`);
  });

  if (!IS_WINDOWS && !IS_MACOS) {
    emitFn('error', 0, 'Only Windows and macOS are supported');
    return { success: false, error: 'Only Windows and macOS are supported' };
  }

  const platformName = IS_WINDOWS ? 'Windows' : 'macOS';
  emitFn('init', 0, `Platform: ${platformName}`);

  // == WeChat 4.x Windows: Weixin.exe detected ==
  if (IS_WINDOWS && !userKey) {
    const v4Pids = getWeixinPids();

    if (v4Pids.length > 0) {
      emitFn('key', 5, `WeChat 4.x detected (Weixin.exe, ${v4Pids.length} process(es))`);

      // Determine DB directory(s)
      let dbDirs = [];
      if (userDbDir) {
        dbDirs = [userDbDir];
      } else {
        const v4Dirs = detectAllV4DbDirsWindows();
        if (v4Dirs.length > 0) {
          dbDirs = v4Dirs;
          const accountNames = v4Dirs.map(d => path.basename(path.dirname(d)));
          emitFn('key', 8, `Found ${v4Dirs.length} account(s): ${accountNames.join(', ')}`);
        } else {
          // Fall back to 3.x-style detection
          const dataDir = getWechatDataDir();
          if (dataDir) {
            const wxidDirs = findWxidDirs(dataDir);
            dbDirs = wxidDirs.length > 0 ? wxidDirs : [dataDir];
          }
        }
      }

      if (dbDirs.length === 0) {
        const msg = 'WeChat data directory not found. Specify dbDir option.';
        emitFn('error', 0, msg);
        return { success: false, error: msg };
      }

      // Collect all DB files from all account directories
      emitFn('key', 10, 'Collecting database files...');
      let allDbFiles = [];
      let allSaltToDbs = {};

      for (const dd of dbDirs) {
        let { dbFiles: df, saltToDbs: std } = collectDbFilesV4(dd);

        // Prefix relative paths with account name to avoid collisions
        if (dbDirs.length > 1) {
          const acctName = path.basename(path.dirname(dd));
          df = df.map(entry => ({
            ...entry,
            rel: path.join(acctName, entry.rel),
          }));
          const newStd = {};
          for (const [k, v] of Object.entries(std)) {
            newStd[k] = v.map(r => path.join(acctName, r));
          }
          std = newStd;
        }

        allDbFiles = allDbFiles.concat(df);
        for (const [k, v] of Object.entries(std)) {
          if (!allSaltToDbs[k]) allSaltToDbs[k] = [];
          allSaltToDbs[k] = allSaltToDbs[k].concat(v);
        }
      }

      if (allDbFiles.length === 0) {
        const msg = 'No database files found. Specify the correct dbDir.';
        emitFn('error', 0, msg);
        return { success: false, error: msg };
      }

      emitFn(
        'key', 15,
        `Found ${allDbFiles.length} DB file(s), ${Object.keys(allSaltToDbs).length} unique salt(s)`
      );

      // Extract keys from memory
      emitFn('key', 18, 'Scanning Weixin.exe memory for enc_keys...');
      const keyMap = extractAllKeysV4(allDbFiles, allSaltToDbs, emitFn);

      if (findKeyOnly) {
        emitFn(
          'done', 100,
          `Found ${Object.keys(keyMap).length}/${Object.keys(allSaltToDbs).length} keys`
        );
        return { success: true, keyMap };
      }

      if (Object.keys(keyMap).length === 0) {
        const msg = 'Failed to extract any keys. Make sure WeChat is logged in and running.';
        emitFn('error', 0, msg);
        return { success: false, error: msg };
      }

      emitFn(
        'key', 40,
        `Extracted ${Object.keys(keyMap).length}/${Object.keys(allSaltToDbs).length} key(s)`
      );

      // Decrypt each DB with its matching enc_key
      const outputDir = path.resolve(output);
      fs.mkdirSync(outputDir, { recursive: true });

      let successCount = 0;
      for (let i = 0; i < allDbFiles.length; i++) {
        const { rel, absPath, saltHex } = allDbFiles[i];
        const encKeyHex = keyMap[saltHex];
        const pct = 40 + Math.floor((i / allDbFiles.length) * 55);

        if (!encKeyHex) {
          emitFn('warn', pct, `No key for ${rel}, skipping`);
          continue;
        }

        const outPath = path.join(outputDir, rel);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        emitFn('decrypt', pct, `Decrypting ${rel}...`);

        if (decryptDbV4(absPath, encKeyHex, outPath)) {
          successCount++;
        } else {
          emitFn('warn', pct, `Failed to decrypt ${rel}`);
        }
      }

      emitFn('done', 100, `Decrypted ${successCount}/${allDbFiles.length} files`);
      return {
        success: true,
        outputDir,
        decryptedCount: successCount,
        keyMap,
      };
    }
  }

  // == WeChat 3.x / macOS: single-key flow ==
  let keyHex = userKey || null;

  if (!keyHex) {
    emitFn('key', 5, 'Locating WeChat process...');
    const pid = findWechatPid();
    if (!pid) {
      const msg = 'WeChat process not found. Please open WeChat and log in.';
      emitFn('error', 0, msg);
      return { success: false, error: msg };
    }
    emitFn('key', 15, `Found WeChat process PID: ${pid}`);
    emitFn('key', 20, 'Extracting key from process memory...');

    if (IS_WINDOWS) {
      keyHex = extractKeyWindows(pid);
    } else {
      keyHex = extractKeyMacos(pid);
    }

    if (!keyHex) {
      const msg = 'Failed to extract key. Make sure WeChat is running and logged in.';
      emitFn('error', 0, msg);
      return { success: false, error: msg };
    }
    emitFn('key', 40, 'Key extracted successfully');
  }

  if (findKeyOnly) {
    emitFn('done', 100, 'Key extracted');
    return { success: true, key: keyHex };
  }

  // Find DB files
  let dbFilesList = [];
  if (userDbDir) {
    dbFilesList = findDbFiles(userDbDir);
    if (dbFilesList.length === 0) {
      const msg = `No database files found in ${userDbDir}`;
      emitFn('error', 0, msg);
      return { success: false, error: msg };
    }
    emitFn('decrypt', 45, `Found ${dbFilesList.length} database file(s)`);
  } else {
    const dataDir = getWechatDataDir();
    if (!dataDir) {
      const msg = 'WeChat data directory not found. Specify dbDir option.';
      emitFn('error', 0, msg);
      return { success: false, error: msg };
    }
    emitFn('decrypt', 42, `WeChat data dir: ${dataDir}`);

    const wxidDirs = findWxidDirs(dataDir);
    if (wxidDirs.length === 0) {
      const msg = 'No account directories found. Specify dbDir option.';
      emitFn('error', 0, msg);
      return { success: false, error: msg };
    }
    const wxidDir = wxidDirs[0];
    const msgDir = findMsgDir(wxidDir);
    dbFilesList = findDbFiles(msgDir);
    emitFn(
      'decrypt', 45,
      `Found ${dbFilesList.length} database file(s) in account ${path.basename(wxidDir)}`
    );
  }

  // Decrypt
  const outputDir = path.resolve(output);
  fs.mkdirSync(outputDir, { recursive: true });

  let successCount = 0;
  for (let i = 0; i < dbFilesList.length; i++) {
    const dbPath = dbFilesList[i];
    const dbName = path.basename(dbPath);
    const outPath = path.join(outputDir, dbName);
    const pct = 45 + Math.floor((i / dbFilesList.length) * 50);
    emitFn('decrypt', pct, `Decrypting ${dbName}...`);

    if (decryptDb(dbPath, keyHex, outPath)) {
      successCount++;
    } else {
      emitFn('warn', pct, `Failed to decrypt ${dbName} (key mismatch?)`);
    }
  }

  emitFn('done', 100, `Decrypted ${successCount}/${dbFilesList.length} files`);
  return {
    success: true,
    outputDir,
    decryptedCount: successCount,
    key: keyHex,
  };
}


// =============================================================================
// Internal helpers
// =============================================================================

/**
 * Check if a path is a directory.
 * @param {string} p
 * @returns {boolean}
 */
function _isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check if a path is a file.
 * @param {string} p
 * @returns {boolean}
 */
function _isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * Recursively walk a directory, calling callback for each file.
 * Files within each directory are yielded in sorted order.
 * @param {string} dir
 * @param {function(string): void} callback
 */
function _walkDir(dir, callback) {
  let entries;
  try {
    entries = fs.readdirSync(dir).sort();
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    let stat;
    try {
      stat = fs.statSync(fullPath);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      _walkDir(fullPath, callback);
    } else if (stat.isFile()) {
      callback(fullPath);
    }
  }
}

/**
 * Simple recursive file glob by regex on basename.
 * @param {string} dir
 * @param {RegExp} pattern
 * @returns {string[]}
 */
function _globRecursive(dir, pattern) {
  const results = [];
  _walkDir(dir, (filePath) => {
    if (pattern.test(path.basename(filePath))) {
      results.push(filePath);
    }
  });
  return results;
}

/**
 * Verify that a file is a valid SQLite database by opening it with better-sqlite3.
 * Falls back to checking the SQLite header magic bytes if better-sqlite3 is unavailable.
 * @param {string} dbPath
 * @returns {boolean}
 */
function _verifySqlite(dbPath) {
  try {
    const Database = require('better-sqlite3');
    const db = new Database(dbPath, { readonly: true });
    db.prepare('SELECT name FROM sqlite_master LIMIT 1').get();
    db.close();
    return true;
  } catch (err) {
    // If better-sqlite3 is not installed, fall back to header check
    if (err.code === 'MODULE_NOT_FOUND') {
      try {
        const fd = fs.openSync(dbPath, 'r');
        const hdr = Buffer.alloc(16);
        fs.readSync(fd, hdr, 0, 16, 0);
        fs.closeSync(fd);
        return hdr.subarray(0, 16).equals(SQLITE_HDR);
      } catch {
        return false;
      }
    }
    // Database error: file is not valid SQLite
    try {
      fs.unlinkSync(dbPath);
    } catch {
      // ignore cleanup failure
    }
    return false;
  }
}


// =============================================================================
// Exports
// =============================================================================

module.exports = {
  // Main entry point
  decrypt,

  // Process discovery
  findWechatPid,
  getWeixinPids,

  // Directory detection
  detectAllV4DbDirsWindows,
  getWechatDataDir,
  findDbFiles,
  findWxidDirs,
  findMsgDir,

  // DB file collection
  collectDbFilesV4,

  // Crypto
  verifyEncKeyV4,
  decryptDbV4,
  decryptDb,
  testKey,

  // Memory scanning (Windows)
  extractAllKeysV4,
  extractKeyWindows,

  // macOS key extraction
  extractKeyMacos,
  extractKeyMacosKeychain,
};
