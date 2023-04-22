# Unbrewed P2P

This aims to recreate unbrewed.xyz but with webrtc and typescript. This will allow players to connect directly to each other without need for a server. This also makes it easier to fork and remix to your liking without relying on the unbrewed server for games.

- [x] setup typescript: to auto-document code
- [x] setup jest (unit tests): to make refactoring and PRs easier
- [x] add interactive board
- [x] add card template
- [ ] add board state (hand, discard, deck)
- [ ] add game actions
- [ ] add backpack (to load decks/maps in localstorage)
- [ ] add optional api server for loading decks from unmatched (add fallback if url breaks and ability to load a different server url)
- [ ] add [webrtc](https://michal-wrzosek.github.io/p2p-chat/)

## WebRTC Goals (for @emyrk)

- make hooks for the functionality found in p2p chat
- add tooling for reconnecting (do we need to store a key?)
- is more than 2people possible?

## Add Fonts

1. add file to `public/fonts`
1. update `styles/fonts.css`
1. update `styles/styles.ts`
1. update `lib/devTools/prefixFonts.js` to add another html match for fixing production links

## Journal

random notes/design decisions made

### 2023-4-19

The import worked suprisingly well. Only had 1 issue but still requires a huge rework.

Had an issue measuring the text width in the svg with node-canvas & ssg/hydration issues.
Solution: use functional components instead of a class so that I can use hooks (useEffect)
Buzzkill: have to refactor the entire 600+ lines
