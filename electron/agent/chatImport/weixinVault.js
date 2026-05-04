const nodeFs = require('node:fs');
const nodePath = require('node:path');
const nodeOs = require('node:os');
const nodeCrypto = require('node:crypto');
const { execFileSync: spawnSync } = require('node:child_process');
const { EventEmitter } = require('node:events');

class VaultLocateError    extends Error { constructor(m){ super(m); this.name='VaultLocateError'; } }
class KeyHarvestError     extends Error { constructor(m){ super(m); this.name='KeyHarvestError'; } }
class CipherUnsealError   extends Error { constructor(m){ super(m); this.name='CipherUnsealError'; } }
class UnsupportedHostError extends Error { constructor(m){ super(m); this.name='UnsupportedHostError'; } }

const SQLCIPHER = Object.freeze({
  pageBytes:        4096,
  saltBytes:        16,
  keyBytes:         32,
  v4: Object.freeze({
    reserveBytes:   80,
    ivBytes:        16,
    hmacBytes:      64,
    macSaltXor:     0x3A,
    macPbkdfRounds: 2,
    bodyOffsetP1:   16,
    bodyOffsetPN:   0,
    bodyEndAbs:     4016,
    ivOffsetAbs:    4016,
    hmacOffsetAbs:  4032,
  }),
  v3: Object.freeze({
    pbkdfRounds:    4000,
    p1IvSpan:       [16, 32],
    p1BodySpan:     [32, 4064],
    p1TailZeros:    32,
    pnBodySpan:     [0, 4048],
    pnIvSpan:       [4048, 4064],
    pnTailZeros:    48,
  }),
});

const SQLITE_MAGIC = Buffer.from('SQLite format 3\x00');

const fsTry = {
  stat(p)        { try { return nodeFs.statSync(p); }            catch { return null; } },
  isDirectory(p) { const s = fsTry.stat(p); return !!s && s.isDirectory(); },
  isFile(p)      { const s = fsTry.stat(p); return !!s && s.isFile(); },
  read(p, opts)  { try { return nodeFs.readFileSync(p, opts); }  catch { return null; } },
  list(p)        { try { return nodeFs.readdirSync(p); }         catch { return null; } },
};

function descendTree(root, onFile, _relRoot) {
  const startRel = _relRoot ?? '';
  const items = fsTry.list(root);
  if (!items) return;
  items.sort();
  for (const item of items) {
    const abs = nodePath.join(root, item);
    const rel = startRel ? `${startRel}${nodePath.sep}${item}` : item;
    const st  = fsTry.stat(abs);
    if (!st) continue;
    if (st.isDirectory()) descendTree(abs, onFile, rel);
    else if (st.isFile()) onFile(abs, rel);
  }
}

const PageLayout = {
  v4Header(page) {
    const v4 = SQLCIPHER.v4;
    return {
      salt:        page.subarray(0, SQLCIPHER.saltBytes),
      cipherBody:  page.subarray(v4.bodyOffsetP1, v4.bodyEndAbs),
      iv:          page.subarray(v4.ivOffsetAbs, v4.ivOffsetAbs + v4.ivBytes),
      hmacTag:     page.subarray(v4.hmacOffsetAbs, SQLCIPHER.pageBytes),
      macSubject:  page.subarray(SQLCIPHER.saltBytes, v4.hmacOffsetAbs),
    };
  },
  v4Body(page) {
    const v4 = SQLCIPHER.v4;
    return {
      cipherBody: page.subarray(v4.bodyOffsetPN, v4.bodyEndAbs),
      iv:         page.subarray(v4.ivOffsetAbs, v4.ivOffsetAbs + v4.ivBytes),
      hmacTag:    page.subarray(v4.hmacOffsetAbs, SQLCIPHER.pageBytes),
      macSubject: page.subarray(0, v4.hmacOffsetAbs),
    };
  },
  v3Header(page) {
    const v3 = SQLCIPHER.v3;
    return {
      salt:       page.subarray(0, SQLCIPHER.saltBytes),
      iv:         page.subarray(v3.p1IvSpan[0], v3.p1IvSpan[1]),
      cipherBody: page.subarray(v3.p1BodySpan[0], v3.p1BodySpan[1]),
    };
  },
  v3Body(page) {
    const v3 = SQLCIPHER.v3;
    return {
      cipherBody: page.subarray(v3.pnBodySpan[0], v3.pnBodySpan[1]),
      iv:         page.subarray(v3.pnIvSpan[0], v3.pnIvSpan[1]),
    };
  },
};

function deriveV4MacKey(cipherKey, salt) {
  const v4 = SQLCIPHER.v4;
  const macSalt = Buffer.allocUnsafe(SQLCIPHER.saltBytes);
  for (let i = 0; i < SQLCIPHER.saltBytes; i++) macSalt[i] = salt[i] ^ v4.macSaltXor;
  return nodeCrypto.pbkdf2Sync(cipherKey, macSalt, v4.macPbkdfRounds, SQLCIPHER.keyBytes, 'sha512');
}

