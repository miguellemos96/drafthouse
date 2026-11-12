import assert from 'node:assert/strict'
import { test } from 'node:test'
import { blockersOf, inWindow, orderQueue, pickStep, verdictOf, withOpenBlockers } from './next-step.mjs'

const config = { start: '21:00', cutoff: '03:00', maxFixRounds: 2, maxInconclusive: 2, branchPrefix: 'factory/' }
const night = new Date('2026-11-06T23:00:00')
const labels = (...names) => names.map((name) => ({ name }))
const issue = (number, names, createdAt = '2026-01-01', assignees = []) => ({ number, labels: labels(...names), assignees, createdAt })
const pr = (over = {}) => ({
  url: 'https://example/pr/1',
  headRefName: 'factory/5-x',
  isDraft: false,
  statusCheckRollup: [{ context: 'ci', conclusion: 'SUCCESS' }],
  comments: [],
  closingIssuesReferences: [{ number: 5 }],
  ...over,
})
const pick = (over) => pickStep({ now: night, config, stop: false, prs: [], issues: [], me: 'me', ...over })

test('the night window wraps past midnight', () => {
  assert.equal(inWindow(new Date('2026-11-06T22:00:00'), '21:00', '03:00'), true)
  assert.equal(inWindow(new Date('2026-11-07T02:59:00'), '21:00', '03:00'), true)
  assert.equal(inWindow(new Date('2026-11-07T03:00:00'), '21:00', '03:00'), false)
  assert.equal(inWindow(new Date('2026-11-06T12:00:00'), '21:00', '03:00'), false)
})

test('queue: bugs first, then oldest; held, assigned and claimed issues are skipped', () => {
  const issues = [
    issue(1, ['ready-for-agent', 'feature'], '2026-01-01'),
    issue(2, ['ready-for-agent', 'bug'], '2026-03-01'),
    issue(3, ['ready-for-agent', 'needs-info'], '2025-01-01'),
    issue(4, ['ready-for-agent'], '2025-01-01', [{ login: 'someone-else' }]),
    issue(5, ['ready-for-agent'], '2025-01-01'),
    issue(6, ['feature'], '2025-01-01'),
  ]
  const queue = orderQueue(issues, { me: 'me', openPrIssues: new Set([5]) })
  assert.deepEqual(queue.map((i) => i.number), [2, 1])
})

test('stop file and outside hours make the tick idle', () => {
  assert.deepEqual(pick({ stop: true }), { step: 'idle', reason: 'stop file' })
  assert.equal(pick({ now: new Date('2026-11-06T12:00:00') }).reason, 'outside hours')
})

test('an unverified factory PR with green checks is verified before new work', () => {
  const step = pick({ prs: [pr()], issues: [issue(9, ['ready-for-agent'])] })
  assert.deepEqual(step, { step: 'verify', pr: 'https://example/pr/1', issue: 5 })
})

test('a PR with red checks is not verified yet', () => {
  const step = pick({ prs: [pr({ statusCheckRollup: [{ context: 'ci', conclusion: 'FAILURE' }] })] })
  assert.equal(step.step, 'idle')
})

test('a FAIL gets at most two fix rounds', () => {
  const failed = (n) =>
    pr({ statusCheckRollup: [{ context: 'verifier', state: 'FAILURE' }], comments: Array.from({ length: n }, () => ({ body: '## Verifier: FAIL for abc' })) })
  assert.equal(pick({ prs: [failed(1)] }).step, 'fix')
  assert.equal(pick({ prs: [failed(2)] }).step, 'fix')
  assert.equal(pick({ prs: [failed(3)] }).step, 'idle')
})

test('INCONCLUSIVE is retried once, then left for the human', () => {
  const inconclusive = (n) =>
    pr({ statusCheckRollup: [{ context: 'verifier', state: 'ERROR' }], comments: Array.from({ length: n }, () => ({ body: '## Verifier: INCONCLUSIVE for abc' })) })
  assert.equal(pick({ prs: [inconclusive(1)] }).step, 'verify')
  assert.equal(pick({ prs: [inconclusive(2)] }).step, 'idle')
})

test('PRs that are not the factory\'s, or drafts, are ignored', () => {
  assert.equal(pick({ prs: [pr({ headRefName: 'my-own-branch' })] }).step, 'idle')
  assert.equal(pick({ prs: [pr({ isDraft: true })] }).step, 'idle')
})

test('verdictOf reads the verifier status only', () => {
  assert.equal(verdictOf(pr()), null)
  assert.equal(verdictOf(pr({ statusCheckRollup: [{ context: 'verifier', state: 'SUCCESS' }] })), 'SUCCESS')
})

test('a PR with no checks registered yet is not verified', () => {
  assert.equal(pick({ prs: [pr({ statusCheckRollup: [] })] }).step, 'idle')
})

test('blockersOf reads every number on "Blocked by" lines, and nothing else', () => {
  assert.deepEqual(blockersOf('Blocked by #2 and #7\n\nDraw the plan.'), [2, 7])
  assert.deepEqual(blockersOf('Intro\n**Blocked by** #12, #13'), [12, 13])
  assert.deepEqual(blockersOf('> blocked by #4\nBlocked by #5'), [4, 5])
  assert.deepEqual(blockersOf('See #3. This is not blocked by anything here: #3 is just mentioned.'), [])
  assert.deepEqual(blockersOf(undefined), [])
})

test('an issue waits while a blocker is open, and joins the queue once all are closed', () => {
  const issues = [
    { ...issue(10, ['ready-for-agent'], '2026-01-01'), body: 'Blocked by #8 and #9' },
    { ...issue(11, ['ready-for-agent'], '2026-02-01'), body: 'Blocked by #9' },
    { ...issue(12, ['ready-for-agent'], '2026-03-01'), body: 'No blockers.' },
  ]
  const queueWith = (open) => orderQueue(withOpenBlockers(issues, new Set(open)), { me: 'me', openPrIssues: new Set() })
  assert.deepEqual(queueWith([8, 9]).map((i) => i.number), [12])
  assert.deepEqual(queueWith([8]).map((i) => i.number), [11, 12])
  assert.deepEqual(queueWith([]).map((i) => i.number), [10, 11, 12])
})
