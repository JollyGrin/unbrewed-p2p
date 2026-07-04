# T-022 — PRO: fix decision button text overflow + card preview on effect prompts

- **Status:** done (implemented 2026-07-04)
- **Repo:** unbrewed-p2p (this repo ONLY — no server/protocol changes)
- **Fixes:** https://github.com/JollyGrin/unbrewed-p2p/issues/72
- **Depends on:** T-019 game page (done). Touches ONLY `pages/pro/game.tsx`.

## The bug (from the issue, with a screenshot at 411px wide)

Two complaints on `/pro/game`:

1. **Button text overflows.** During a decision, the option/action button labels
   run past the button box, "making it impossible to evaluate the options." The
   right-hand control dock is only `w="18.5rem"` and the prompt panel inside it
   is narrower still; labels like `Boost move (discard clobber (3/2))` or a full
   prompt-option sentence get clipped because Chakra `<Button>` defaults to
   `white-space: nowrap` at a fixed height.
2. **No card context on effect prompts.** When a decision is driven by a card's
   effect, the panel header only shows the prompt *kind* (e.g. `CHOOSE TARGET`).
   The player can't see *which card* is causing the effect. The ask: show the
   card preview alongside the instruction header so they can compare.

## Where the code is (read before editing)

All in `pages/pro/game.tsx`:
- `PromptPanel` (~L102–142): renders `prompt.kind` as the header and
  `buttonOptions.map(o => <Button {...BTN_GOLD}>{o.label}</Button>)` in a
  `Flex flexWrap="wrap"` row. This is complaint #1's main offender and #2's home.
- The list-action buttons (~L587–592): `listActions.map(a => <Button {...BTN}
  justifyContent="flex-start">{describeAction(...)}</Button>)`. Also nowrap →
  also overflows for long `describeAction` strings.
- `describeAction` (~L73) / `cardLabel` (~L65): produce the long strings.
- `CardFace` is imported from `@/components/Pro/ProHand` and renders a real card
  from a `DeckImportCardType | null` with a text `fallback`. `resolveCard` (from
  `useProCardArt`, already in scope in `LiveGame`) maps a `CardInstanceId` → art.
- `view.combat` (`ViewCombat`) carries `attackerCard` / `defenderCard`
  (`ViewCombatCard | null`, each with an `.instance`) once revealed — see the
  existing `CombatPanel`.

## Fix #1 — wrapping buttons (definitive, do this)

Make every button that renders variable-length text wrap instead of clip:
- Add to the prompt-option buttons AND the list-action buttons:
  `whiteSpace="normal"`, `height="auto"`, `minH="2rem"`, `py="0.4rem"`,
  `textAlign="left"`, `lineHeight="1.2"`. (Chakra Button needs `height="auto"`
  for `whiteSpace="normal"` to actually grow the box.)
- Prompt options currently sit side-by-side in a wrapping row. With long labels
  that looks bad — change the option container to a vertical stack
  (`Flex direction="column"`) so each option gets the full panel width and wraps
  cleanly. Short labels (Yes/No) still look fine stacked.
- Consider folding the shared overflow-safe props into a small style object next
  to `BTN` / `BTN_GOLD` (e.g. `BTN_WRAP`) rather than repeating them — match the
  existing `BTN` spread pattern.

Verify at a narrow width: the reporter's screenshot is ~411px. At that width no
button text may overflow its box; buttons grow taller instead.

## Fix #2 — card preview on effect prompts (best-effort, defensive)

**Investigate first, then implement the achievable subset.** The protocol
constraint: `ViewPrompt` (`lib/pro/protocol.ts`) is `{promptId, player, kind,
options}` — it has **no** source-card field, and that file is a synced copy you
must NOT edit. So the client cannot always know the exact triggering card. Do the
best with what the view already exposes, and degrade to today's behavior (header
only) when there's no card to show. Do NOT invent a fake mapping.

Signals available client-side, in priority order:
1. **Combat context.** When `view.combat` is non-null and has a revealed
   `attackerCard` / `defenderCard`, those cards are the effect sources for
   combat-stage prompts (the common case card effects fire in). Render a compact
   `CardFace` preview (reuse the `~6.5rem` sizing from `CombatSlot`) inside/next
   to `PromptPanel` for the revealed combat card(s). Resolve art via the
   `resolveCard` already threaded to this screen (pass it into `PromptPanel` as a
   new prop, plus `catalog` for the text fallback via `cardLabel`).
2. **Option `data`.** `LegalOption.data?: Json` may carry a `CardInstanceId`
   (e.g. `{ card: "king-kong/clobber#2" }`). If any option's `data` holds a
   string that `resolveCard` resolves (or that exists in `catalog`), preview it.
   Guard everything — `data` is untyped `Json`; feature-detect, never assume.
3. **Nothing resolvable** → render exactly today's header-only panel. No empty
   frames, no "no card" placeholder for prompts.

Keep it to a small, tasteful preview (one card, maybe two for combat) above the
options so it reads as "this card is asking you to decide." Do not spend effort
on art polish; the text fallback is acceptable when `resolveCard` returns null.

**Document the gap:** add a short code comment where the preview renders, noting
that a fully-general "which card triggered this prompt" needs the server to add
`ViewPrompt.sourceCard?: CardInstanceId` to protocol v-next (a server-repo
follow-up), and that this client shows combat/option-data cards as the available
approximation. Do NOT edit the protocol file to add the field.

## Acceptance criteria
- On a ~411px-wide viewport, no prompt-option or list-action button clips its
  text; long labels wrap to multiple lines and the button grows taller.
- When a decision happens during combat with a revealed card, that card's face
  (or text fallback) shows next to the prompt instruction. When there's no card
  context, the panel looks like it does today (header + options only) — nothing
  broken, no empty frames.
- `npx tsc --noEmit 2>&1 | grep -v "Pool.spec"` is clean; page compiles in
  `next dev`.
- Zero changes outside `pages/pro/game.tsx`. `lib/pro/protocol.ts` untouched. No
  server-repo changes. No sandbox files touched.

## Out of scope
Any protocol/server change, the T-021 pre-join / hero-select flow (a different
agent owns the `!joined` branch — do NOT touch it), board/HUD/hand styling,
mobile pass, animations beyond what already exists.

## Judgment calls already made (don't relitigate)
- Overflow fix is the priority and is fully client-side — ship it regardless of
  how far the preview gets.
- The preview is best-effort from existing view data (combat cards + option
  data). A perfect source-card link is explicitly a server follow-up, not a
  reason to block or to touch the protocol.
- Stack prompt options vertically (full-width) rather than fight to fit them in a
  wrapping row.

## Result (2026-07-04)
Landed in `pages/pro/game.tsx` only (protocol/server untouched).
- **Fix #1:** prompt-option buttons and list-action buttons now wrap
  (`whiteSpace="normal"`, `height="auto"`, `minH`, `py`, `textAlign="left"`), so
  long labels grow the box instead of clipping at ~411px. (Implemented inline at
  the two button sites rather than as a shared `BTN_WRAP` const, to keep the
  change out of the T-021 hero-select region another change owned.)
- **Fix #2:** `PromptPanel` shows a best-effort `CardFace` preview above the
  options. Source instance is derived, in priority order, from an explicit
  `option.data.card` string (read defensively; never a fabricated mapping) then
  the live `view.combat` attacker/defender card. No signal → header-only, as
  before. A "DOCUMENTED GAP" comment notes that a fully-general prompt→card link
  needs a server-side `ViewPrompt.sourceCard` (protocol v-next follow-up).

tsc clean (excl. pre-existing Pool.spec).
