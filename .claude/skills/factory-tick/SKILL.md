---
name: factory-tick
description: One scheduled factory run. Ask next-step what to do, do exactly that one step, log the result, and end. Started by the scheduler as `/factory-tick`.
disable-model-invocation: true
---

# Factory tick

You run unattended. Do exactly one step, then stop.

1. Bring the worktree to a clean state. Run each command in its own call:
   - `git fetch origin --prune`
   - `git switch --detach origin/main`
   - `git reset --hard origin/main`
   - `git clean -fdx -e .factory-tmp`
   - `npm ci`, only if `node scripts/factory/next-step.mjs --lock-changed` prints `yes`. When `npm ci` succeeds, run `node scripts/factory/next-step.mjs --lock-installed`.

   If any of these fails, stop: append `<date time> failed: <command> <first error line>` to the Factory log, and end with `TICK-RESULT: failed dirty folder: <command>`. Don't substitute another command, such as `npm install` for `npm ci`, and don't try to stop processes. A failure here usually means a leftover process holds a file open, and only the human clears it.
2. Run `node scripts/factory/next-step.mjs` and read the one JSON line it prints.
3. Act on `step`:
   - `idle`: print `TICK-RESULT: idle <reason>` and stop. Do nothing else.
   - `verify`: run the `verifier` skill with the given `pr`.
   - `fix`: run the `worker` skill with `<issue> fix <pr>`.
   - `work`: run the `worker` skill with the given `issue`.
4. Append one line to the Factory log issue: `gh issue comment <log-issue> --body "<date time> <step> #<n>: <the skill's result line>"`. The log issue number is in `factory.config.json`.
5. Last line, alone on the line: `TICK-RESULT: <step> <the skill's result line>`.

If you hit a usage limit, stop. Don't retry; the next scheduled tick continues.
