# SEO & AI-Discoverability Spec — unbrewed.xyz

**Date:** 2026-07-03
**Goal:** Make Unbrewed findable by people searching for ways to play Unmatched (the board game) online — via Google, and via AI assistants (ChatGPT, Perplexity, Claude, Google AI Overviews). Key differentiators to surface: browser-only, no accounts, free, supports **unmatched.cards**, **the-unmatched.club**, and **Tabletop Simulator (TTS) imports**.

**Stack constraints:** Next.js 13.3 (pages router) → `next export` static HTML → GitHub Pages at `unbrewed.xyz` (CNAME). Everything must work as static files in `out/` — no server headers, no runtime redirects, no `next/image` optimization.

---

## Current-state audit (verified 2026-07-03)

| # | Finding | Evidence | Impact |
|---|---------|----------|:------:|
| 1 | **No `robots.txt`** | `https://unbrewed.xyz/robots.txt` → 404 | High |
| 2 | **No `sitemap.xml`** | `https://unbrewed.xyz/sitemap.xml` → 404 | High |
| 3 | **One shared `<title>` for every page** — `Unbrewed Online` on `/`, `/bag`, `/connect`, `/game`… | `components/Helmet/Head.tsx` renders a single global Head from `_app.tsx`; no page sets its own | High |
| 4 | **Title/description don't contain the money keywords.** "Unbrewed Online" means nothing to a searcher; description is "Play Unmatched fandecks online with friends" (14 words, no "board game", "browser", "free", "no account") | `components/Helmet/Head.tsx` | High |
| 5 | **Zero Open Graph / Twitter Card tags, no OG image.** Links pasted in Discord/Reddit — where the Unmatched community lives — show no preview at all | `curl` of live homepage `<head>`; no `og:*` or `twitter:*` anywhere in repo | High |
| 6 | **No heading elements anywhere on the landing page.** All copy is Chakra `<Text>` (renders `<p>`). No `<h1>` on the site | `components/LandingPage/index.tsx`, `Hero.tsx` | High |
| 7 | **No structured data (JSON-LD)** — no `WebApplication`/`VideoGame`, no `FAQPage`, no `HowTo` (the "Four steps" section is literally a HowTo) | repo grep; live HTML | Med |
| 8 | **No `llms.txt`**, no machine-readable summary for AI agents | 404 | Med |
| 9 | **Thin keyword coverage in indexable copy.** "Unmatched" appears ~2× in the pre-rendered homepage HTML. "the-unmatched.club", "Tabletop Simulator", "TTS", "print and play", "no account", "free" never appear, despite being supported features and exactly what people search for | `curl https://unbrewed.xyz/ \| grep -ci unmatched` → 2 | High |
| 10 | **No canonical tags** on any page (minor dupe risk: GH Pages serves both `/bag` and `/bag.html`) | live HTML | Low |
| 11 | **No Search Console / Bing Webmaster verification evident**; analytics is counter.dev only | repo grep | Med |
| 12 | `viewport` sets `maximum-scale=1, user-scaleable=0` — accessibility flag in Lighthouse, mild ranking signal | `Head.tsx` | Low |
| 13 | Google Fonts loaded render-blocking from CDN even though local fonts exist in `public/fonts` | `Head.tsx` | Low |

**What's already good:** `lang="en"` set; HTTPS with custom domain; content *is* pre-rendered into static HTML (confirmed "Four steps" copy present in live HTML — crawlers and AI bots see real content, not an empty JS shell); disclaimer/credits give honest E-E-A-T signals; unmatched.cards links to Unbrewed ("Test in unbrewed" button) — an authoritative inbound link.

---

## Target queries

Primary (homepage should rank/get cited for):
- "play unmatched online" / "unmatched board game online" / "unmatched online simulator"
- "unmatched fan decks online" / "unmatched homebrew online"
- "unmatched.cards play online" / "test unmatched deck online"

Secondary (guide pages, phase 3):
- "the-unmatched.club import" / "play the-unmatched.club decks"
- "unmatched tabletop simulator alternative" / "import TTS unmatched deck"
- "how to playtest a homebrew unmatched deck"

AI fan-out coverage: the homepage + FAQ should answer "what is unbrewed", "is unbrewed free", "do I need an account", "does it work with unmatched.cards / the-unmatched.club / TTS", "is it official".

---

## Phase 1 — Technical foundations (one PR, highest ROI)

### 1.1 `public/robots.txt`
Static file; Next export copies `public/` to `out/` as-is.

```
User-agent: *
Allow: /

# AI search/citation bots explicitly welcome
User-agent: GPTBot
Allow: /
User-agent: ChatGPT-User
Allow: /
User-agent: PerplexityBot
Allow: /
User-agent: ClaudeBot
Allow: /
User-agent: Google-Extended
Allow: /

Sitemap: https://unbrewed.xyz/sitemap.xml
```

### 1.2 `public/sitemap.xml`
The site has ~5 indexable routes — a hand-written static sitemap is fine (skip `next-sitemap` until deck pages exist). Include `/`, `/bag`, `/connect`. **Exclude** `/game` (session-only), `/settings`, `/debug`, `/offline`. Revisit in Phase 3.

