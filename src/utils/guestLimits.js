// IS_DEV is injected by Vite at build time: true during `npm run dev`, false in production builds.
// Regular users cannot modify this after build — it is compiled into the bundle.
const IS_DEV = import.meta.env.DEV

// Per-resource caps applied to guest (non-signed-in) users in production builds.
// See docs/architecture/guest-limits.md for rationale and how this is enforced.
export const PREVIEW_LIMITS = {
  maxChats: 15,
  maxFolders: 5,
  maxAgents: 20,
  maxUserPersonas: 3,
  maxTasks: 5,
  maxPlans: 5,
  maxSkills: 20,
  maxMcpServers: 5,
  maxKnowledgeBases: 3,
  maxTools: 10,
  maxProviders: 3,
  maxVoiceSecsPerDay: 600, // 10 minutes
}

// localStorage key written by useAuth.js after a successful sign-in.
// We read it directly (instead of importing the auth composable) to avoid
// a Vue runtime dependency in this tiny utility — keeps it usable from
// non-component code paths (Pinia stores, plain modules).
const ACCESS_TOKEN_KEY = 'clankit.auth.accessToken'

function isSignedIn() {
  try {
    return !!(typeof localStorage !== 'undefined' && localStorage.getItem(ACCESS_TOKEN_KEY))
  } catch {
    return false
  }
}

/**
 * Returns true when guest limits should be enforced.
 * - Dev mode (npm run dev): never enforced — developers have unrestricted access.
 * - Production builds: enforced for guests; lifted the moment the user signs in.
 */
export function isLimitEnforced() {
  if (IS_DEV) return false
  return !isSignedIn()
}