function computeV4PageTag(macKey, macSubject, pageNumber1Indexed) {
  const counter = Buffer.allocUnsafe(4);
  counter.writeUInt32LE(pageNumber1Indexed, 0);
  return nodeCrypto.createHmac('sha512', macKey)
    .update(macSubject)
    .update(counter)
    .digest();
}

function deriveV3CipherKey(seedBytes, salt) {
  return nodeCrypto.pbkdf2Sync(seedBytes, salt, SQLCIPHER.v3.pbkdfRounds, SQLCIPHER.keyBytes, 'sha1');
}

function aesCbcDecrypt(key, iv, ciphertext) {
  const cipher = nodeCrypto.createDecipheriv('aes-256-cbc', key, iv);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(ciphertext), cipher.final()]);
}

function proveV4Key(candidateKey, headerPage) {
  const layout = PageLayout.v4Header(headerPage);
  const macKey = deriveV4MacKey(candidateKey, layout.salt);
  const want   = computeV4PageTag(macKey, layout.macSubject, 1).subarray(0, SQLCIPHER.v4.hmacBytes);
  return nodeCrypto.timingSafeEqual(want, layout.hmacTag);
}

function readHeaderPage(path) {
  const fd = nodeFs.openSync(path, 'r');
  try {
    const buf = Buffer.allocUnsafe(SQLCIPHER.pageBytes);
    const got = nodeFs.readSync(fd, buf, 0, SQLCIPHER.pageBytes, 0);
    if (got < SQLCIPHER.pageBytes) return null;
    return buf;
  } finally {
    nodeFs.closeSync(fd);
  }
}

function ensureDirectoryFor(filePath) {
  const dir = nodePath.dirname(filePath);
  if (dir && dir !== '.') nodeFs.mkdirSync(dir, { recursive: true });
}

function unsealVaultV4(absoluteSource, cipherKeyHex, absoluteTarget) {
  let cipherKey;
  try { cipherKey = Buffer.from(cipherKeyHex, 'hex'); } catch { return false; }
  if (cipherKey.length !== SQLCIPHER.keyBytes) return false;

  const blob = fsTry.read(absoluteSource);
  if (!blob || blob.length < SQLCIPHER.pageBytes) return false;

  const totalPages = Math.floor(blob.length / SQLCIPHER.pageBytes);
  ensureDirectoryFor(absoluteTarget);

  const tailPad   = Buffer.alloc(SQLCIPHER.v4.reserveBytes);
  const segments = [];

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const pageStart = pageIdx * SQLCIPHER.pageBytes;
    const pageBuf   = blob.subarray(pageStart, pageStart + SQLCIPHER.pageBytes);
    if (pageBuf.length < SQLCIPHER.pageBytes) break;

    if (pageIdx === 0) {
      const view  = PageLayout.v4Header(pageBuf);
      const plain = aesCbcDecrypt(cipherKey, view.iv, view.cipherBody);
      segments.push(SQLITE_MAGIC, plain, tailPad);
    } else {
      const view  = PageLayout.v4Body(pageBuf);
      const plain = aesCbcDecrypt(cipherKey, view.iv, view.cipherBody);
      segments.push(plain, tailPad);
    }
  }

  try { nodeFs.writeFileSync(absoluteTarget, Buffer.concat(segments)); }
  catch { return false; }

  return verifySqliteOutput(absoluteTarget);
}

function unsealVaultV3(absoluteSource, seedHex, absoluteTarget) {
  let seedBytes;
  try { seedBytes = Buffer.from(seedHex, 'hex'); } catch { return false; }

  const blob = fsTry.read(absoluteSource);
  if (!blob || blob.length < SQLCIPHER.pageBytes) return false;

  const salt        = blob.subarray(0, SQLCIPHER.saltBytes);
  const cipherKey   = deriveV3CipherKey(seedBytes, salt);
  const totalPages  = Math.floor(blob.length / SQLCIPHER.pageBytes);
  const segments    = [];

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const pageStart = pageIdx * SQLCIPHER.pageBytes;
    const pageBuf   = blob.subarray(pageStart, pageStart + SQLCIPHER.pageBytes);

    if (pageIdx === 0) {
      const view  = PageLayout.v3Header(pageBuf);
      const plain = aesCbcDecrypt(cipherKey, view.iv, view.cipherBody);
      segments.push(SQLITE_MAGIC);
      segments.push(plain.subarray(SQLITE_MAGIC.length));
      segments.push(Buffer.alloc(SQLCIPHER.v3.p1TailZeros));
    } else {
      const view  = PageLayout.v3Body(pageBuf);
      const plain = aesCbcDecrypt(cipherKey, view.iv, view.cipherBody);
      segments.push(plain);
      segments.push(Buffer.alloc(SQLCIPHER.v3.pnTailZeros));
    }
  }

  ensureDirectoryFor(absoluteTarget);
  try { nodeFs.writeFileSync(absoluteTarget, Buffer.concat(segments)); }
  catch { return false; }

  return verifySqliteOutput(absoluteTarget);
}

