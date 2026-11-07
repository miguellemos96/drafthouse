# Labels

| Label | Meaning | Who sets it |
|---|---|---|
| `ready-for-agent` | Decided and specified. The factory may work it. | You only |
| `needs-info` | Parked: a question waits for you. Remove it after answering. | Worker |
| `needs-triage` | Drafted by an agent or captured quickly. Not decided yet. | Anyone |
| `human` | Hands off: you do this one yourself. | You |
| `bug` | Worked first, and requires a failing test before the fix. | You |
| `feature` | Requires acceptance scenarios. | You |
| `refactor` | Behavior must stay the same. | You |
| `chore` | Tooling, dependencies, CI. | You |
| `docs` | Documentation only. | You |
| `tests-change-approved` | You allow a PR to change an existing acceptance test. | You only (the factory is denied) |

Create them in one go (Git Bash):

```bash
for l in ready-for-agent needs-info needs-triage human bug feature refactor chore docs tests-change-approved; do gh label create "$l" --force; done
```
