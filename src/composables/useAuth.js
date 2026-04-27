import { ref, computed } from 'vue'
import { useConfigStore } from '../stores/config'
import * as api from '../services/authApi'

// ── Storage keys (localStorage) ────────────────────────────────────────────
const KEY_ACCESS  = 'clankit.auth.accessToken'
const KEY_REFRESH = 'clankit.auth.refreshToken'
const KEY_EMAIL   = 'clankit.auth.email'
const KEY_METHOD  = 'clankit.auth.method'      // 'email' | 'google' — last successful method
const KEY_NAME    = 'clankit.auth.name'        // display name (from Google profile or email signup)
const KEY_PICTURE = 'clankit.auth.picture'     // avatar URL (Google profile picture)
const KEY_CREATED = 'clankit.auth.createdAt'   // ms since epoch — backend-provided account creation time
const KEY_LAST_OPENED = 'clankit.auth.lastOpenedAt' // ms since epoch — backend-tracked "last app open"

// ── Module-level reactive state (singleton across renderer) ────────────────
const accessToken  = ref(localStorage.getItem(KEY_ACCESS)  || '')
const refreshToken = ref(localStorage.getItem(KEY_REFRESH) || '')
const email        = ref(localStorage.getItem(KEY_EMAIL)   || '')
const lastMethod   = ref(localStorage.getItem(KEY_METHOD)  || '')
const name         = ref(localStorage.getItem(KEY_NAME)    || '')
const picture      = ref(localStorage.getItem(KEY_PICTURE) || '')
const createdAt    = ref(Number(localStorage.getItem(KEY_CREATED)) || 0)
const lastOpenedAt = ref(Number(localStorage.getItem(KEY_LAST_OPENED)) || 0)

// Whether the AuthDialog is currently visible. Single source of truth — anyone
// (App.vue startup, ConfigView "Sign in" button, etc.) can open/close it.
const dialogOpen   = ref(false)

// Whether the SessionExpiredDialog is visible. Set when /auth/me or
// /auth/refresh returns 401, prompting the user to either re-sign in or keep
// using the app in unauthenticated mode.
const sessionExpiredOpen = ref(false)

// ── JWT helpers ─────────────────────────────────────────────────────────────
// Frontend never validates the signature (it has no secret). It only reads the
// `exp` claim from the payload to decide whether to proactively refresh. The
// authoritative validity check is done by the backend on every request.
function decodeJwt(token) {
  if (!token || typeof token !== 'string') return null
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - b64.length % 4) % 4)
    return JSON.parse(atob(padded))
  } catch { return null }
}
function isTokenExpired(token, bufferSeconds = 60) {
  const claims = decodeJwt(token)
  if (!claims?.exp) return true
  return claims.exp * 1000 < Date.now() + bufferSeconds * 1000
}
function tokenExpiresAtMs(token) {
  const claims = decodeJwt(token)
  return claims?.exp ? claims.exp * 1000 : 0
}

function persist() {
  if (accessToken.value)  localStorage.setItem(KEY_ACCESS,  accessToken.value);  else localStorage.removeItem(KEY_ACCESS)
  if (refreshToken.value) localStorage.setItem(KEY_REFRESH, refreshToken.value); else localStorage.removeItem(KEY_REFRESH)
  if (email.value)        localStorage.setItem(KEY_EMAIL,   email.value);        else localStorage.removeItem(KEY_EMAIL)
  if (lastMethod.value)   localStorage.setItem(KEY_METHOD,  lastMethod.value);   else localStorage.removeItem(KEY_METHOD)
  if (name.value)         localStorage.setItem(KEY_NAME,    name.value);         else localStorage.removeItem(KEY_NAME)
  if (picture.value)      localStorage.setItem(KEY_PICTURE, picture.value);      else localStorage.removeItem(KEY_PICTURE)
  if (createdAt.value)    localStorage.setItem(KEY_CREATED, String(createdAt.value)); else localStorage.removeItem(KEY_CREATED)
  if (lastOpenedAt.value) localStorage.setItem(KEY_LAST_OPENED, String(lastOpenedAt.value)); else localStorage.removeItem(KEY_LAST_OPENED)
}

