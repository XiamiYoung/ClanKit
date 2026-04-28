/**
 * OS-keychain-backed string encryption for sensitive config fields.
 *
 * Uses Electron's `safeStorage`, which on each platform binds the encryption
 * key to the current OS user account:
 *   - Windows: DPAPI (current user)
 *   - macOS:   Keychain (current user / login keychain)
 *   - Linux:   libsecret (GNOME Keyring / KWallet)
 *
 * Ciphertext is stored as `enc:v1:<base64>` so we can:
 *   1. Distinguish encrypted from plaintext (legacy / migration in progress)
 *   2. Make `encryptString` idempotent — re-encrypting an already-encrypted
 *      value is a no-op, so round-trip read/modify/write of unrelated fields
 *      doesn't double-wrap the ciphertext.
 *
 * On platforms where `safeStorage.isEncryptionAvailable()` returns false (e.g.
 * Linux without a keyring), we fall through to plaintext storage and emit a
 * one-time warning. Better than refusing to start.
 */
const { logger } = require('../logger')

const PREFIX = 'enc:v1:'

let _safeStorage = null
let _availabilityWarned = false

function _getSafeStorage() {
  if (_safeStorage !== null) return _safeStorage
  try {
    const electron = require('electron')
    _safeStorage = electron && electron.safeStorage ? electron.safeStorage : false
  } catch {
    _safeStorage = false
  }
  return _safeStorage
}

function isAvailable() {
  const ss = _getSafeStorage()
  if (!ss || typeof ss.isEncryptionAvailable !== 'function') return false
  try {
    const ok = ss.isEncryptionAvailable()
    if (!ok && !_availabilityWarned) {
      logger.warn('[safeStorage] OS encryption unavailable — sensitive config fields will be stored as plaintext')
      _availabilityWarned = true
    }
    return ok
  } catch {
    return false
  }
}

function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX)
}

function encryptString(plain) {
  if (typeof plain !== 'string' || plain === '') return plain
  if (isEncrypted(plain)) return plain
  if (!isAvailable()) return plain
  try {
    const ss = _getSafeStorage()
    const buf = ss.encryptString(plain)
    return PREFIX + buf.toString('base64')
  } catch (err) {
    logger.error('[safeStorage] encryptString failed', err.message)
    return plain
  }
}

function decryptString(value) {
  if (typeof value !== 'string' || value === '') return value
  if (!isEncrypted(value)) return value
  if (!isAvailable()) {
    logger.error('[safeStorage] cannot decrypt — OS encryption unavailable')
    return ''
  }
  try {
    const ss = _getSafeStorage()
    const buf = Buffer.from(value.slice(PREFIX.length), 'base64')
    return ss.decryptString(buf)
  } catch (err) {
    logger.error('[safeStorage] decryptString failed (data may be from another device or user account):', err.message)
    return ''
  }
}

module.exports = { encryptString, decryptString, isAvailable, isEncrypted, PREFIX }
