# CLAUDE.md

## Testing

- While iterating: `npm run test:related -- <changed files>`. Never run the full suite in the edit loop.
- Once before opening/updating the PR: `npm test` (fast tier: everything except the slow render tests in `jest.slowTests.mjs`). Paste `<command> @ <short sha>: <jest summary line>` into the PR body.
- Also run `npm run test:slow` if the diff touches components the slow files cover and `test:related` did not already pull them in.
- `npm run test:full` (all files, with coverage) is for merge / final-tips runs, not for workers.
- Keep output small: `--silent`; read failures, not the full log.