// Coerce a backend timestamp (unix-seconds number OR ISO string OR ms number)
// to milliseconds since epoch, or 0 if missing/invalid. Backend currently returns
// unix seconds for created_at and last_opened_at (see /auth/me handler).
function toMillis(v) {
  if (v == null || v === '') return 0
  if (typeof v === 'number') {
    // Heuristic: < year 2100 in seconds → seconds; otherwise already ms.
    return v < 4_000_000_000 ? v * 1000 : v
  }
  const t = new Date(v).getTime()
  return Number.isFinite(t) ? t : 0
}

function applyTokens(emailValue, tokens, method) {
  email.value        = emailValue
  accessToken.value  = tokens.accessToken
  refreshToken.value = tokens.refreshToken || refreshToken.value
  lastMethod.value   = method
  // Profile data is optional and may arrive on subsequent logins; only update if returned.
  const profile = tokens.user || {}
  if (profile.name)    name.value    = profile.name
  if (profile.picture) picture.value = profile.picture
  // createdAt / lastOpenedAt — backend is the sole source of truth. If the
  // server doesn't return these (older login endpoints that haven't been
  // updated yet), we leave the existing value alone and let /auth/me backfill
  // on the next app open.
  const backendCreatedAt    = toMillis(profile.createdAt)
  const backendLastOpenedAt = toMillis(profile.lastOpenedAt)
  if (backendCreatedAt)    createdAt.value    = backendCreatedAt
  if (backendLastOpenedAt) lastOpenedAt.value = backendLastOpenedAt
  persist()
}

// Mark the user as having seen the auth screen (signed in OR explicitly skipped).
// Persisted in config.json so it survives reinstalls of the renderer-side localStorage
// and follows the user's CLANKAI_DATA_PATH. Safe to call multiple times — idempotent.
async function markAuthOnboardedInConfig() {
  try {
    // Lazy import to avoid load-order dependency on Pinia.
    const { useConfigStore } = await import('../stores/config')
    const cfg = useConfigStore()
    if (cfg.config?.authOnboarded) return
    await cfg.saveConfig({ authOnboarded: true })
  } catch (err) {
    console.warn('[useAuth] failed to persist authOnboarded:', err?.message)
  }
}

