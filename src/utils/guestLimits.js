// IS_DEV is injected by Vite at build time: true during `npm run dev`, false in production builds.
// Regular users cannot modify this after build — it is compiled into the bundle.
const IS_DEV = import.meta.env.DEV

export const PREVIEW_LIMITS = {
  maxChats: 10,
  maxFolders: 5,
  maxAgents: 10,
  maxSkills: 20,
  maxMcpServers: 5,
  maxKnowledgeBases: 3,
  maxTools: 10,
  maxProviders: 3,
  maxVoiceSecsPerDay: 600, // 10 minutes
}

/**
 * Returns true when limits should be enforced.
 * Always false in dev mode (npm run dev) so developers have unrestricted access.
 */
export function isLimitEnforced() {
  return !IS_DEV
}
