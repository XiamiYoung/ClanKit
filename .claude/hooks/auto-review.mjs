#!/usr/bin/env node
// Auto-review committee hook (wired as a Claude Code `Stop` hook).
//
// Flow per task (a "task" = the run of changes accumulated since the last
// conclusion, tracked by session id + diff hash):
//   1. Stop #1  -> ROUND 1: an Opus reviewer audits the diff, lists findings.
//                  Block; inject findings to the builder with the instruction
//                  to FIX each one OR REJECT it WITH REASONING (be objective).
//   2. Stop #2  -> ROUND 2: the same reviewer re-reads the (now updated) diff
//                  plus the builder's recent reasoning and rules each finding
//                  RESOLVED (fixed, or rejection convinced the reviewer) or
//                  DISPUTED (reviewer still unconvinced and it wasn't fixed).
//                  - no disputes -> conclude, write REVIEW.md, allow stop.
//                  - disputes    -> convene the COMMITTEE.
//   3. COMMITTEE: 3 panelists (opus + sonnet + haiku), each votes per disputed
//                 finding "builder" or "reviewer" (+ one line). This script
//                 tallies (>=2 wins). Reviewer-won items become MUST-FIX,
//                 injected to the builder (final, no more pushback).
//   4. Stop #3  -> builder applied the must-fixes; committee verdict is final,
//                  so: conclude, write REVIEW.md, allow stop.
//
// A Haiku pass writes REVIEW.md as a plain-language summary for a human who
// did not read the diff. Minority/dissenting votes are not separately archived.
//
// Disable for a session:  create  .claude/.no-auto-review
// Knobs: see the CONFIG block below.

import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

// ---------------------------------------------------------------- CONFIG ----
const MIN_DIFF_LINES   = 20                       // skip review for trivial diffs
const REVIEWER_MODEL   = 'opus'                   // first-pass reviewer (rounds 1 & 2)
const PANEL_MODELS     = ['opus', 'sonnet', 'haiku']   // committee seats
const SUMMARY_MODEL    = 'haiku'                  // writes REVIEW.md
const SUBAGENT_TIMEOUT_MS = 5 * 60 * 1000         // per claude -p call (5 calls worst case < hook timeout)
const BASE_BRANCHES    = ['master', 'main']
// ----------------------------------------------------------------------------

const HOOK_DIR     = dirname(fileURLToPath(import.meta.url))
const PROMPTS_DIR  = join(HOOK_DIR, 'prompts')
const PROJECT_DIR  = process.env.CLAUDE_PROJECT_DIR || process.cwd()
const CLAUDE_DIR   = join(PROJECT_DIR, '.claude')
const STATE_FILE   = join(CLAUDE_DIR, '.review-state.json')
const DISABLE_FILE = join(CLAUDE_DIR, '.no-auto-review')
const TMP_DIR      = join(CLAUDE_DIR, '.review-tmp')
const REVIEW_FILE  = join(PROJECT_DIR, 'REVIEW.md')

// ---- hook I/O ----------------------------------------------------------------
let hook = {}
try { hook = JSON.parse(readFileSync(0, 'utf8') || '{}') } catch { /* no stdin */ }
const SESSION_ID = hook.session_id || 'unknown'
const TRANSCRIPT = hook.transcript_path || ''

const allow  = () => process.exit(0)
const block  = (reason) => { process.stdout.write(JSON.stringify({ decision: 'block', reason })); process.exit(0) }
const log    = (m) => process.stderr.write(`[auto-review] ${m}\n`)