export function useAuth() {
  const configStore = useConfigStore()

  // ── Method resolution: language → product variant ──────────────────────
  // Priority: remembered last method > language default
  // zh-* locale → primary 'email' (China path) · else → primary 'google'
  const isChinese = computed(() => (configStore.language || 'en').startsWith('zh'))
  const primaryMethod = computed(() => {
    if (lastMethod.value === 'email' || lastMethod.value === 'google') return lastMethod.value
    return isChinese.value ? 'email' : 'google'
  })
  const secondaryMethod = computed(() => primaryMethod.value === 'google' ? 'email' : 'google')

  const isAuthenticated = computed(() => !!accessToken.value)

  // ── Email + password ───────────────────────────────────────────────────
  // Email-first sign-in entry: backend returns { exists: bool } so the UI
  // can route to "enter password" (existing) or "create account" (new).
  async function checkEmail(emailInput) {
    return api.checkEmail(emailInput)
  }

  async function signUpStart(emailInput, password, displayName) {
    const r = await api.register(emailInput, password, displayName)
    // Optimistically remember the name client-side; backend echoes it back on verify-email.
    if (r.ok && displayName) name.value = displayName
    return r
  }
  async function signUpVerify(emailInput, otp) {
    const r = await api.verifyEmail(emailInput, otp)
    if (r.ok && r.data?.accessToken) {
      applyTokens(emailInput, r.data, 'email')
      markAuthOnboardedInConfig()
    }
    return r
  }
  async function signInWithEmail(emailInput, password) {
    const r = await api.login(emailInput, password)
    if (r.ok && r.data?.accessToken) {
      applyTokens(emailInput, r.data, 'email')
      markAuthOnboardedInConfig()
    }
    return r
  }
  async function requestPasswordReset(emailInput) {
    return api.forgotPassword(emailInput)
  }
  async function confirmPasswordReset(emailInput, otp, newPassword) {
    return api.resetPassword(emailInput, otp, newPassword)
  }

  // ── Google OAuth ──────────────────────────────────────────────────────
  // The full OAuth dance (PKCE + loopback server) lives in Electron main
  // process — exposed via window.electronAPI.signInWithGoogle().
  // Renderer just receives the id_token and forwards it to the backend.
  // See docs/architecture.html section 08 for the implementation contract.
  async function signInWithGoogle() {
    if (!window.electronAPI?.signInWithGoogle) {
      console.error('[auth] electronAPI.signInWithGoogle not exposed by preload — main process IPC handler missing')
      return {
        ok: false,
        status: 0,
        data: null,
        error: 'Google sign-in is not wired up in this build. Implement window.electronAPI.signInWithGoogle in electron/main.js (see infra docs section 08).',
      }
    }
    let idToken, mockResponse
    try {
      const result = await window.electronAPI.signInWithGoogle()
      idToken = result?.idToken
      mockResponse = result?.mockResponse
    } catch (err) {
      console.error('[auth] main-process OAuth flow failed:', err?.message || err)
      return { ok: false, status: 0, data: null, error: err?.message || 'Google sign-in cancelled' }
    }
    if (!idToken) {
      console.error('[auth] main returned no idToken — Google flow aborted before token exchange')
      return { ok: false, status: 0, data: null, error: 'No id_token returned from Google' }
    }

    // Dev/test: when mockBackend:true, main synthesizes a fake backend response.
    if (mockResponse) {
      if (mockResponse.ok && mockResponse.data?.accessToken) {
        applyTokens(mockResponse.data.email || '(google)', mockResponse.data, 'google')
        markAuthOnboardedInConfig()
      } else {
        console.error('[auth] mockResponse not ok:', mockResponse)
      }
      return mockResponse
    }

    const r = await api.googleLogin(idToken)
    if (r.ok && r.data?.accessToken) {
      applyTokens(email.value || '(google)', r.data, 'google')
      markAuthOnboardedInConfig()
    } else {
      console.error('[auth] backend /auth/google rejected:', { status: r.status, error: r.error, data: r.data })
    }
    return r
  }

  // ── Refresh / sign out ────────────────────────────────────────────────
  async function refreshAccessToken() {
    if (!refreshToken.value) {
      console.warn('[auth] refreshAccessToken: no refresh token in localStorage')
      return { ok: false, error: 'No refresh token' }
    }
    console.log('[auth] refreshAccessToken: calling /auth/refresh')
    const r = await api.refresh(refreshToken.value)
    if (r.ok && r.data?.accessToken) {
      accessToken.value = r.data.accessToken
      if (r.data.refreshToken) refreshToken.value = r.data.refreshToken
      persist()
      const newExp = tokenExpiresAtMs(accessToken.value)
      console.log('[auth] refreshAccessToken: rotated, new accessToken exp =', newExp ? new Date(newExp).toISOString() : '(no exp)')
    } else if (r.status === 401) {
      console.warn('[auth] refreshAccessToken: refresh token rejected (401) → signing out')
      signOut()
      sessionExpiredOpen.value = true
    } else {
      console.error('[auth] refreshAccessToken: failed', { status: r.status, error: r.error })
    }
    return r
  }

  // Public coroutine for business APIs. Call before any authenticated request:
  //   await auth.ensureFreshAccessToken()
  //   fetch(url, { headers: { Authorization: `Bearer ${auth.accessToken.value}` } })
  // Returns { ok: true, refreshed: bool } when the access token is usable,
  // { ok: false } when the user must re-authenticate (signOut already happened).
  async function ensureFreshAccessToken() {
    if (!accessToken.value) {
      console.log('[auth] ensureFreshAccessToken: no token in localStorage — skipping')
      return { ok: false, error: 'Not authenticated' }
    }
    const expMs = tokenExpiresAtMs(accessToken.value)
    const remainingSec = expMs ? Math.round((expMs - Date.now()) / 1000) : null
    if (!isTokenExpired(accessToken.value, 60)) {
      return { ok: true, accessToken: accessToken.value, refreshed: false }
    }
    console.log('[auth] ensureFreshAccessToken: token within 60s of expiry (remaining=' + remainingSec + 's) — refreshing')
    const r = await refreshAccessToken()
    if (r.ok) return { ok: true, accessToken: accessToken.value, refreshed: true }
    return { ok: false, error: r.error || 'Session expired' }
  }

  // Hit GET /auth/me on startup to (a) confirm the cached access token is still
  // valid against the backend (catches jwt_secret rotation / account deletion
  // / local tampering — cases ensureFreshAccessToken can't), (b) refresh the
  // local profile (name / picture / createdAt / lastOpenedAt) from the
  // authoritative source, and (c) bump last_opened_at server-side so the
  // backend tracks "when did this user last open the app".
  //
  // Network failures (timeout / DNS) do NOT sign the user out — we keep the
  // optimistic local state so flaky networks don't kick people offline. Only
  // an explicit 401 invalidates the session.
  async function fetchMe() {
    if (!accessToken.value) {
      return { ok: false, error: 'Not authenticated' }
    }
    const r = await api.me(accessToken.value)
    if (r.ok) {
      let updated = false
      if (r.data?.name    && r.data.name    !== name.value)    { name.value    = r.data.name;    updated = true }
      if (r.data?.picture && r.data.picture !== picture.value) { picture.value = r.data.picture; updated = true }
      const newCreatedAt    = toMillis(r.data?.createdAt)
      const newLastOpenedAt = toMillis(r.data?.lastOpenedAt)
      if (newCreatedAt    && newCreatedAt    !== createdAt.value)    { createdAt.value    = newCreatedAt;    updated = true }
      if (newLastOpenedAt && newLastOpenedAt !== lastOpenedAt.value) { lastOpenedAt.value = newLastOpenedAt; updated = true }
      if (updated) persist()
      return { ok: true, data: r.data }
    }
    if (r.status === 401) {
      console.warn('[auth] fetchMe: backend rejected token (401:', r.error + ') → signing out')
      signOut()
      sessionExpiredOpen.value = true
      return { ok: false, error: r.error }
    }
    console.warn('[auth] fetchMe: transient failure (status=' + r.status + ', error=' + r.error + ') — keeping local state')
    return { ok: false, error: r.error, transient: true }
  }
  function signOut() {
    accessToken.value = ''
    refreshToken.value = ''
    email.value = ''
    name.value = ''
    picture.value = ''
    createdAt.value = 0
    lastOpenedAt.value = 0
    // intentionally keep lastMethod so next launch defaults to it
    persist()
  }

  // Public method — exposed so AuthDialog's "Skip" / close button can mark onboarding done.
  async function markAuthOnboarded() {
    await markAuthOnboardedInConfig()
  }

  function openAuthDialog()  { dialogOpen.value = true }
  function closeAuthDialog() { dialogOpen.value = false }

  function dismissSessionExpired() { sessionExpiredOpen.value = false }
  function reauthenticate() {
    sessionExpiredOpen.value = false
    dialogOpen.value = true
  }

  return {
    // state
    email,
    name,
    picture,
    createdAt,
    lastOpenedAt,
    accessToken,
    refreshToken,
    lastMethod,
    isAuthenticated,
    isChinese,
    primaryMethod,
    secondaryMethod,
    dialogOpen,
    // actions
    checkEmail,
    signUpStart,
    signUpVerify,
    signInWithEmail,
    signInWithGoogle,
    requestPasswordReset,
    confirmPasswordReset,
    refreshAccessToken,
    ensureFreshAccessToken,
    fetchMe,
    signOut,
    markAuthOnboarded,
    openAuthDialog,
    closeAuthDialog,
    sessionExpiredOpen,
    dismissSessionExpired,
    reauthenticate,
    // helpers (read-only)
    isTokenExpired,
    tokenExpiresAtMs,
  }
}
