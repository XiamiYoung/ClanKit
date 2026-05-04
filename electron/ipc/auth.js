/**
 * IPC handlers for authentication flows that need to run in the main process
 * (filesystem / native browser / loopback server access).
 * Channels: auth:*
 *
 * Google sign-in protocol — RFC 8252 (OAuth 2.0 for Native Apps) + PKCE:
 *   1. Generate a random code_verifier (43+ chars) and code_challenge = SHA-256(verifier)
 *   2. Start a local HTTP server on 127.0.0.1:<random-port>
 *   3. Open https://accounts.google.com/o/oauth2/v2/auth?... in the user's default browser
 *   4. User authorizes → Google redirects to http://127.0.0.1:<port>/callback?code=...
 *   5. Exchange the code at https://oauth2.googleapis.com/token with code_verifier (proves it's us)
 *   6. Return id_token to the renderer; the renderer POSTs it to /auth/google
 */
const { ipcMain, shell } = require('electron')
const crypto = require('crypto')
const http = require('http')

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPES = ['openid', 'email', 'profile']
const FLOW_TIMEOUT_MS = 5 * 60 * 1000

let inFlight = null

function base64UrlEncode(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function decodeJwtPayload(jwt) {
  const parts = (jwt || '').split('.')
  if (parts.length !== 3) throw new Error('Invalid JWT format')
  const padded = parts[1] + '='.repeat((4 - (parts[1].length % 4)) % 4)
  const json = Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
  return JSON.parse(json)
}

function buildMockResponse(idToken) {
  const claims = decodeJwtPayload(idToken)
  const now = Math.floor(Date.now() / 1000)
  return {
    ok: true,
    status: 200,
    data: {
      accessToken:  `mock_access_${claims.sub || 'unknown'}_${now}`,
      refreshToken: `mock_refresh_${claims.sub || 'unknown'}_${now}`,
      email:        claims.email || '',
    },
  }
}

function makePkcePair() {
  const verifier = base64UrlEncode(crypto.randomBytes(32))
  const challenge = base64UrlEncode(crypto.createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

function htmlResponse(title, message) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font:16px/1.5 system-ui,-apple-system,sans-serif;max-width:480px;margin:80px auto;padding:0 24px;color:#333}h1{font-size:22px;margin-bottom:12px}p{color:#666}</style>
</head><body><h1>${title}</h1><p>${message}</p></body></html>`
}

async function exchangeCodeForTokens({ code, verifier, clientId, clientSecret, redirectUri }) {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    code_verifier: verifier,
  })
  let res
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(15000),
    })
  } catch (err) {
    const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError'
    if (isTimeout) throw new Error('Google token exchange timed out after 15s — check network / proxy / GFW for accounts.google.com')
    throw new Error(`Google token exchange network error: ${err?.message || err}`)
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail = data.error_description || data.error || `HTTP ${res.status}`
    throw new Error(`Google token exchange failed: ${detail}`)
  }
  if (!data.id_token) {
    throw new Error('Google did not return id_token (check requested scopes include "openid")')
  }
  return data
}

function startLoopbackServer({ stateToken, onCode, onError }) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url, `http://127.0.0.1`)
        if (url.pathname !== '/callback') {
          res.writeHead(404, { 'Content-Type': 'text/plain' })
          res.end('Not found')
          return
        }
        const code = url.searchParams.get('code')
        const state = url.searchParams.get('state')
        const errParam = url.searchParams.get('error')

        if (errParam) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(htmlResponse('Sign-in cancelled', `Google reported: <code>${errParam}</code>. You can close this tab.`))
          onError(new Error(`Google authorization error: ${errParam}`))
          return
        }
        if (!code || state !== stateToken) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(htmlResponse('Sign-in failed', 'Missing code or state mismatch. You can close this tab.'))
          onError(new Error('Invalid OAuth callback (missing code or state mismatch)'))
          return
        }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(htmlResponse('Signed in', 'You can close this tab and return to ClanKit.'))
        onCode(code)
      } catch (err) {
        try {
          res.writeHead(500, { 'Content-Type': 'text/plain' })
          res.end('Internal error')
        } catch (_) { /* socket already closed */ }
        onError(err)
      }
    })

    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      resolve({ server, port })
    })
  })
}

async function signInWithGoogle() {
  if (inFlight) throw new Error('Google sign-in is already in progress')

  const { load } = require('../lib/buildConfig')
  const cfg = load()
  const clientId = cfg.googleOAuthClientId
  const clientSecret = cfg.googleOAuthClientSecret
  if (!clientId || clientId === 'GOOGLE_OAUTH_CLIENT_ID_PLACEHOLDER') {
    throw new Error('Google OAuth client_id is not configured (electron/build-config.<env>.json)')
  }
  if (!clientSecret || clientSecret === 'GOOGLE_OAUTH_CLIENT_SECRET_PLACEHOLDER') {
    throw new Error('Google OAuth client_secret is not configured (electron/build-config.<env>.json)')
  }

  const { verifier, challenge } = makePkcePair()
  const stateToken = base64UrlEncode(crypto.randomBytes(16))

  const flowPromise = (async () => {
    let serverHandle
    let timeoutHandle
    let resolveCode, rejectFlow
    const codePromise = new Promise((resolve, reject) => {
      resolveCode = resolve
      rejectFlow = reject
    })

    serverHandle = await startLoopbackServer({
      stateToken,
      onCode: (code) => resolveCode(code),
      onError: (err) => { console.error('[auth] loopback callback error:', err?.message || err); rejectFlow(err) },
    })

    const redirectUri = `http://127.0.0.1:${serverHandle.port}/callback`
    const authUrl = new URL(AUTHORIZE_URL)
    authUrl.searchParams.set('client_id', clientId)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('scope', SCOPES.join(' '))
    authUrl.searchParams.set('code_challenge', challenge)
    authUrl.searchParams.set('code_challenge_method', 'S256')
    authUrl.searchParams.set('state', stateToken)
    authUrl.searchParams.set('access_type', 'offline')
    authUrl.searchParams.set('prompt', 'select_account')

    timeoutHandle = setTimeout(() => {
      rejectFlow(new Error('Google sign-in timed out (5 minutes). Please try again.'))
    }, FLOW_TIMEOUT_MS)

    try {
      await shell.openExternal(authUrl.toString())
      const code = await codePromise
      const tokens = await exchangeCodeForTokens({
        code,
        verifier,
        clientId,
        clientSecret,
        redirectUri,
      })
      const result = { idToken: tokens.id_token }
      if (cfg.mockBackend) {
        result.mockResponse = buildMockResponse(tokens.id_token)
        console.log('[auth] mockBackend=true — bypassing real /auth/google call')
      }
      return result
    } finally {
      clearTimeout(timeoutHandle)
      try { serverHandle.server.close() } catch (_) { /* ignore */ }
    }
  })()

  inFlight = flowPromise
  try {
    return await flowPromise
  } finally {
    inFlight = null
  }
}

function register() {
  ipcMain.handle('auth:google-sign-in', async () => {
    try {
      return await signInWithGoogle()
    } catch (err) {
      console.error('[auth] Google sign-in failed:', err?.message || err)
      throw err
    }
  })

  ipcMain.handle('auth:get-base-url', async () => {
    const { load } = require('../lib/buildConfig')
    const cfg = load()
    return { apiBaseUrl: cfg.apiBaseUrl || '', env: cfg._env || '' }
  })
}

module.exports = { register }