function probeV3Key(absoluteSource, seedHex) {
  try {
    const fd = nodeFs.openSync(absoluteSource, 'r');
    try {
      const head = Buffer.allocUnsafe(SQLCIPHER.pageBytes);
      const got  = nodeFs.readSync(fd, head, 0, SQLCIPHER.pageBytes, 0);
      if (got < SQLCIPHER.pageBytes) return false;
      const seedBytes = Buffer.from(seedHex, 'hex');
      const view      = PageLayout.v3Header(head);
      const cipherKey = deriveV3CipherKey(seedBytes, view.salt);
      const plain     = aesCbcDecrypt(cipherKey, view.iv, head.subarray(32, 48));
      return !plain.equals(Buffer.alloc(16));
    } finally {
      nodeFs.closeSync(fd);
    }
  } catch {
    return false;
  }
}

function verifySqliteOutput(absolutePath) {
  let SqliteCtor;
  try { SqliteCtor = require('better-sqlite3'); }
  catch (loadErr) {
    if (loadErr && loadErr.code === 'MODULE_NOT_FOUND') {
      const head = fsTry.read(absolutePath);
      return !!head && head.length >= 16
        && head.subarray(0, 16).equals(SQLITE_MAGIC);
    }
    return false;
  }

  try {
    const handle = new SqliteCtor(absolutePath, { readonly: true });
    handle.prepare('SELECT name FROM sqlite_master LIMIT 1').get();
    handle.close();
    return true;
  } catch {
    try { nodeFs.unlinkSync(absolutePath); } catch {}
    return false;
  }
}

const HOST = (() => {
  const p = process.platform;
  return {
    isWin32:  p === 'win32',
    isDarwin: p === 'darwin',
  };
})();

const ProcessRoster = {
  weixinClients() {
    if (!HOST.isWin32) return [];
    const raw = (() => {
      try {
        return spawnSync(
          'tasklist',
          ['/FI', 'IMAGENAME eq Weixin.exe', '/FO', 'CSV', '/NH'],
          { encoding: 'utf-8', windowsHide: true },
        );
      } catch { return ''; }
    })();
    const found = [];
    for (const row of raw.split(/\r?\n/)) {
      const cleaned = row.trim();
      if (!cleaned) continue;
      const cells = cleaned.replace(/^"|"$/g, '').split('","');
      if (cells.length < 5) continue;
      const pid = Number.parseInt(cells[1], 10);
      if (!Number.isFinite(pid)) continue;
      const memDigits = (cells[4] || '').replace(/[,\sK]/gi, '');
      const memKb = Number.parseInt(memDigits, 10) || 0;
      found.push({ pid, memKb });
    }
    return found.sort((l, r) => r.memKb - l.memKb);
  },

  legacyClientPid() {
    if (HOST.isWin32) {
      const exact = new Set(['wechat.exe', 'wechatapp.exe', 'wechatappex.exe', 'weixin.exe']);
      let raw;
      try {
        raw = spawnSync('tasklist', ['/FO', 'CSV', '/NH'],
          { encoding: 'utf-8', windowsHide: true });
      } catch { return null; }
      let approximate = null;
      for (const row of raw.split(/\r?\n/)) {
        const cleaned = row.trim();
        if (!cleaned) continue;
        const cells = cleaned.replace(/^"|"$/g, '').split('","');
        if (cells.length < 2) continue;
        const name = (cells[0] || '').toLowerCase();
        const pid  = Number.parseInt(cells[1], 10);
        if (!Number.isFinite(pid)) continue;
        if (exact.has(name)) return pid;
        if (approximate === null && name.endsWith('.exe') && name.includes('wechat'))
          approximate = pid;
      }
      return approximate;
    }
    if (HOST.isDarwin) {
      let raw;
      try { raw = spawnSync('ps', ['-eo', 'pid,comm'], { encoding: 'utf-8' }); }
      catch { return null; }
      for (const row of raw.split('\n')) {
        const trimmed = row.trim();
        const sep = trimmed.indexOf(' ');
        if (sep < 0) continue;
        const pid  = Number.parseInt(trimmed.slice(0, sep), 10);
        const exe  = nodePath.basename(trimmed.slice(sep + 1).trim()).toLowerCase();
        if (exe === 'wechat' || exe === '微信') return pid;
      }
    }
    return null;
  },
};

