// Tests for guard-bash.mjs: run with `npm run test:factory`.
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const HOOK = fileURLToPath(new URL('./guard-bash.mjs', import.meta.url))
const run = (command, extra = {}) =>
  spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ tool_input: { command, ...extra } }), encoding: 'utf8' })
const blocked = (command, extra) => assert.equal(run(command, extra).status, 2, `should block: ${command}`)
const allowed = (command, extra) => assert.equal(run(command, extra).status, 0, `should allow: ${command}`)

test('pushes to main, force pushes and merges are blocked', () => {
  blocked('git push origin main')
  blocked('git push origin HEAD:refs/heads/main')
  blocked('git push --force origin factory/1-x')
  blocked('gh pr merge 3')
  allowed('git push origin HEAD:factory/1-x')
  allowed('git push --force-with-lease origin HEAD:factory/1-x')
})

test('background commands are blocked', () => {
  blocked('npm test', { run_in_background: true })
  blocked('npx vite preview --port 4178 --strictPort', { run_in_background: true })
  allowed('npm test', { run_in_background: false })
})

test('servers that outlive the session are blocked', () => {
  blocked('npx vite preview --port 4178 --strictPort')
  blocked('npx vite')
  blocked('vite dev')
  blocked('npm run dev')
  blocked('npm run preview')
  blocked('npm start')
  blocked('PORT=8787 node server/main.ts')
  blocked('npm run build && npx vite preview')
  blocked('Start-Process node -ArgumentList server/main.ts')
  blocked('nohup npm test')
  blocked('npm test &')
})

test('builds, tests, e2e runs and text that mentions vite are allowed', () => {
  allowed('npx vite build')
  allowed('npm run build')
  allowed('npx vitest run server')
  allowed('npm run e2e')
  allowed('npm run e2e:scratch')
  allowed('npx playwright test')
  allowed('grep -rn vite package.json')
  allowed('gh pr comment 3 --body "ran npx vite preview by hand"')
  allowed('npm test 2>&1')
})
