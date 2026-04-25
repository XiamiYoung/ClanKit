// HTTP client for the Clankit auth API.
// Backend: D:/workspace/clank_infra — see docs/architecture.html for the contract.
//
// All endpoints return: { ok: boolean, status: number, data: object, error?: string }
// On network failure: { ok: false, status: 0, data: null, error: 'Network error' }

const API_BASE_URL =
  import.meta.env.VITE_AUTH_API_BASE_URL || 'https://api.clankit.app'

async function request(path, body) {
  try {
    const resp = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await resp.json().catch(() => ({}))
    return {
      ok: resp.ok,
      status: resp.status,
      data,
      error: resp.ok ? undefined : (data?.error || `HTTP ${resp.status}`),
    }
  } catch (err) {
    return { ok: false, status: 0, data: null, error: err?.message || 'Network error' }
  }
}

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