const InstallationFinder = {
  v4DbRootsWindows() {
    const cfgDir = nodePath.join(process.env.APPDATA || '', 'Tencent', 'xwechat', 'config');
    if (!fsTry.isDirectory(cfgDir)) return [];

    const iniNames = (fsTry.list(cfgDir) || []).filter(n => n.endsWith('.ini'));
    const roots    = new Set();

    for (const ini of iniNames) {
      const iniPath = nodePath.join(cfgDir, ini);
      let body = null;
      for (const enc of ['utf-8', 'latin1']) {
        try {
          body = nodeFs.readFileSync(iniPath, { encoding: enc }).slice(0, 1024).trim();
          break;
        } catch {}
      }
      if (!body || /[\n\r\x00]/.test(body)) continue;
      if (fsTry.isDirectory(body)) roots.add(body);
    }

    const seen = new Set();
    const dbDirs = [];
    for (const root of roots) {
      const xfiles = nodePath.join(root, 'xwechat_files');
      if (!fsTry.isDirectory(xfiles)) continue;
      for (const account of fsTry.list(xfiles) || []) {
        const candidate = nodePath.join(xfiles, account, 'db_storage');
        if (!fsTry.isDirectory(candidate)) continue;
        const dedupKey = nodePath.normalize(candidate).toLowerCase();
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);
        dbDirs.push(candidate);
      }
    }
    return dbDirs;
  },

  legacyDataRoot() {
    if (HOST.isWin32) {
      const v4 = InstallationFinder.v4DbRootsWindows();
      if (v4.length) return v4[0];
      const docs = nodePath.join(nodeOs.homedir(), 'Documents', 'WeChat Files');
      if (fsTry.isDirectory(docs)) return docs;
      try {
        const fallback = nodePath.join('C:\\Users', nodeOs.userInfo().username,
          'Documents', 'WeChat Files');
        if (fsTry.isDirectory(fallback)) return fallback;
      } catch {}
      return null;
    }
    if (HOST.isDarwin) {
      const containers = nodePath.join(nodeOs.homedir(),
        'Library', 'Containers', 'com.tencent.xinWeChat', 'Data');
      if (fsTry.isDirectory(containers)) return containers;
      const support = nodePath.join(nodeOs.homedir(),
        'Library', 'Application Support', 'com.tencent.xinWeChat');
      if (fsTry.isDirectory(support)) return support;
    }
    return null;
  },

  legacyAccountDirs(dataRoot) {
    if (HOST.isWin32) {
      const top = fsTry.list(dataRoot) || [];
      let accounts = top
        .filter(e => e.startsWith('wxid_'))
        .map(e => nodePath.join(dataRoot, e))
        .filter(p => fsTry.isDirectory(p));
      if (!accounts.length) {
        accounts = top
          .map(e => nodePath.join(dataRoot, e))
          .filter(p => fsTry.isDirectory(p) && fsTry.isDirectory(nodePath.join(p, 'Msg')));
      }
      return accounts;
    }
    if (HOST.isDarwin) {
      const out = [];
      for (const versionDir of fsTry.list(dataRoot) || []) {
        const versionPath = nodePath.join(dataRoot, versionDir);
        if (!fsTry.isDirectory(versionPath)) continue;
        for (const account of fsTry.list(versionPath) || []) {
          const accountPath = nodePath.join(versionPath, account);
          if (!fsTry.isDirectory(accountPath)) continue;
          if (fsTry.isDirectory(nodePath.join(accountPath, 'Message')) ||
              fsTry.isDirectory(nodePath.join(accountPath, 'Msg'))) {
            out.push(accountPath);
          }
        }
      }
      return out;
    }
    return [];
  },

  legacyMessageDir(accountDir) {
    for (const sub of ['Message', 'Msg', 'msg']) {
      const candidate = nodePath.join(accountDir, sub);
      if (fsTry.isDirectory(candidate)) return candidate;
    }
    return accountDir;
  },

  legacyArchives(messageDir) {
    const out = [];
    const push = p => { if (fsTry.isFile(p)) out.push(p); };

    for (let i = 0; i < 20; i++) push(nodePath.join(messageDir, `MSG${i}.db`));

    const multi = nodePath.join(messageDir, 'Multi');
    if (fsTry.isDirectory(multi)) {
      for (let i = 0; i < 20; i++) push(nodePath.join(multi, `MSG${i}.db`));
    }
    const macStyle = nodePath.join(messageDir, 'Message');
    if (fsTry.isDirectory(macStyle)) {
      const items = (fsTry.list(macStyle) || []).filter(f => /^msg_.*\.db$/.test(f)).sort();
      for (const f of items) out.push(nodePath.join(macStyle, f));
    }
    const micro = nodePath.join(messageDir, 'MicroMsg.db');
    if (fsTry.isFile(micro)) out.unshift(micro);

    if (!out.length) {
      const re1 = /^MSG.*\.db$/i, re2 = /^msg_.*\.db$/i, re3 = /^MicroMsg\.db$/i;
      const big = [], small = []; let micro2 = null;
      descendTree(messageDir, abs => {
        const base = nodePath.basename(abs);
        if (re3.test(base)) micro2 = abs;
        else if (re1.test(base)) big.push(abs);
        else if (re2.test(base)) small.push(abs);
      });
      out.push(...big.sort(), ...small.sort());
      if (micro2) out.unshift(micro2);
    }
    return out;
  },
};

function enumerateV4Archives(dbStorageDir) {
  const vaults = [];
  const bySalt = Object.create(null);

  descendTree(dbStorageDir, abs => {
    const base = nodePath.basename(abs);
    if (!base.endsWith('.db') || base.endsWith('-wal') || base.endsWith('-shm')) return;
    const stat = fsTry.stat(abs);
    if (!stat || stat.size < SQLCIPHER.pageBytes) return;
    let head;
    try { head = readHeaderPage(abs); } catch { return; }
    if (!head) return;

    const saltSig = head.subarray(0, SQLCIPHER.saltBytes).toString('hex');
    const rel     = nodePath.relative(dbStorageDir, abs);
    vaults.push({
      relativeName:  rel,
      absolutePath:  abs,
      byteLength:    stat.size,
      headerPage:    head,
      saltSignature: saltSig,
    });
    (bySalt[saltSig] ||= []).push(rel);
  });

  return { vaults, bySalt };
}

