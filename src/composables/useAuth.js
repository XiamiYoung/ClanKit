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

// ── Module-level reactive state (singleton across renderer) ────────────────
const accessToken  = ref(localStorage.getItem(KEY_ACCESS)  || '')
const refreshToken = ref(localStorage.getItem(KEY_REFRESH) || '')
const email        = ref(localStorage.getItem(KEY_EMAIL)   || '')
const lastMethod   = ref(localStorage.getItem(KEY_METHOD)  || '')
const name         = ref(localStorage.getItem(KEY_NAME)    || '')
const picture      = ref(localStorage.getItem(KEY_PICTURE) || '')

// Whether the AuthDialog is currently visible. Single source of truth — anyone
// (App.vue startup, ConfigView "Sign in" button, etc.) can open/close it.
const dialogOpen   = ref(false)

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
      return { ok: false, status: 0, data: null, error: err?.message || 'Google sign-in cancelled' }
    }
    if (!idToken) return { ok: false, status: 0, data: null, error: 'No id_token returned from Google' }

    // Dev/test: when build-config.json has mockBackend:true, main process
    // synthesizes a fake backend response so the renderer flow can be exercised
    // without a deployed /auth/google endpoint.
    if (mockResponse) {
      if (mockResponse.ok && mockResponse.data?.accessToken) {
        applyTokens(mockResponse.data.email || '(google)', mockResponse.data, 'google')
        markAuthOnboardedInConfig()
      }
      return mockResponse
    }

    const r = await api.googleLogin(idToken)
    if (r.ok && r.data?.accessToken) {
      applyTokens(email.value || '(google)', r.data, 'google')
      markAuthOnboardedInConfig()
    }
    return r
  }

  // ── Refresh / sign out ────────────────────────────────────────────────
  async function refreshAccessToken() {
    if (!refreshToken.value) return { ok: false, error: 'No refresh token' }
    const r = await api.refresh(refreshToken.value)
    if (r.ok && r.data?.accessToken) {
      accessToken.value = r.data.accessToken
      // Sliding window: backend issues a new refresh token on every refresh.
      if (r.data.refreshToken) refreshToken.value = r.data.refreshToken
      persist()
    } else if (r.status === 401) {
      // Refresh token itself is invalid/expired — force re-auth.
      signOut()
    }
    return r
  }

  // Public coroutine for business APIs. Call before any authenticated request:
  //   await auth.ensureFreshAccessToken()
  //   fetch(url, { headers: { Authorization: `Bearer ${auth.accessToken.value}` } })
  // Returns { ok: true } when the access token is usable, { ok: false } when
  // the user must re-authenticate (signOut already happened).
  async function ensureFreshAccessToken() {
    if (!accessToken.value) return { ok: false, error: 'Not authenticated' }
    // 60s safety buffer: refresh slightly before exp so the token doesn't die
    // mid-flight on a slow request.
    if (!isTokenExpired(accessToken.value, 60)) {
      return { ok: true, accessToken: accessToken.value }
    }
    const r = await refreshAccessToken()
    if (r.ok) return { ok: true, accessToken: accessToken.value }
    return { ok: false, error: r.error || 'Session expired' }
  }
  function signOut() {
    accessToken.value = ''
    refreshToken.value = ''
    email.value = ''
    name.value = ''
    picture.value = ''
    // intentionally keep lastMethod so next launch defaults to it
    persist()
  }

  // Public method — exposed so AuthDialog's "Skip" / close button can mark onboarding done.
  async function markAuthOnboarded() {
    await markAuthOnboardedInConfig()
  }

  function openAuthDialog()  { dialogOpen.value = true }
  function closeAuthDialog() { dialogOpen.value = false }

  return {
    // state
    email,
    name,
    picture,
    accessToken,
    refreshToken,
    lastMethod,
    isAuthenticated,
    isChinese,
    primaryMethod,
    secondaryMethod,
    dialogOpen,
    // actions
    signUpStart,
    signUpVerify,
    signInWithEmail,
    signInWithGoogle,
    requestPasswordReset,
    confirmPasswordReset,
    refreshAccessToken,
    ensureFreshAccessToken,
    signOut,
    markAuthOnboarded,
    openAuthDialog,
    closeAuthDialog,
    // helpers (read-only)
    isTokenExpired,
    tokenExpiresAtMs,
  }
}
