---
name: factory-tick
description: One scheduled factory run. Ask next-step what to do, do exactly that one step, log the result, and end. Started by the scheduler as `/factory-tick`.
disable-model-invocation: true
---

# Factory tick

You run unattended. Do exactly one step, then stop.

0. Run `gh api user --jq .login`. It must print `miguellemos96`, the repo owner. If it prints anything else, stop and end with `TICK-RESULT: failed wrong gh account: <login>`, without logging, because the log would be written as that account. `.claude/settings.json` clears `GITHUB_TOKEN` and `GH_TOKEN` so gh uses the owner's sign-in; a token set elsewhere (such as a work account's) has no write access here.
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

   The worker and verifier skills can't be started with the Skill tool, so nothing starts them by accident. Read `.claude/skills/<name>/SKILL.md` and follow it, with the arguments above in place of its placeholders.
4. Append one line to the Factory log issue: `gh issue comment <log-issue> --body "<date time> <step> #<n>: <the skill's result line>"`. The log issue number is `logIssue` in `~/.factory/config.json`.
5. Last line, alone on the line: `TICK-RESULT: <step> <the skill's result line>`.

If you hit a usage limit, stop. Don't retry; the next scheduled tick continues.