const Win32MemoryProbe = (() => {
  let cached = null;

  function bind() {
    if (cached) return cached;
    let koffi;
    try { koffi = require('koffi'); }
    catch (err) { throw new KeyHarvestError(`koffi unavailable: ${err.message}`); }

    const k32 = koffi.load('kernel32.dll');
    const MBI = koffi.struct('WV_MBI', {
      BaseAddress:       'uint64',
      AllocationBase:    'uint64',
      AllocationProtect: 'uint32',
      __pad1:            'uint32',
      RegionSize:        'uint64',
      State:             'uint32',
      Protect:           'uint32',
      Type:              'uint32',
      __pad2:            'uint32',
    });

    cached = {
      koffi,
      MBI,
      OpenProcess: k32.func(
        'void* __stdcall OpenProcess(uint32_t, bool, uint32_t)'),
      CloseHandle: k32.func(
        'bool __stdcall CloseHandle(void*)'),
      QueryRegion: k32.func(
        'size_t __stdcall VirtualQueryEx(void*, uint64_t, _Out_ WV_MBI*, size_t)'),
      ReadMemory: k32.func(
        'bool __stdcall ReadProcessMemory(void*, uint64_t, _Out_ uint8_t*, size_t, _Out_ size_t*)'),
    };
    return cached;
  }

  const ACCESS = Object.freeze({
    PROCESS_VM_READ:           0x0010,
    PROCESS_QUERY_INFORMATION: 0x0400,
    MEM_COMMIT:                0x1000,
    READABLE_PROTECT:          new Set([0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80]),
  });

  const REGION_HARD_LIMIT = 500 * 1024 * 1024;

  function* iterateReadableRegions(hProcess) {
    const { koffi, MBI, QueryRegion } = bind();
    const mbi  = {};
    const size = koffi.sizeof(MBI);
    let cursor = 0;
    const ceiling = 0x7FFFFFFFFFFF;
    while (cursor < ceiling) {
      const ret = QueryRegion(hProcess, cursor, mbi, size);
      if (ret === 0) break;
      const regionSize = Number(mbi.RegionSize);
      const baseAddr   = mbi.BaseAddress;
      const passable =
        mbi.State === ACCESS.MEM_COMMIT &&
        ACCESS.READABLE_PROTECT.has(mbi.Protect) &&
        regionSize > 0 &&
        regionSize < REGION_HARD_LIMIT;
      if (passable) yield { base: baseAddr, size: regionSize };
      const next = Number(baseAddr) + regionSize;
      if (next <= cursor) break;
      cursor = next;
    }
  }

  function open(pid) {
    const { OpenProcess } = bind();
    const handle = OpenProcess(
      ACCESS.PROCESS_VM_READ | ACCESS.PROCESS_QUERY_INFORMATION, false, pid);
    return handle || null;
  }

  function close(handle) {
    if (!handle) return;
    try { bind().CloseHandle(handle); } catch {}
  }

  function snapshot(handle, base, size) {
    const { ReadMemory } = bind();
    const buf  = Buffer.allocUnsafe(size);
    const wrote = [0];
    const ok   = ReadMemory(handle, base, buf, size, wrote);
    if (!ok || wrote[0] === 0) return null;
    return buf.subarray(0, wrote[0]);
  }

  return { open, close, snapshot, iterateReadableRegions, ACCESS };
})();

const SEAL_LITERAL_RE = /x'([0-9a-fA-F]{64,192})'/g;

