#!/usr/bin/env bash
#
# init-worktree.sh — prepare a freshly-created git worktree for local dev.
#
# A new `git worktree` only gets the tracked files; everything gitignored has
# to be recreated. This script:
#   1. copies the untracked-but-needed files from the main worktree
#      (currently the compiled gameserver binary + any local env files)
#   2. installs dependencies with a FLAT node_modules using npm.
#
# ⚠️  Do NOT run `pnpm install` in this repo. pnpm builds a symlinked
#     (`node_modules/.pnpm`) tree, and Next.js's dev server cannot resolve its
#     internal webpack loaders (next-swc-loader, next-client-pages-loader, …)
#     under it — you get "Module not found" errors on the dev port. Use npm,
#     which matches the main checkout's flat layout.
#
# Usage:  ./scripts/init-worktree.sh      (run from anywhere inside the worktree)

set -euo pipefail

# Repo root of the worktree this script lives in.
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$here"

# --- 1. Locate the main worktree (the checkout on `main`) --------------------
main_wt="$(git worktree list --porcelain \
  | awk '/^worktree /{wt=substr($0,10)} /^branch refs\/heads\/main$/{print wt; exit}')"
# Fallback: the first worktree that isn't this one.
if [ -z "${main_wt:-}" ] || [ "$main_wt" = "$here" ]; then
  main_wt="$(git worktree list --porcelain \
    | awk -v self="$here" '/^worktree /{wt=substr($0,10); if (wt!=self){print wt; exit}}')"
fi

echo "▸ this worktree : $here"
echo "▸ main worktree : ${main_wt:-<none found>}"

# --- 2. Copy untracked-but-needed files from main ----------------------------
if [ -n "${main_wt:-}" ] && [ -d "$main_wt" ] && [ "$main_wt" != "$here" ]; then
  # Compiled game server binary (gitignored; needed by `npm run server`).
  if [ -f "$main_wt/gameserver/unbrewed-server" ]; then
    mkdir -p gameserver
    cp -p "$main_wt/gameserver/unbrewed-server" gameserver/unbrewed-server
    chmod +x gameserver/unbrewed-server
    echo "  ✓ copied gameserver/unbrewed-server"
  else
    echo "  · no gameserver binary in main (skipped)"
  fi

  # Any local env files (none tracked today, but future-proof).
  while IFS= read -r -d '' f; do
    rel="${f#"$main_wt"/}"
    mkdir -p "$(dirname "$rel")"
    cp -p "$f" "$rel"
    echo "  ✓ copied $rel"
  done < <(find "$main_wt" -maxdepth 2 \
             \( -name '.env' -o -name '.env.*' \) \
             -not -path '*/node_modules/*' -print0 2>/dev/null)
else
  echo "  · no separate main worktree — skipping file copy"
fi

# --- 3. Install dependencies (flat, via npm) ---------------------------------
# A pnpm-style tree left behind from an accidental `pnpm install` breaks Next,
# so clear it before installing.
if [ -d node_modules/.pnpm ] || [ -L node_modules/react ]; then
  echo "▸ clearing pnpm-style node_modules (Next needs a flat tree)…"
  rm -rf node_modules
fi

echo "▸ installing dependencies (npm, --legacy-peer-deps)…"
npm install --legacy-peer-deps

# --- 4. Sanity-check the layout that pnpm breaks -----------------------------
if [ -f node_modules/next/dist/build/webpack/loaders/next-swc-loader.js ] \
   && [ ! -L node_modules/react ]; then
  echo "✅ worktree ready — flat node_modules, next-swc-loader resolvable."
  echo "   Start dev with:  npm run dev"
else
  echo "✗ node_modules looks wrong (symlinked react or missing loader)." >&2
  echo "  Make sure you used npm, not pnpm, then re-run this script." >&2
  exit 1
fi
