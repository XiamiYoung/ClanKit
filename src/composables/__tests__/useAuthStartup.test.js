// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../stores/config', () => ({
  useConfigStore: () => ({ language: 'en' }),
}))

const accessKey = 'clankit.auth.accessToken'
const refreshKey = 'clankit.auth.refreshToken'
let fetchMock

function seedToken(secondsRemaining) {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + secondsRemaining }))
  const token = `header.${payload}.signature`
  localStorage.setItem(accessKey, token)
  localStorage.setItem(refreshKey, 'cached-refresh')
  return token
}

async function loadAuth(env, apiBaseUrl = `https://${env}.example.test`) {
  window.electronAPI = { getAuthBaseUrl: vi.fn(async () => ({ env, apiBaseUrl })) }
  const { useAuth } = await import('../useAuth')
  return useAuth()
}

describe('startup session sync', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    delete window.electronAPI
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it.each([3600, -60])('leaves a cached dev session local with %s seconds left', async remaining => {
    const token = seedToken(remaining)
    const auth = await loadAuth('dev')

    await auth.syncStartupSession()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(auth.accessToken.value).toBe(token)
    expect(auth.sessionExpiredOpen.value).toBe(false)
  })

  it('uses the configured dev backend when the user explicitly checks an email', async () => {
    seedToken(3600)
    const auth = await loadAuth('dev')
    await auth.syncStartupSession()
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ exists: true }) })

    await expect(auth.checkEmail('user@example.test')).resolves.toMatchObject({ ok: true })
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      'https://dev.example.test/auth/check-email', expect.objectContaining({ method: 'POST' }),
    )
  })

  it('validates the cached production session and preserves it when offline', async () => {
    const token = seedToken(3600)
    const auth = await loadAuth('prod')
    fetchMock.mockRejectedValue(new DOMException('Timed out', 'TimeoutError'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    await auth.syncStartupSession()

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      'https://prod.example.test/auth/me',
      expect.objectContaining({ method: 'GET', headers: expect.objectContaining({ Authorization: `Bearer ${token}` }) }),
    )
    expect(auth.accessToken.value).toBe(token)
    expect(auth.sessionExpiredOpen.value).toBe(false)
  })

  it('skips startup traffic when the production backend is unconfigured', async () => {
    seedToken(-60)
    const auth = await loadAuth('prod', '')

    await auth.syncStartupSession()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(auth.isAuthenticated.value).toBe(true)
  })
})