function harvestSealedKeysWin32(vaults, bySalt, broadcast) {
  if (!HOST.isWin32) return Object.create(null);

  const clients = ProcessRoster.weixinClients();
  if (!clients.length) return Object.create(null);

  const keyBySalt    = Object.create(null);
  const stillSeeking = new Set(Object.keys(bySalt));

  const tryCandidate = (cipherHex, saltHex) => {
    if (!stillSeeking.has(saltHex)) return false;
    let cipher;
    try { cipher = Buffer.from(cipherHex, 'hex'); } catch { return false; }
    if (cipher.length !== SQLCIPHER.keyBytes) return false;
    for (const v of vaults) {
      if (v.saltSignature !== saltHex) continue;
      if (proveV4Key(cipher, v.headerPage)) {
        keyBySalt[saltHex] = cipherHex;
        stillSeeking.delete(saltHex);
        broadcast('key', 35, `Recovered key for: ${bySalt[saltHex].join(', ')}`);
        return true;
      }
    }
    return false;
  };

  for (let pi = 0; pi < clients.length; pi++) {
    if (!stillSeeking.size) break;
    const { pid, memKb } = clients[pi];
    const handle = Win32MemoryProbe.open(pid);
    if (!handle) {
      broadcast('key', 25, `Cannot attach to PID ${pid}, skipping`);
      continue;
    }

    try {
      const regions = [...Win32MemoryProbe.iterateReadableRegions(handle)];
      broadcast('key', 20 + pi,
        `Probing PID=${pid} (${Math.floor(memKb/1024)}MB, ${regions.length} regions)`);

      for (let ri = 0; ri < regions.length; ri++) {
        if (!stillSeeking.size) break;
        const { base, size } = regions[ri];
        const blob = Win32MemoryProbe.snapshot(handle, base, size);
        if (!blob) continue;

        const text = blob.toString('latin1');
        SEAL_LITERAL_RE.lastIndex = 0;
        let m;
        while ((m = SEAL_LITERAL_RE.exec(text)) !== null) {
          const hex = m[1], hl = hex.length;
          if (hl === 96) {
            tryCandidate(hex.slice(0, 64), hex.slice(64));
          } else if (hl === 64) {
            for (const saltHex of stillSeeking) tryCandidate(hex, saltHex);
          } else if (hl > 96 && hl % 2 === 0) {
            tryCandidate(hex.slice(0, 64), hex.slice(-32));
          }
        }

        if ((ri + 1) % 300 === 0) {
          const pct = 22 + Math.floor(((ri + 1) / regions.length) * 13);
          broadcast('key', pct,
            `${ri+1}/${regions.length} regions; ` +
            `${Object.keys(keyBySalt).length}/${Object.keys(bySalt).length} keys recovered`);
        }
      }
    } finally {
      Win32MemoryProbe.close(handle);
    }
  }

  if (stillSeeking.size && Object.keys(keyBySalt).length) {
    for (const orphanSalt of [...stillSeeking]) {
      const sample = vaults.find(v => v.saltSignature === orphanSalt);
      if (!sample) continue;
      for (const knownHex of Object.values(keyBySalt)) {
        let knownKey;
        try { knownKey = Buffer.from(knownHex, 'hex'); } catch { continue; }
        if (proveV4Key(knownKey, sample.headerPage)) {
          keyBySalt[orphanSalt] = knownHex;
          stillSeeking.delete(orphanSalt);
          break;
        }
      }
    }
  }

  return keyBySalt;
}

const LEGACY_PLATFORM_TAG = Buffer.from('iphone\x00');
const LEGACY_LENGTH_PREFIXES = [
  Buffer.from('0400000020000000', 'hex'),
  Buffer.from('0100000020000000', 'hex'),
];

function harvestLegacyKeyWin32(pid) {
  if (!HOST.isWin32) return null;

  const handle = Win32MemoryProbe.open(pid);
  if (!handle) return null;
  const found = [];

  try {
    for (const { base, size } of Win32MemoryProbe.iterateReadableRegions(handle)) {
      const blob = Win32MemoryProbe.snapshot(handle, base, size);
      if (!blob) continue;

      let cursor = 0;
      while (true) {
        const idx = blob.indexOf(LEGACY_PLATFORM_TAG, cursor);
        if (idx === -1) break;
        const seedAt = idx - 0x70;
        if (seedAt >= 0) {
          const seed = blob.subarray(seedAt, seedAt + SQLCIPHER.keyBytes);
          if (seed.length === SQLCIPHER.keyBytes && !seed.equals(Buffer.alloc(SQLCIPHER.keyBytes)))
            found.push(Buffer.from(seed));
        }
        cursor = idx + 1;
      }
      for (const prefix of LEGACY_LENGTH_PREFIXES) {
        let pos = 0;
        while (true) {
          const found_at = blob.indexOf(prefix, pos);
          if (found_at === -1) break;
          const seedAt = found_at + prefix.length;
          if (seedAt + SQLCIPHER.keyBytes <= blob.length) {
            const seed = blob.subarray(seedAt, seedAt + SQLCIPHER.keyBytes);
            if (seed.length === SQLCIPHER.keyBytes && !seed.equals(Buffer.alloc(SQLCIPHER.keyBytes)))
              found.push(Buffer.from(seed));
          }
          pos = found_at + 1;
        }
      }
    }
  } finally {
    Win32MemoryProbe.close(handle);
  }

  return found.length ? found[0].toString('hex') : null;
}