// ---- tiny helpers ------------------------------------------------------------
function git(args) {
  const r = spawnSync('git', args, { cwd: PROJECT_DIR, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return (r.status === 0 ? (r.stdout || '') : '').trim()
}
function readPrompt(name) { return readFileSync(join(PROMPTS_DIR, name), 'utf8') }
function readState() { try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')) } catch { return null } }
function writeState(s) { mkdirSync(CLAUDE_DIR, { recursive: true }); writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)) }
function clearState() { try { rmSync(STATE_FILE, { force: true }) } catch {} }

function untrackedAsDiff() {
  const files = git(['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean)
  let out = ''
  for (const f of files) {
    let body
    try { body = readFileSync(join(PROJECT_DIR, f), 'utf8') } catch { continue }
    if (body.length > 200 * 1024 || body.includes('\u0000')) continue   // skip huge/binary
    out += `\ndiff --git a/${f} b/${f}\nnew file\n--- /dev/null\n+++ b/${f}\n` +
           body.split('\n').map(l => '+' + l).join('\n') + '\n'
  }
  return out
}
function currentDiff() {
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'])
  let tracked
  if (branch && branch !== 'HEAD' && !BASE_BRANCHES.includes(branch)) {
    let base = ''
    for (const b of BASE_BRANCHES) { base = git(['merge-base', b, 'HEAD']); if (base) break }
    const committed   = base ? git(['diff', `${base}...HEAD`]) : ''
    const uncommitted = git(['diff', 'HEAD'])
    tracked = [committed, uncommitted].filter(Boolean).join('\n')
  } else {
    tracked = git(['diff', 'HEAD'])   // on a base branch or detached: working-tree changes only
  }
  return [tracked, untrackedAsDiff()].filter(Boolean).join('\n')
}

// Recent assistant prose from the transcript — used to give the reviewer/panel
// a sense of what the builder argued. Best-effort; truncated.
function builderNotes(maxChars = 9000) {
  if (!TRANSCRIPT || !existsSync(TRANSCRIPT)) return '(transcript unavailable)'
  let lines = []
  try { lines = readFileSync(TRANSCRIPT, 'utf8').split('\n').filter(Boolean) } catch { return '(transcript unreadable)' }
  const out = []
  for (const ln of lines) {
    let ev; try { ev = JSON.parse(ln) } catch { continue }
    const msg = ev.message || ev
    if (!msg || msg.role !== 'assistant') continue
    const content = msg.content
    if (typeof content === 'string') out.push(content)
    else if (Array.isArray(content)) for (const c of content) if (c && c.type === 'text' && c.text) out.push(c.text)
  }
  const joined = out.join('\n\n---\n\n')
  return joined.length > maxChars ? '…(earlier omitted)…\n' + joined.slice(-maxChars) : (joined || '(no assistant prose found)')
}

// Run `claude -p` with a tight read-only tool set. Returns stdout text.
function runAgent(model, promptText) {
  const allowed = [
    'Read', 'Grep', 'Glob',
    'Bash(git diff:*)', 'Bash(git log:*)', 'Bash(git show:*)',
    'Bash(git status:*)', 'Bash(git merge-base:*)', 'Bash(git rev-parse:*)',
  ].join(',')
  const r = spawnSync('claude', [
    '-p', promptText,
    '--model', model,
    '--allowedTools', allowed,
    '--dangerously-skip-permissions',
  ], { cwd: PROJECT_DIR, encoding: 'utf8', timeout: SUBAGENT_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 })
  if (r.error) { log(`claude (${model}) failed: ${r.error.message}`); return '' }
  return (r.stdout || '').trim()
}

// Pull the last fenced ```json block out of an agent's reply.
function lastJsonBlock(text) {
  const re = /```json\s*([\s\S]*?)```/gi
  let m, last = null
  while ((m = re.exec(text)) !== null) last = m[1]
  if (last == null) {
    // fall back: maybe the whole reply is JSON
    const t = text.trim()
    if (t.startsWith('{') || t.startsWith('[')) last = t
  }
  if (last == null) return null
  try { return JSON.parse(last) } catch { return null }
}

function writeTmp(name, content) { mkdirSync(TMP_DIR, { recursive: true }); const p = join(TMP_DIR, name); writeFileSync(p, content); return p }

// ---- summary (Haiku -> REVIEW.md) -------------------------------------------
function writeReview(payload) {
  const tmpl = readPrompt('summarizer.md')
  const dataPath = writeTmp('summary-input.json', JSON.stringify(payload, null, 2))
  const prompt = tmpl.replace('{{DATA_FILE}}', dataPath).replace('{{OUTPUT_FILE}}', REVIEW_FILE)
  // summarizer is allowed to Write REVIEW.md only
  const r = spawnSync('claude', [
    '-p', prompt, '--model', SUMMARY_MODEL,
    '--allowedTools', `Read,Write(${REVIEW_FILE})`,
    '--dangerously-skip-permissions',
  ], { cwd: PROJECT_DIR, encoding: 'utf8', timeout: SUBAGENT_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 })
  if (r.error || !existsSync(REVIEW_FILE)) {
    // fallback: dump raw payload so nothing is lost
    try { writeFileSync(REVIEW_FILE, '# Auto-review summary (raw fallback)\n\n```json\n' + JSON.stringify(payload, null, 2) + '\n```\n') } catch {}
  }
}

// ============================================================ MAIN ===========
if (existsSync(DISABLE_FILE)) allow()

const diff = currentDiff()
const diffLines = diff ? diff.split('\n').length : 0
if (!diff || diffLines < MIN_DIFF_LINES) { clearState(); allow() }
const diffHash = createHash('sha256').update(diff).digest('hex').slice(0, 16)

let st = readState()
if (!st || st.sessionId !== SESSION_ID) st = { sessionId: SESSION_ID, phase: 'new', diffHash, findings: [], disputes: [] }
if (st.phase === 'concluded') {
  if (st.diffHash === diffHash) allow()                          // nothing new since we wrapped up
  st = { sessionId: SESSION_ID, phase: 'new', diffHash, findings: [], disputes: [] }   // builder did more -> reopen
}

const diffPath = writeTmp('diff.patch', diff)

// ---- PHASE: new  ->  ROUND 1 review -----------------------------------------
if (st.phase === 'new') {
  const prompt = readPrompt('reviewer-r1.md')
    .replace('{{DIFF_FILE}}', diffPath)
    .replace('{{BUILDER_NOTES}}', builderNotes(4000))
  const reply = runAgent(REVIEWER_MODEL, prompt)
  const parsed = lastJsonBlock(reply)
  const findings = (parsed && Array.isArray(parsed.findings)) ? parsed.findings : []
  if (findings.length === 0) {                                   // reviewer found nothing actionable
    writeReview({ outcome: 'clean-first-pass', reviewerReply: reply.slice(0, 4000), findings: [], rounds: 1 })
    st.phase = 'concluded'; st.diffHash = diffHash; writeState(st)
    allow()
  }
  // assign stable ids
  findings.forEach((f, i) => { f.id = f.id || `F${i + 1}` })
  st.phase = 'awaiting_builder_r1'; st.findings = findings; st.diffHash = diffHash; writeState(st)
  const list = findings.map(f => `### ${f.id} [${f.severity || 'unknown'}] ${f.title || ''}\n` +
    `- where: ${f.location || 'n/a'}\n- concern: ${f.concern || ''}\n- suggested fix: ${f.fix || '(reviewer left open)'}`).join('\n\n')
  block(
    `**Auto-review — round 1 (reviewer: ${REVIEWER_MODEL}, fresh context).**\n\n` +
    `For EACH finding below, do exactly one of:\n` +
    `  (a) FIX it in the code, or\n` +
    `  (b) REJECT it with concrete reasoning — you have standing to push back; do NOT accept points you believe are wrong. Be objective.\n\n` +
    `When you're done, briefly state per finding id what you did (fixed / rejected + why), then stop. ` +
    `A re-review runs automatically; unresolved disputes go to a 3-model committee whose verdict is final.\n\n` +
    `(See the receiving-code-review skill for how to engage review feedback rigorously.)\n\n` +
    list
  )
}

// ---- PHASE: awaiting_builder_r1  ->  ROUND 2 re-review ----------------------
if (st.phase === 'awaiting_builder_r1') {
  const prompt = readPrompt('reviewer-r2.md')
    .replace('{{DIFF_FILE}}', diffPath)
    .replace('{{FINDINGS_JSON}}', JSON.stringify(st.findings, null, 2))
    .replace('{{BUILDER_NOTES}}', builderNotes(9000))
  const reply = runAgent(REVIEWER_MODEL, prompt)
  const parsed = lastJsonBlock(reply)
  const verdicts = (parsed && Array.isArray(parsed.verdicts)) ? parsed.verdicts : []
  const byId = Object.fromEntries(st.findings.map(f => [f.id, f]))
  const disputes = []
  for (const v of verdicts) {
    const f = byId[v.id]; if (!f) continue
    if ((v.status || '').toUpperCase() === 'DISPUTED') {
      disputes.push({ ...f, builderPosition: v.builderPosition || '(see builder notes)', reviewerCounter: v.reviewerCounter || v.reason || '' })
    }
  }
  if (disputes.length === 0) {
    writeReview({ outcome: 'resolved-in-two-rounds', findings: st.findings, verdicts, rounds: 2 })
    st.phase = 'concluded'; st.diffHash = diffHash; st.disputes = []; writeState(st)
    allow()
  }
  // ---- COMMITTEE ----
  const panelPromptTmpl = readPrompt('panelist.md')
  const ballots = {}                              // id -> { builder: n, reviewer: n, notes: [] }
  for (const d of disputes) ballots[d.id] = { builder: 0, reviewer: 0, notes: [] }
  for (const model of PANEL_MODELS) {
    const prompt = panelPromptTmpl
      .replace('{{DIFF_FILE}}', diffPath)
      .replace('{{DISPUTES_JSON}}', JSON.stringify(disputes, null, 2))
      .replace('{{BUILDER_NOTES}}', builderNotes(9000))
    const reply = runAgent(model, prompt)
    const parsed = lastJsonBlock(reply)
    const votes = (parsed && Array.isArray(parsed.votes)) ? parsed.votes : []
    for (const vote of votes) {
      const b = ballots[vote.id]; if (!b) continue
      const side = (vote.winner || '').toLowerCase()
      if (side === 'builder' || side === 'reviewer') { b[side] += 1; b.notes.push(`${model}->${side}: ${vote.reason || ''}`) }
    }
  }
  const mustFix = disputes.filter(d => (ballots[d.id].reviewer >= 2))
  const tally = disputes.map(d => ({ id: d.id, title: d.title, ...ballots[d.id], winner: ballots[d.id].reviewer >= 2 ? 'reviewer' : (ballots[d.id].builder >= 2 ? 'builder' : 'no-majority') }))

  if (mustFix.length === 0) {
    writeReview({ outcome: 'committee-sided-with-builder', findings: st.findings, disputes, tally, rounds: 3 })
    st.phase = 'concluded'; st.diffHash = diffHash; st.disputes = []; writeState(st)
    allow()
  }
  st.phase = 'awaiting_builder_final'; st.disputes = mustFix; st.tally = tally; st.diffHash = diffHash; writeState(st)
  const list = mustFix.map(f => `### ${f.id} [${f.severity || ''}] ${f.title || ''}\n` +
    `- where: ${f.location || 'n/a'}\n- concern: ${f.concern || ''}\n- reviewer's point (committee upheld ${ballots[f.id].reviewer}-${ballots[f.id].builder}): ${f.reviewerCounter || ''}\n- expected fix: ${f.fix || '(address the concern)'}`).join('\n\n')
  block(
    `**Auto-review — committee verdict (panel: ${PANEL_MODELS.join(', ')}).**\n\n` +
    `These disputed findings were upheld for the reviewer by a 2-of-3 vote. The committee verdict is FINAL — apply the fixes; do not re-litigate. ` +
    `(${disputes.length - mustFix.length} other disputed finding(s) were decided in your favor and dropped.)\n\nThen stop.\n\n` +
    list
  )
}

// ---- PHASE: awaiting_builder_final  ->  conclude ----------------------------
if (st.phase === 'awaiting_builder_final') {
  writeReview({ outcome: 'concluded-after-committee', findings: st.findings, mustFix: st.disputes, tally: st.tally || [], rounds: 3 })
  st.phase = 'concluded'; st.diffHash = diffHash; writeState(st)
  allow()
}

// unknown phase — be safe
allow()
