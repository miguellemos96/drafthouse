#!/usr/bin/env node
// Decides the factory's next step from GitHub state. No AI, no writes.
// Prints one JSON line: {"step":"idle|verify|fix|work", ...}.
//
// Usage:
//   node scripts/factory/next-step.mjs            next step as JSON
//   node scripts/factory/next-step.mjs --dry-run  human-readable queue view
//   node scripts/factory/next-step.mjs --lock-changed   "yes" if package-lock.json changed since the last successful npm ci
//   node scripts/factory/next-step.mjs --lock-installed npm ci succeeded: remember this package-lock.json
//
// The pure functions (pickStep, orderQueue, verdictOf) are exported for tests:
//   node --test scripts/factory/next-step.test.mjs
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOME = join(homedir(), '.factory')
const DEFAULTS = { start: '21:00', cutoff: '03:00', maxFixRounds: 2, maxInconclusive: 2, branchPrefix: 'factory/' }

const HOLD_LABELS = new Set(['needs-info', 'human', 'needs-triage'])

// ── pure decision logic ─────────────────────────────────────────────

/** Minutes since midnight for "HH:MM". */
const minutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** True when `now` falls in the night window; handles windows across midnight. */
export const inWindow = (now, start, cutoff) => {
  const t = now.getHours() * 60 + now.getMinutes()
  const s = minutes(start)
  const c = minutes(cutoff)
  return s <= c ? t >= s && t < c : t >= s || t < c
}

/** The verifier verdict on a PR's current head, from its status checks. */
export const verdictOf = (pr) => {
  const status = (pr.statusCheckRollup ?? []).find((c) => c.context === 'verifier')
  return status?.state ?? null // SUCCESS | FAILURE | ERROR | PENDING | null
}

const countComments = (pr, heading) => (pr.comments ?? []).filter((c) => c.body.startsWith(heading)).length

/** Queue order: workable issues only, bugs first, then oldest first. */
export const orderQueue = (issues, { me, openPrIssues }) =>
  issues
    .filter((i) => {
      const labels = new Set(i.labels.map((l) => l.name))
      if (!labels.has('ready-for-agent')) return false
      if ([...HOLD_LABELS].some((l) => labels.has(l))) return false
      if (i.assignees.some((a) => a.login !== me)) return false
      if (openPrIssues.has(i.number)) return false
      if ((i.openBlockers ?? 0) > 0) return false
      return true
    })
    .sort((a, b) => {
      const bug = (i) => (i.labels.some((l) => l.name === 'bug') ? 0 : 1)
      return bug(a) - bug(b) || a.createdAt.localeCompare(b.createdAt)
    })

// No checks yet means GitHub has not registered them: not green.
const checksGreen = (pr) => {
  const checks = (pr.statusCheckRollup ?? []).filter((c) => c.context !== 'verifier')
  return checks.length > 0 && checks.every((c) => ['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(c.conclusion ?? c.state))
}

/** Finish before starting: verify, then fix, then new work. */
export const pickStep = ({ now, config, stop, prs, issues, me }) => {
  if (stop) return { step: 'idle', reason: 'stop file' }
  if (!inWindow(now, config.start, config.cutoff)) return { step: 'idle', reason: 'outside hours' }

  const factoryPrs = prs.filter((p) => p.headRefName.startsWith(config.branchPrefix) && !p.isDraft)
  const issueOf = (pr) => pr.closingIssuesReferences?.[0]?.number

  for (const pr of factoryPrs) {
    const verdict = verdictOf(pr)
    if (verdict === null && checksGreen(pr)) return { step: 'verify', pr: pr.url, issue: issueOf(pr) }
    if (verdict === 'ERROR' && countComments(pr, '## Verifier: INCONCLUSIVE') < config.maxInconclusive)
      return { step: 'verify', pr: pr.url, issue: issueOf(pr) }
  }
  for (const pr of factoryPrs) {
    if (verdictOf(pr) === 'FAILURE' && countComments(pr, '## Verifier: FAIL') <= config.maxFixRounds)
      return { step: 'fix', pr: pr.url, issue: issueOf(pr) }
  }
  const openPrIssues = new Set(prs.flatMap((p) => (p.closingIssuesReferences ?? []).map((r) => r.number)))
  const [next] = orderQueue(issues, { me, openPrIssues })
  return next ? { step: 'work', issue: next.number } : { step: 'idle', reason: 'queue empty' }
}

// ── I/O ─────────────────────────────────────────────────────────────

const gh = (...args) => JSON.parse(execFileSync('gh', args, { encoding: 'utf8' }))

const loadConfig = () => {
  const path = join(HOME, 'config.json')
  return { ...DEFAULTS, ...(existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {}) }
}

const LOCK_MARKER = join(HOME, 'lock.sha256')
const lockHash = () => createHash('sha256').update(readFileSync('package-lock.json')).digest('hex')

// The marker is written only after npm ci succeeds, so a failed install is retried next tick.
const lockChanged = () => {
  if (!existsSync('package-lock.json')) return false
  return !existsSync(LOCK_MARKER) || readFileSync(LOCK_MARKER, 'utf8') !== lockHash() || !existsSync('node_modules')
}

const lockInstalled = () => {
  mkdirSync(HOME, { recursive: true })
  writeFileSync(LOCK_MARKER, lockHash())
}

const main = () => {
  if (process.argv.includes('--lock-changed')) return console.log(lockChanged() ? 'yes' : 'no')
  if (process.argv.includes('--lock-installed')) return lockInstalled()

  const config = loadConfig()
  const me = execFileSync('gh', ['api', 'user', '--jq', '.login'], { encoding: 'utf8' }).trim()
  const prs = gh('pr', 'list', '--state', 'open', '--author', '@me', '--json',
    'url,number,headRefName,isDraft,statusCheckRollup,comments,closingIssuesReferences')
  const issues = gh('issue', 'list', '--state', 'open', '--label', 'ready-for-agent', '--limit', '100', '--json',
    'number,title,labels,assignees,createdAt')
  // TODO: fill `openBlockers` from GitHub issue dependencies (REST: /issues/{n}/dependencies/blocked_by).

  const step = pickStep({ now: new Date(), config, stop: existsSync(join(HOME, 'STOP')), prs, issues, me })

  if (process.argv.includes('--dry-run')) {
    const openPrIssues = new Set(prs.flatMap((p) => (p.closingIssuesReferences ?? []).map((r) => r.number)))
    console.log('Next step:', step)
    console.log('Queue:', orderQueue(issues, { me, openPrIssues }).map((i) => `#${i.number} ${i.title}`))
    return
  }
  console.log(JSON.stringify(step))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
