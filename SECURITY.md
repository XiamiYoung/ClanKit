# Security Policy

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

If you discover a security issue in ClanKit, report it privately so we can investigate and ship a fix before details become public.

**Email:** [hello@clankit.app](mailto:hello@clankit.app)

Please include:

- A description of the issue and its potential impact
- Steps to reproduce (proof-of-concept code, screenshots, or a minimal repro)
- The version of ClanKit you tested against (`Help → About` or `package.json` `version`)
- Your operating system and Node version, if relevant
- Any suggested mitigation

We will acknowledge your report within **3 business days** and keep you updated on the fix timeline.

## Scope

In scope:

- The ClanKit desktop application (Electron main process, preload, renderer)
- IPC handlers and the agent execution pipeline
- The optional cloud backend (`api.clankit.app`) — auth, telemetry, release feed
- Bundled tools (file, shell, MCP) when they enable privilege escalation, sandbox escape, or arbitrary code execution beyond their intended permission scope

Out of scope:

- Vulnerabilities in upstream dependencies — please report those to the upstream project (we'll bump the version once they ship a fix)
- Issues that require physical access to an unlocked machine, or a malicious local user with root/admin rights
- Self-XSS or social-engineering attacks that require the user to paste attacker-controlled content into config fields
- Issues in third-party LLM providers' APIs

## Coordinated Disclosure

We follow a 90-day coordinated disclosure window by default. If a fix requires longer (e.g. a complex fix involving native modules or a coordinated upstream release), we will let you know and discuss timing.

We're happy to credit reporters in the release notes — let us know in your report whether you'd like to be named or remain anonymous.

## Hall of Fame

Once we have reports, this section will list researchers who have responsibly disclosed issues to ClanKit. Thank you in advance.
