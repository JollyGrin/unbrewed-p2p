# Next.js upgrade research — unbrewed-p2p

_Researched 2026-07-02. Current stack: Next 13.3.0 (Pages Router), React 18.2, Chakra UI v2.5 + Emotion, framer-motion 10, TanStack Query v4, d3. Deployed as a **static export** to GitHub Pages. All game state is client-side over websockets to a Go server._

## TL;DR recommendation

**Upgrading will not make the app faster for your players.** Every headline feature of modern Next.js (Turbopack, React Server Components, Partial Prerendering / Cache Components, ISR, image optimization) targets *server-rendered* apps. This app is a static, client-heavy websocket SPA — none of that runtime machinery ships to the browser here, so there is essentially **zero user-visible speed win** from the framework upgrade itself.

What you *would* get: security patches, a maintained version, and much faster **local dev/build** (Turbopack: 2-5x faster builds, 5-10x faster refresh). Those help *you*, not players.

So the decision is really about maintenance risk, not performance. My recommendation, in order of pragmatism:

1. **Best value / low risk — upgrade to Next.js 15, keep React 18.** Next 15's Pages Router still officially supports React 18, so Chakra v2, framer-motion 10, and TanStack Query v4 all keep working untouched. You get modern tooling, security fixes, and opt-in Turbopack dev, with a small config-and-codemod migration. No forced ecosystem rewrites.
2. **Don't bother (also valid).** If the app builds fine and you're not hitting bugs, staying on 13.3.0 is defensible for a small community project. The only real cost of standing still is falling further behind on security patches and eventually facing a bigger jump.
3. **Avoid for now: jumping straight to Next 16 + React 19.** It forces a framer-motion migration (v10 is incompatible with React 19; you'd move to `motion` v12 with changed imports) and runs Chakra v2 on officially-unsupported React 19 (works in practice, but peer-dep warnings and minor popover/dialog bugs). Big surface area, no player-facing payoff.

**Do not** consider a Chakra v3 or App Router migration as part of this — both are large rewrites with no benefit for a static client app.

One migration caveat regardless of target: your `postbuild` font-rewrite script (`lib/buildTools/prefixFonts.js`) reads `.next/static/css`. Verify it still finds the CSS after upgrading, especially if you enable Turbopack for production builds (CSS output hashing/path could shift). Test the deployed fonts after any bump.

---

## 1. Latest version, Pages Router, and static export status

- **Latest stable is Next.js 16.x** (16.0 shipped Oct 2025; 16.2.x by mid-2026). ([Next.js 16 blog](https://nextjs.org/blog/next-16), [upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16))
- **The Pages Router is fully supported but in "maintenance mode."** It still builds and runs; new feature investment goes to the App Router. For a working Pages-Router app there is no forced migration. ([Static export docs](https://nextjs.org/docs/app/guides/static-exports))
- **Static export via `output: 'export'` is fully supported** and is a first-class, documented path — "Next.js enables starting as a static site or SPA." It emits an `out/` folder of HTML/CSS/JS deployable to any static host. ([Static export docs](https://nextjs.org/docs/app/guides/static-exports))
- **`next export` is gone.** It was deprecated in 13.3 (your version) and **removed in 14.0**; `output: 'export'` in `next.config.js` is the only mechanism now. You already don't use `next export`, so no action needed. ([Static export docs, Version History](https://nextjs.org/docs/app/guides/static-exports))
- Unsupported-in-static-export features (all irrelevant to this app): dynamic server functions, cookies, rewrites/redirects/headers, ISR, Server Actions, default-loader image optimization, proxy/middleware. ([Static export docs](https://nextjs.org/docs/app/guides/static-exports))

Note: this app doesn't even set `output: 'export'` in `next.config.js` today — it relies on automatic static optimization of Pages-Router pages with no server data deps, plus the GitHub Actions build. That keeps working, but if you upgrade it's worth adding `output: 'export'` explicitly for clarity and to catch any accidentally-dynamic code at build time.

## 2. Concrete performance differences for a static client app

Be clear-eyed about what does and doesn't move the needle here:

- **Runtime JS overhead (13 → 16):** Minimal change for a static client app. The big runtime reductions in modern Next come from React Server Components moving code off the client — but this app is Pages Router with client components only, so RSC doesn't apply. No meaningful bundle reduction from the framework upgrade alone.
- **React 18 → 19 for client apps:** React 19's runtime is modestly slimmer and hydration error handling improved, but the *headline* win is the **React Compiler** (1.0, stable; auto-memoizes to cut re-renders with no manual `useMemo`/`useCallback`). For a d3/drag-heavy interactive board this is the one place a real *runtime* win could exist — fewer wasted re-renders during dragging/state churn. But: it needs React 19 + opting in (`reactCompiler: true`) + a Babel plugin (which **slows builds**), and if your hot components are already well-structured the gain may be small. React's own guidance: an already-well-memoized codebase may see little benefit. ([React 19](https://react.dev/blog/2024/12/05/react-19), [Next 16 React Compiler support](https://nextjs.org/docs/app/guides/upgrading/version-16))
- **`forwardRef`:** React 19 lets function components take `ref` as a normal prop; `forwardRef` is deprecated (with a codemod). This is a nice cleanup, not a performance change.
- **Build/dev speed (Turbopack is stable):** This is the concrete, real win — but it benefits *your* workflow, not players. Turbopack is the default bundler in Next 16 (stable for dev and prod): ~2-5x faster production builds, 5-10x faster Fast Refresh, with filesystem caching for even faster restarts. Available opt-in (`--turbopack`) from Next 15. ([Next 16 blog](https://nextjs.org/blog/next-16), [upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16))

**Bottom line:** the only plausible *player-facing* runtime improvement in this whole upgrade is the React Compiler reducing re-render churn on the game board — and capturing it requires the full React 19 jump (with its ecosystem cost). Everything else is developer-experience.

## 3. Breaking changes / migration cost for a Pages-Router static-export app

Most of Next 16's breaking changes are App-Router / server concerns (async `cookies`/`headers`/`params`, caching APIs, `middleware`→`proxy`, Server Actions) that **do not touch this app**. The ones that could matter:

- **Node.js 20.9+ and TypeScript 5.1+ minimums** in Next 16. You're on TS 5.0.4 — bump to ≥5.1. Check the GitHub Actions runner Node version. ([Upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16))
- **Turbopack is the default bundler** in Next 16. If any dependency injects a webpack config, `next build` will **fail** unless you pass `--webpack` or migrate. You have no custom webpack config, so likely fine — but verify no plugin adds one. ([Upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16))
- **`next lint` removed** in Next 16 (migrate to ESLint CLI / Biome; a codemod exists). Your `lint` script and `eslint-config-next` would need updating. This is why Next 15 is the gentler target — it keeps `next lint`.
- **`next/image` on static export** is unchanged in principle: the default optimizing loader is unsupported in static export; you must use `images.unoptimized: true` or a custom loader. If this app uses `next/image` at all, confirm that's set. (Next 16 also tightened several image defaults — `minimumCacheTTL`, `qualities: [75]`, `domains` deprecated — but these only affect the optimizer, not static/`unoptimized` usage.) ([Static export docs](https://nextjs.org/docs/app/guides/static-exports), [Next 16 image changes](https://nextjs.org/docs/app/guides/upgrading/version-16))
- **`assetPrefix` / `basePath` for GitHub Pages: unchanged.** These remain the correct mechanism for hosting under a subpath, and their behavior is stable across 13→16. Your `next.config.js` currently sets an empty `pathPrefix` (implying a custom domain or user/org root, not a `/repo` project path) — that continues to work as-is. No GitHub Pages-specific breakage.
- **Font handling:** No framework change forces edits here, but your custom `postbuild` script (`prefixFonts.js`) is fragile — it hard-codes reading `.next/static/css` and rewriting `/fonts/` URLs. It should survive an upgrade, but **Turbopack production builds could change CSS filenames/output**, so test the deployed fonts after any bump. This custom script is the single most likely thing to break in an upgrade.

**Migration effort estimate:** Next 13→15 keeping React 18 is roughly a few hours: run `@next/codemod upgrade`, bump TS, fix a handful of config/lint items, rebuild, and verify the font script + GitHub Pages deploy. Next 13→16 + React 19 is a multi-day effort once you add the framer-motion migration and React-19 regression testing across Chakra.

## 4. Ecosystem compatibility (the deciding factor)

This is where the real cost lives, and it argues for pinning React 18.

- **Chakra UI v2 + React 19:** Chakra v2 officially targets **React 18 only**. The Chakra team says v2 "should work" with React 19 / Next 16, and has shipped React-19-specific fixes (Dialog/Popover interactivity in Strict Mode, `usePrevious` rewrite) — but you'll hit **peer-dependency warnings** and there have been reported popover-placement bugs. It works "in practice," not "officially." Moving to **Chakra v3 is a large rewrite** (new API, different styling system) and is off the table for this scope. ([Chakra v2 + React 19 discussion](https://github.com/chakra-ui/chakra-ui/discussions/10439), [React 19 support issue](https://github.com/chakra-ui/chakra-ui/issues/8519))
- **framer-motion 10 + React 19:** **Incompatible.** framer-motion 10 does not support React 19. React 19 support landed in **v12**, which is also the rename to **`motion`** (imports change from `framer-motion` to `motion/react`). So going to React 19 forces a framer-motion major upgrade + import changes. ([Motion upgrade guide](https://motion.dev/docs/react-upgrade-guide), [React 19 incompatibility issue](https://github.com/motiondivision/motion/issues/2668))
- **TanStack Query v4 + React 19:** No hard block reported; v4 uses `useSyncExternalStore` and works with React 18/19 in practice, though v4 predates official React 19 support (v5 is current). If you go React 19 you'd likely want to bump to Query v5 eventually, but it's not a forced blocker. ([TanStack Query releases](https://github.com/tanstack/query/releases))

**Net:** staying on React 18 means the entire UI stack (Chakra v2, framer-motion 10, Query v4) keeps working with no changes. Moving to React 19 forces at least the framer-motion migration and puts Chakra v2 in unofficial-support territory — for no player-facing benefit beyond the optional React Compiler.

## 5. Can you upgrade Next but pin React 18?

**Yes — this is the key enabling fact.** The **Pages Router officially supports React 18**; only the App Router pulls in React 19 (canary). Next.js added explicit React 18 Pages-Router support in the 15 line ([PR #69484](https://github.com/vercel/next.js/pull/69484)), and the [minimum React version doc](https://nextjs.org/docs/messages/react-version) still lists `react@18.2.0` as the floor. So **Next 15 + React 18 + Pages Router is a supported combination.**

- **Next 14** natively uses React 18 — the most conservative bump, but it's now an older line and misses stable Turbopack.
- **Next 15 + pinned React 18** is the sweet spot: modern, still receiving patches, opt-in Turbopack dev, and no forced React 19 / ecosystem churn.
- **Next 16 + React 18 (Pages Router):** likely works given the Pages Router's React 18 support, but 16 is aggressively Turbopack-and-App-Router-forward (removes `next lint`, etc.), so it's more migration friction than 15 for a marginal gain. If you're pinning React 18 anyway, 15 is the calmer target.

## 6. Pragmatic recommendation

For **this** app — static, client-only, websocket game, small community project:

| Option | Effort | Player-visible win | Verdict |
|---|---|---|---|
| Stay on Next 13.3 | none | none | Fine short-term; falls behind on security |
| **Next 15, pin React 18** | ~half day | none (dev/build speed only) | **Recommended** if you upgrade |
| Next 16 + React 19 | multi-day | maybe (React Compiler on the board) | Not worth it now |
| Chakra v3 / App Router | weeks | none | No |

**Do this:** if you want to modernize, go **Next 15 with React pinned at 18**. Run the Next codemod, bump TypeScript to ≥5.1, keep Chakra v2 / framer-motion 10 / Query v4 exactly as they are, optionally add explicit `output: 'export'`, and **re-test the `prefixFonts.js` step and the GitHub Pages deploy**. Expect faster local builds and current security patches — but set expectations that **players won't notice any difference**.

**Don't do this now:** the React 19 jump. Revisit it only if you (a) specifically want the React Compiler to smooth out re-render jank on the game board, and (b) are willing to migrate framer-motion → `motion` v12 and accept Chakra v2 on unofficial React 19 support. For a working community app, that's a lot of risk for a maybe.

---

### Sources
- Next.js 16 upgrade guide — https://nextjs.org/docs/app/guides/upgrading/version-16
- Next.js 16 release blog — https://nextjs.org/blog/next-16
- Static exports guide (incl. version history: `next export` removed in 14.0) — https://nextjs.org/docs/app/guides/static-exports
- Minimum React version — https://nextjs.org/docs/messages/react-version
- Pages Router React 18 support (PR #69484) — https://github.com/vercel/next.js/pull/69484
- React 19 release notes — https://react.dev/blog/2024/12/05/react-19
- Chakra UI v2 + React 19 / Next 16 discussion — https://github.com/chakra-ui/chakra-ui/discussions/10439
- Chakra UI React 19 support issue — https://github.com/chakra-ui/chakra-ui/issues/8519
- Motion (framer-motion) React 19 upgrade guide — https://motion.dev/docs/react-upgrade-guide
- framer-motion React 19 incompatibility — https://github.com/motiondivision/motion/issues/2668
- TanStack Query releases — https://github.com/tanstack/query/releases
