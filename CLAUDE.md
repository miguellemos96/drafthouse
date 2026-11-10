# DraftHouse

A website for planning a home remodel in 3D: draw your rooms, add doors, windows and furniture, paste product links, and move the products around at their real size. Read `docs/spec.md` before working an issue: it has the glossary and the decisions behind every feature.

This repo is built by a personal software factory: scheduled Claude Code sessions work `ready-for-agent` issues into PRs, a separate session verifies each PR, and the human merges.

## Commands

Run from the repo root. Node 24 or later.

- Install: `npm ci`
- Typecheck: `npm run typecheck`
- Lint: `npm run lint`
- Unit tests: `npm test` (Vitest, `src/**/*.test.ts` and `server/**/*.test.ts`)
- Factory script tests: `npm run test:factory`
- Build the site: `npm run build`
- All of the above: `npm run check`
- End-to-end tests: `npm run e2e` (Playwright, Chromium only, `e2e/*.spec.ts`). It builds the site and serves it with `vite preview` by itself, and saves a screenshot of the app to `test-results/app.png`. First time on a machine: `npx playwright install chromium`. For visible changes, put that screenshot in the PR's Evidence section.
- Your own browser checks: put throwaway specs in `.factory-tmp/e2e/` and run `npm run e2e:scratch`. It uses the same server, which Playwright also starts and stops.
- Dev server: `npm run dev`, for humans only. In a factory session, never start a server or anything else in the background. A process left running keeps files in `node_modules` open, so the next tick's `git clean` and `npm ci` fail. The `guard-bash` hook refuses these commands.

## Code layout

- `src/model/`: pure logic, no DOM and no Three.js. Plan geometry, rooms, walls, openings, items, templates, mounts, snapping, clashes, distances, versions, prices, save format. Put new rules here and unit-test them here.
- `src/scene/`: draws the model with Three.js. No rules of its own: if you need an `if` about the home, it belongs in the model.
- `src/ui/`: panels, forms, input handling. Plain DOM, no UI framework.
- `src/i18n/`: strings in `en`, `es` and `pt`. Every user-visible string goes through it; never hard-code text in the UI.
- `server/`: the Node server (runs TypeScript directly, no build step). `server/reader/`: link extraction and safety checks.
- Units: 1 unit = 1 cm everywhere, in the model and in the scene. +Y is up.

## Workflow

- Base branch: `main`. Never push to it; open a PR from `factory/<N>-<slug>`.
- One issue per PR. The PR body says `Closes #N` and follows `.github/pull_request_template.md`.
- Bugs: write a failing test first. Features: turn the issue's acceptance scenarios into tests.
- Never weaken or delete an existing test to make a change pass.
- An issue that says "Blocked by #N" waits until #N is merged. If you find it on `main` without its blocker, park.
- For anything visible, put evidence in the PR: test output, and the screenshot from `npm run e2e`. A human judges how the 3D view looks.
- Scratch files go in `.factory-tmp/` (gitignored).
- Imports use the `.ts` extension. Only erasable TypeScript syntax (no enums, no namespaces, no parameter properties), so the server runs without a build.
- Factory internals live in `.claude/skills/` (worker, verifier, factory-tick), `.claude/hooks/` and `scripts/factory/`. Change them only through an issue labeled `human`; the factory does not edit its own machinery.
