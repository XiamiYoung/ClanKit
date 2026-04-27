// HTTP client for the Clankit auth API.
// Backend: D:/workspace/clank_infra — see docs/architecture.html for the contract.
//
// Base URL comes from main process (build-config.{dev,prod}.json) via IPC,
// so renderer and main always agree on which backend to hit.
//
// All endpoints return: { ok: boolean, status: number, data: object, error?: string }
// On network failure: { ok: false, status: 0, data: null, error: 'Network error' }

const REQUEST_TIMEOUT_MS = 15000

let baseUrlPromise = null

function resolveBaseUrl() {
  if (!baseUrlPromise) {
    baseUrlPromise = (async () => {
      const r = await window.electronAPI.getAuthBaseUrl()
      return r.apiBaseUrl || ''
    })()
  }
  return baseUrlPromise
}

async function request(path, body, { authToken, method = 'POST' } = {}) {
  const baseUrl = await resolveBaseUrl()
  if (!baseUrl) {
    const msg = 'API base URL not configured (check electron/build-config.<env>.json)'
    console.error('[authApi]', path, '✗', msg)
    return { ok: false, status: 0, data: null, error: msg }
  }
  const url = `${baseUrl}${path}`
  const headers = { 'Content-Type': 'application/json' }
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`
  try {
    const resp = await fetch(url, {
      method,
      headers,
      // GET requests must not have a body — fetch will throw otherwise.
      body: method === 'GET' ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    const data = await resp.json().catch(() => ({}))
    if (!resp.ok) {
      console.error('[authApi]', path, '✗', resp.status, data)
      return { ok: false, status: resp.status, data, error: data?.error || `HTTP ${resp.status}` }
    }
    return { ok: true, status: resp.status, data, error: undefined }
  } catch (err) {
    const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError'
    const msg = isTimeout
      ? `Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s — backend ${url} unreachable`
      : (err?.message || 'Network error')
    console.error('[authApi]', path, '✗', msg, err)
    return { ok: false, status: 0, data: null, error: msg }
  }
}

// Email-first sign-in: ask backend whether an email is already registered so
// the UI can route to the password page (existing) or create-account page (new).
// Returns { ok: true, data: { exists: bool } } on success.
export const checkEmail      = (email)                        => request('/auth/check-email',     { email })

// Email + password — China default path.
export const register        = (email, password, name)        => request('/auth/register',        { email, password, name })
export const verifyEmail     = (email, otp)                   => request('/auth/verify-email',    { email, otp })
export const login           = (email, password)              => request('/auth/login',           { email, password })
export const forgotPassword  = (email)                        => request('/auth/forgot-password', { email })
export const resetPassword   = (email, otp, newPassword)      => request('/auth/reset-password',  { email, otp, newPassword })
export const refresh         = (refreshToken)                 => request('/auth/refresh',         { refreshToken })

// Google — overseas default path. Pass the id_token returned by Google's OAuth flow.
// The actual OAuth dance (loopback server + PKCE) lives in Electron main process;
// see docs/architecture.html section 08 for the full sequence.
export const googleLogin     = (idToken)                      => request('/auth/google',          { idToken })

// GET /auth/me — fetch the currently-authenticated user's profile and bump
// last_opened_at server-side. Doubles as the access-token validity check
// (401 → caller should sign out). Response includes:
//   { email, name, picture, createdAt, lastOpenedAt, exp }
export const me              = (accessToken)                  => request('/auth/me',              null, { authToken: accessToken, method: 'GET' })