### 1.3 Parameterize `DocumentHeader` for per-page meta + canonical
Refactor `components/Helmet/Head.tsx` to accept props with defaults, keep the global instance in `_app.tsx` as fallback, and let pages override (Next dedupes `<Head>` tags by `key`):

```tsx
type SeoProps = { title?: string; description?: string; path?: string; image?: string };
export const DocumentHeader = ({ title, description, path, image }: SeoProps) => { ... }
```

- Canonical: `https://unbrewed.xyz${path ?? "/"}` (no `.html`, no trailing slash — pick one form and use it everywhere).
- Every OG/Twitter/meta tag gets a `key` so page-level values replace app-level ones.

Per-page values:

| Page | Title (≤60 chars) | Description (≤160 chars) |
|------|-------------------|--------------------------|
| `/` | `Unbrewed — Play Unmatched Fan Decks Online in Your Browser` | `Free browser simulator for the Unmatched board game. Play homebrew fan decks head-to-head — no account, no install. Imports from unmatched.cards, the-unmatched.club, and Tabletop Simulator.` |
| `/bag` | `Deck Bag — Import Unmatched Decks & Maps | Unbrewed` | `Load Unmatched decks from unmatched.cards, the-unmatched.club, TTS exports, JSON, or image URLs. Manage your decks and custom maps in one place.` |
| `/connect` | `Connect & Play — Start an Unmatched Game Online | Unbrewed` | `Create a lobby, share the room name with a friend, and play Unmatched online in seconds. Free and browser-based.` |
| `/game`, `/settings`, `/debug`, `/offline` | keep short titles + add `<meta name="robots" content="noindex">` | — |

### 1.4 Open Graph + Twitter Cards + OG image
- Generate a 1200×630 OG image in the site's parchment/purple design language (use the **og-image** skill — it screenshots a page built with the project's own design system). Ship as `public/og.png`.
- Tags (in `DocumentHeader`, driven by the same props): `og:title`, `og:description`, `og:image` (absolute URL), `og:url`, `og:type=website`, `og:site_name=Unbrewed`, `twitter:card=summary_large_image`.
- This is the single highest-leverage share-ability fix: the community discovers tools via Discord/Reddit links, and today those links render bare.

### 1.5 Semantic headings on the landing page
Chakra `Text`/`Heading` take an `as` prop — pure markup change, zero visual change:
- Hero tagline block → `<h1>`: e.g. the wordmark gets `aria-label`/`sr-only` h1 text "Unbrewed — play Unmatched fan decks online in your browser", or convert the sub-tagline `Text` to `Heading as="h1"` with existing styles.
- "Four steps to your first game" → `Heading as="h2"`; each step title → `as="h3"`; "Found a bug or have an idea?" → `as="h2"`.

### 1.6 Hygiene
- Drop `maximum-scale=1, user-scaleable=0` from viewport.
- Add `<meta name="theme-color">`; consider a `site.webmanifest`.
- Self-host Space Grotesk (fonts pipeline already exists: `public/fonts` + `prefixFonts.js`) and remove the Google Fonts render-blocking request — or at least keep `display=swap` (already present).

**Acceptance criteria (Phase 1):** robots.txt & sitemap.xml return 200 and validate; every indexable page has a unique title, description, canonical, OG tags; pasted link in Discord shows rich preview; Lighthouse SEO score ≥ 95; exactly one `<h1>` on `/`.

---

## Phase 2 — Structured data + AI extractability (second PR)

