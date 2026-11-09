# CLAUDE.md

## Installing

- `bun install` (bun is the package manager only; Node runs next, jest and tsx). No `--legacy-peer-deps` or other flags. CI uses `bun install --frozen-lockfile`.
- Use bun ≥ 1.4.4 (the `packageManager` pin). Older bun silently drops `"libc"` from `bun.lock` on `bun add` / non-frozen installs and brings back ~124 MB of musl binaries; `grep -c '"libc"' bun.lock` should be 20 (CI fails otherwise).
- `bun.lock` is the only lockfile. Don't run `npm install` / `yarn` / `pnpm install`; they would write a second lockfile (pnpm also breaks Next's flat layout).
- Script names are unchanged: `npm run x` and `bun run x` both work.

## Testing

- While iterating: `npm run test:related -- <changed files>`. Never run the full suite in the edit loop.
- Once before opening/updating the PR: `npm test` (fast tier: everything except the slow render tests in `jest.slowTests.mjs`). Paste `<command> @ <short sha>: <jest summary line>` into the PR body.
- Also run `npm run test:slow` if the diff touches components the slow files cover and `test:related` did not already pull them in.
- `npm run test:full` (all files, with coverage) is for merge / final-tips runs, not for workers.
- Keep output small: `--silent`; read failures, not the full log.
