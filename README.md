# DraftHouse

Plan a home remodel in 3D. Draw your rooms, add doors, windows and furniture, paste links to products you're considering, and move them around your home at their real size. Keep versions ("As it is", "Plan A") and compare them.

Personal, non-commercial project. No accounts, no AI: your home is saved in your browser.

```bash
npm ci
npm run dev      # http://localhost:5173
npm run check    # typecheck, lint, tests, build
```

- What it does and why: [docs/spec.md](docs/spec.md)
- Rules for Claude Code sessions: [CLAUDE.md](CLAUDE.md)

## The factory

Issues labeled `ready-for-agent` are worked by scheduled Claude Code sessions into PRs. A separate session verifies each PR and posts a `verifier` status. You merge.

| Piece | Where |
|---|---|
| Work one issue → PR, or park | `.claude/skills/worker/` |
| Judge one PR → PASS / FAIL / INCONCLUSIVE | `.claude/skills/verifier/` |
| One scheduled run: pick a step, do it, log it | `.claude/skills/factory-tick/` |
| Decide the next step from GitHub state | `scripts/factory/next-step.mjs` |
| Allow/deny list and guard hook | `.claude/settings.json`, `.claude/hooks/` |
| Labels | [docs/labels.md](docs/labels.md) |

Issues that say "Blocked by #N" get `ready-for-agent` only after #N is merged; the factory works the oldest ready issue first and doesn't know about blockers.

**Known gap:** one settings file serves every role, so the worker could post the `verifier` status. That's fine while you merge every PR yourself. Close it before turning on auto-merge.

**Stop it:** create `%USERPROFILE%\.factory\STOP`, or pause the routine.

## License

MIT
