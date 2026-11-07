#!/usr/bin/env node
// PreToolUse hook for Bash. Refuses commands that only the human may run,
// even if a permission rule is too broad. Claude Code passes the tool call as
// JSON on stdin; exit code 2 blocks the call and shows stderr to the agent.
//
// Wire it in .claude/settings.json:
//   "hooks": { "PreToolUse": [ { "matcher": "Bash", "hooks": [
//     { "type": "command", "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/guard-bash.mjs\"" } ] } ] }
//
// This is a coarse text check, not a shell parser. Pair it with branch
// protection on GitHub, and add tests (node --test) for each rule you rely on.
import { readFileSync } from 'node:fs'

const PROTECTED = ['main', 'master']

const input = JSON.parse(readFileSync(0, 'utf8'))
const command = String(input?.tool_input?.command ?? '')

// Split on shell operators so `a && git push origin main` is still caught.
const parts = command.split(/&&|\|\||;|\||\n|\$\(|`/).map((p) => p.trim()).filter(Boolean)

const reasons = []
for (const part of parts) {
  const words = part.split(/\s+/)
  const at = words.indexOf('git')
  if (at !== -1 && words.slice(at).includes('push')) {
    const args = words.slice(words.indexOf('push') + 1)
    if (args.some((a) => ['--all', '--mirror', '--branches', '--delete', '-d'].includes(a)))
      reasons.push('git push of all branches or deletes')
    for (const a of args) {
      const target = a.includes(':') ? a.split(':').pop() : a
      if (PROTECTED.includes(target.replace(/^refs\/heads\//, '').replace(/^\+/, '')))
        reasons.push(`git push to ${target}`)
    }
    const force = args.some((a) => a === '--force' || a === '-f' || a.startsWith('+'))
    if (force) reasons.push('force push (use --force-with-lease on a factory/* branch only)')
  }
  if (/\bgh\s+pr\s+merge\b/.test(part)) reasons.push('merging is for the human')
  if (/\bgh\s+(secret|auth)\b/.test(part)) reasons.push('gh secret/auth')
  if (/\b(tests-change-approved|security-change-approved)\b/.test(part)) reasons.push('approval labels are for the human')
}

if (reasons.length) {
  console.error(`Blocked by guard-bash: ${[...new Set(reasons)].join('; ')}. Park the issue instead of working around this.`)
  process.exit(2)
}