function harvestLegacyKeyDarwin(pid) {
  const fromLldb = (() => {
    const script = [
      'import lldb',
      'd = lldb.SBDebugger.Create()',
      'd.SetAsync(False)',
      't = d.CreateTarget("")',
      'err = lldb.SBError()',
      `proc = t.AttachToProcessWithID(d.GetListener(), ${pid}, err)`,
      'if err.Fail():',
      '    print("LLDB_ATTACH_FAIL:" + err.GetCString())',
      'else:',
      '    regions = proc.GetMemoryRegions()',
      '    keys = []',
      '    for i in range(regions.GetSize()):',
      '        r = lldb.SBMemoryRegionInfo()',
      '        regions.GetMemoryRegionAtIndex(i, r)',
      '        if not r.IsReadable(): continue',
      '        b = r.GetRegionBase(); s = r.GetRegionEnd() - b',
      '        if s > 0x1000000 or s < 0x1000: continue',
      '        try:',
      '            data = proc.ReadMemory(b, min(s, 0x200000), err)',
      '            if err.Fail() or not data: continue',
      '            for tag in [b"iphone\\x00", b"android\\x00"]:',
      '                k = 0',
      '                while True:',
      '                    p = data.find(tag, k)',
      '                    if p == -1: break',
      '                    o = p - 0x70',
      '                    if o >= 0:',
      '                        c = data[o:o+32]',
      '                        if len(c) == 32 and c != b"\\x00"*32:',
      '                            keys.append(c.hex())',
      '                    k = p + 1',
      '        except: continue',
      '    proc.Detach()',
      '    if keys: print("HARVEST_OK:" + keys[0])',
      '    else:    print("HARVEST_EMPTY")',
    ].join('\n');

    try {
      const stdout = spawnSync('python3', ['-c', script],
        { encoding: 'utf-8', timeout: 30000 });
      for (const line of stdout.split('\n')) {
        if (line.startsWith('HARVEST_OK:')) return line.slice('HARVEST_OK:'.length).trim();
      }
    } catch {}
    return null;
  })();

  if (fromLldb) return fromLldb;
  return harvestKeychainSecret();
}

function harvestKeychainSecret() {
  try {
    const out = spawnSync('security',
      ['find-generic-password', '-s', 'com.tencent.xinWeChat', '-w'],
      { encoding: 'utf-8', timeout: 5000 });
    return out.trim() || null;
  } catch { return null; }
}

class WeixinVault extends EventEmitter {
  constructor(cfg = {}) {
    super();
    this.cfg = {
      archiveDir:    cfg.archiveDir    ?? null,
      cipherKey:     cfg.cipherKey     ?? null,
      outputDir:     cfg.outputDir     ?? './decrypted',
      discoverOnly:  Boolean(cfg.discoverOnly ?? cfg.findKeyOnly),
    };
  }

  _announce(phase, percent, detail) {
    const frame = { phase, percent, detail };
    this.emit('progress', frame);
  }

  _runGeneration4() {
    const dbDirs = this.cfg.archiveDir
      ? [this.cfg.archiveDir]
      : (() => {
          const v4 = InstallationFinder.v4DbRootsWindows();
          if (v4.length) {
            const accountTags = v4.map(d => nodePath.basename(nodePath.dirname(d)));
            this._announce('key', 8,
              `Found ${v4.length} account(s): ${accountTags.join(', ')}`);
            return v4;
          }
          const fallback = InstallationFinder.legacyDataRoot();
          if (fallback) {
            const accounts = InstallationFinder.legacyAccountDirs(fallback);
            return accounts.length ? accounts : [fallback];
          }
          return [];
        })();

    if (!dbDirs.length) {
      throw new VaultLocateError('Weixin data directory not found. Specify archiveDir.');
    }

    this._announce('key', 10, 'Indexing archive files...');

    const allVaults = [];
    const allBySalt = Object.create(null);
    const multiAccount = dbDirs.length > 1;

    for (const dbDir of dbDirs) {
      const { vaults, bySalt } = enumerateV4Archives(dbDir);
      const acctTag = multiAccount ? nodePath.basename(nodePath.dirname(dbDir)) : null;
      for (const v of vaults) {
        const rel = acctTag ? nodePath.join(acctTag, v.relativeName) : v.relativeName;
        allVaults.push({ ...v, relativeName: rel });
      }
      for (const [salt, rels] of Object.entries(bySalt)) {
        const adjusted = acctTag ? rels.map(r => nodePath.join(acctTag, r)) : rels;
        (allBySalt[salt] ||= []).push(...adjusted);
      }
    }

    if (!allVaults.length) {
      throw new VaultLocateError('No archive files found. Specify archiveDir.');
    }

    this._announce('key', 15,
      `Found ${allVaults.length} archive(s) across ${Object.keys(allBySalt).length} salt(s)`);

    this._announce('key', 18, 'Probing Weixin.exe heap for sealed keys...');
    const broadcast = (phase, pct, msg) => this._announce(phase, pct, msg);
    const keyMap = harvestSealedKeysWin32(allVaults, allBySalt, broadcast);

    if (this.cfg.discoverOnly) {
      this._announce('done', 100,
        `Recovered ${Object.keys(keyMap).length}/${Object.keys(allBySalt).length} keys`);
      return { success: true, keyMap };
    }

    if (!Object.keys(keyMap).length) {
      throw new KeyHarvestError(
        'Failed to recover any cipher keys. Ensure Weixin is running and signed in.');
    }
    this._announce('key', 40,
      `Recovered ${Object.keys(keyMap).length}/${Object.keys(allBySalt).length} cipher key(s)`);

    const outRoot = nodePath.resolve(this.cfg.outputDir);
    nodeFs.mkdirSync(outRoot, { recursive: true });

    let unsealed = 0;
    for (let i = 0; i < allVaults.length; i++) {
      const v = allVaults[i];
      const cipherHex = keyMap[v.saltSignature];
      const pct = 40 + Math.floor((i / allVaults.length) * 55);
      if (!cipherHex) {
        this._announce('warn', pct, `No cipher key for ${v.relativeName}, skipping`);
        continue;
      }
      const target = nodePath.join(outRoot, v.relativeName);
      nodeFs.mkdirSync(nodePath.dirname(target), { recursive: true });
      this._announce('decrypt', pct, `Unsealing ${v.relativeName}...`);
      if (unsealVaultV4(v.absolutePath, cipherHex, target)) unsealed++;
      else this._announce('warn', pct, `Failed to unseal ${v.relativeName}`);
    }

    this._announce('done', 100, `Unsealed ${unsealed}/${allVaults.length} archive(s)`);
    return {
      success: true,
      outputDir: outRoot,
      decryptedCount: unsealed,
      keyMap,
    };
  }