### 2.1 JSON-LD on the homepage
Inline `<script type="application/ld+json">` (static export means it's in the HTML — perfectly crawlable). Three blocks:

1. **`WebApplication`** — name Unbrewed, `applicationCategory: GameApplication`, `operatingSystem: Web browser`, `offers: { price: 0 }`, url, screenshot (reuse OG image), `about: { "@type": "Game", name: "Unmatched" }`.
2. **`HowTo`** — generated from the existing `STEPS` array in `components/LandingPage/index.tsx` (single source of truth: map the array into JSON-LD, don't duplicate copy).
3. **`FAQPage`** — matching the visible FAQ section below (2.2).

### 2.2 Homepage content additions (visible, human-first — not AI-bait)
Two small sections in the existing design language:

**"What is Unbrewed?" definition block** — a 40–60-word direct answer near the top of the "Getting started" section:
> Unbrewed is a free, open-source simulator for playing Unmatched fan decks online. It runs entirely in the browser — no account, no download. Import decks from unmatched.cards or the-unmatched.club, load any map from an image URL, and play head-to-head with a friend.

**FAQ section** (renders as `<h2>` + `<h3>` Q/A pairs; mirrors the FAQPage schema). Questions to cover — chosen to match real search/AI-assistant phrasing:
- Is Unbrewed free? Do I need an account?
- Can I play official Unmatched decks? *(honest answer: it's built for homebrew/fan decks; not affiliated with Restoration Games)*
- How do I import a deck from unmatched.cards?
- How do I import a deck from the-unmatched.club?
- Can I use Tabletop Simulator (TTS) deck imports?
- Can I play on mobile / do both players need anything installed?
- How is this different from Tabletop Simulator? *(browser, free, no install — the comparison query is high-intent)*

This section also fixes finding #9: it naturally works "the-unmatched.club", "Tabletop Simulator", "free", "no account", "browser" into indexable copy.

### 2.3 `public/llms.txt`
Per [llmstxt.org](https://llmstxt.org): H1 + one-paragraph summary + links.

```markdown
# Unbrewed

> Free, open-source, browser-based simulator for playing Unmatched board game
> fan decks online. No accounts, no installs. Imports decks from
> unmatched.cards and the-unmatched.club, plus Tabletop Simulator (TTS)
> exports. Custom maps from any image URL. Two players connect to a shared
> lobby and play head-to-head.

## Pages
- [Home](https://unbrewed.xyz/): overview and getting-started guide
- [Deck bag](https://unbrewed.xyz/bag): import and manage decks and maps
- [Connect](https://unbrewed.xyz/connect): create or join a game lobby

## Source
- [GitHub](https://github.com/JollyGrin/unbrewed-p2p): MIT-licensed source, issue tracker
```

### 2.4 Freshness + trust signals
- Add a visible "Last updated" (build-time injected, e.g. `NEXT_PUBLIC_BUILD_DATE`) in the footer.
- Footer links: GitHub, Discord, unmatched.cards credit — already present in content; make sure they're plain `<a>` links in the static HTML.

**Acceptance criteria (Phase 2):** all three JSON-LD blocks pass Google's Rich Results Test; FAQ visible and matching schema 1:1; llms.txt returns 200.

---

## Phase 3 — Content growth (separate efforts, ordered by ROI)

### 3.1 Guide pages (highest content ROI, small effort)
Three static pages under `/guides/` — these target the secondary queries and are the pages AI engines will actually cite for "how do I…" questions:
1. **How to play Unmatched online in your browser** (parent guide; canonical target for the fan-out cluster)
2. **Import decks from the-unmatched.club** (with screenshots; nothing else on the web covers this)
3. **Import a Tabletop Simulator (TTS) Unmatched deck**

Each: unique title/description, HowTo schema, screenshots (compressed WebP with alt text), cross-linked to `/bag` and `/connect`, linked from homepage FAQ answers.

### 3.2 Programmatic deck pages (bigger effort, evaluate after 3.1)
`public/top-decks/*.json` already contains full deck data (hero name, cards, special abilities) at build time — `getStaticPaths` can emit `/decks/[slug]` pages: hero name, sidekick, card list, "Play this deck" CTA. ~30 indexable, genuinely useful pages targeting "unmatched [hero] fan deck" long-tail. Guard against thin/duplicate content: only generate pages for decks with descriptions/complete data; self-canonical each page; add them to the sitemap (switch to `next-sitemap` at this point).

### 3.3 Third-party presence (no code)
- **BoardGameGeek**: Unmatched forum thread + tool listing (BGG is heavily cited by AI engines for board game queries).
- **Reddit r/Unmatched**: pinned-worthy "play fan decks in browser" post; participate authentically.
- Ask JonG (unmatched.cards) and the-unmatched.club to link with descriptive anchor text ("play online in Unbrewed") rather than just a button.
- GitHub repo: add website link + topics (`unmatched`, `board-game`, `online-simulator`) — repo pages rank and get cited.

---

## Phase 4 — Measurement

1. **Google Search Console**: verify via DNS TXT (no server needed), submit sitemap. Same for **Bing Webmaster Tools** (feeds Copilot/ChatGPT search).
2. Baseline once indexed: impressions/clicks for the target queries above.
3. Monthly manual AI check: ask ChatGPT/Perplexity/Claude "how can I play Unmatched fan decks online?" and record whether Unbrewed is cited; track month-over-month.

---

## Out of scope / explicitly not doing
- No separate "AI-optimized" content or page-chunking (Google scaled-content-abuse risk; the FAQ/definition blocks are normal human-first content).
- No keyword stuffing — Princeton GEO study shows it *reduces* AI visibility ~10%.
- No hreflang/i18n — single-locale site.
- No paid tooling; free tiers (GSC, Bing WMT, Rich Results Test, PageSpeed Insights) cover everything at this scale.

## Suggested sequencing
| PR | Contents | Effort |
|----|----------|--------|
| 1 | robots.txt, sitemap.xml, DocumentHeader refactor + per-page meta + canonical + noindex, OG image + tags, heading semantics, viewport fix | ~half a day |
| 2 | JSON-LD ×3, definition block, FAQ section, llms.txt, build-date footer | ~half a day |
| 3 | Guide pages (3.1) | ~1 day |
| 4 | GSC/Bing verification + baseline (no code beyond DNS) | ~1 hour |
| 5 | Deck pages (3.2) — decide after measuring 1–4 | ~2 days |