  _runGeneration3() {
    let seedHex = this.cfg.cipherKey;

    if (!seedHex) {
      this._announce('key', 5, 'Locating Weixin (legacy) process...');
      const pid = ProcessRoster.legacyClientPid();
      if (!pid) {
        throw new KeyHarvestError(
          'Weixin process not found. Open Weixin and sign in first.');
      }
      this._announce('key', 15, `Process located, PID=${pid}`);
      this._announce('key', 20, 'Reading process memory for seed key...');
      seedHex = HOST.isWin32
        ? harvestLegacyKeyWin32(pid)
        : harvestLegacyKeyDarwin(pid);
      if (!seedHex) {
        throw new KeyHarvestError(
          'Failed to recover seed key. Make sure Weixin is running and signed in.');
      }
      this._announce('key', 40, 'Seed key recovered');
    }

    if (this.cfg.discoverOnly) {
      this._announce('done', 100, 'Seed key recovered');
      return { success: true, key: seedHex };
    }

    let archives = [];
    if (this.cfg.archiveDir) {
      archives = InstallationFinder.legacyArchives(this.cfg.archiveDir);
      if (!archives.length) {
        throw new VaultLocateError(`No archive files found under ${this.cfg.archiveDir}`);
      }
      this._announce('decrypt', 45, `Found ${archives.length} archive(s)`);
    } else {
      const root = InstallationFinder.legacyDataRoot();
      if (!root) {
        throw new VaultLocateError('Weixin data directory not found. Specify archiveDir.');
      }
      this._announce('decrypt', 42, `Data root: ${root}`);
      const accounts = InstallationFinder.legacyAccountDirs(root);
      if (!accounts.length) {
        throw new VaultLocateError('No account directories found. Specify archiveDir.');
      }
      const account = accounts[0];
      const msgDir  = InstallationFinder.legacyMessageDir(account);
      archives = InstallationFinder.legacyArchives(msgDir);
      this._announce('decrypt', 45,
        `Found ${archives.length} archive(s) in ${nodePath.basename(account)}`);
    }

    const outRoot = nodePath.resolve(this.cfg.outputDir);
    nodeFs.mkdirSync(outRoot, { recursive: true });

    let unsealed = 0;
    for (let i = 0; i < archives.length; i++) {
      const src    = archives[i];
      const name   = nodePath.basename(src);
      const target = nodePath.join(outRoot, name);
      const pct    = 45 + Math.floor((i / archives.length) * 50);
      this._announce('decrypt', pct, `Unsealing ${name}...`);
      if (unsealVaultV3(src, seedHex, target)) unsealed++;
      else this._announce('warn', pct, `Failed to unseal ${name} (key mismatch?)`);
    }

    this._announce('done', 100, `Unsealed ${unsealed}/${archives.length} archive(s)`);
    return {
      success: true,
      outputDir: outRoot,
      decryptedCount: unsealed,
      key: seedHex,
    };
  }

  run() {
    if (!HOST.isWin32 && !HOST.isDarwin) {
      throw new UnsupportedHostError('Only Windows and macOS are supported.');
    }
    this._announce('init', 0, `Host platform: ${HOST.isWin32 ? 'Windows' : 'macOS'}`);

    if (HOST.isWin32 && !this.cfg.cipherKey) {
      const v4Procs = ProcessRoster.weixinClients();
      if (v4Procs.length) {
        this._announce('key', 5,
          `Weixin (Gen 4) detected — ${v4Procs.length} process(es)`);
        return this._runGeneration4();
      }
    }
    return this._runGeneration3();
  }
}

function decrypt(options = {}) {
  const {
    dbDir,
    key,
    output      = './decrypted',
    findKeyOnly = false,
    emitFn,
  } = options;

  const sink = typeof emitFn === 'function'
    ? emitFn
    : (phase, pct, msg) => { console.log(`[${phase}] ${pct}% - ${msg}`); };

  const vault = new WeixinVault({
    archiveDir:   dbDir,
    cipherKey:    key,
    outputDir:    output,
    discoverOnly: findKeyOnly,
  });
  vault.on('progress', f => sink(f.phase, f.percent, f.detail));

  try {
    return vault.run();
  } catch (err) {
    sink('error', 0, err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  decrypt,
  WeixinVault,
  VaultLocateError,
  KeyHarvestError,
  CipherUnsealError,
  UnsupportedHostError,
};
