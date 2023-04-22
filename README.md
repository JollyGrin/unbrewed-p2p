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

## How to add Fonts

1. add file to `public/fonts`
1. update `styles/fonts.css`
1. update `styles/styles.ts`
1. update `lib/devTools/prefixFonts.js` to add another html match for fixing production links. Github pages will put the repo after the url

# Credits

- [JonG](https://github.com/JonathanGuberman), creator of [ unmatched.cards](https://unmatched.cards/) (create your own unmatched deck), [created the styling for the card template](https://github.com/JonathanGuberman/unmatched_maker/blob/a7e96b69559461bfac7d3203d8d3899d4af36398/src/components/UnmatchedCard.vue)
- [Michal Wrzosek](https://github.com/michal-wrzosek), creator of [pitu pitu chat](https://michal-wrzosek.github.io/p2p-chat/)

# Goals

## WebRTC Goals (for @emyrk)

- make hooks for the functionality found in p2p chat
- add tooling for reconnecting (do we need to store a key?)
- is more than 2people possible?
- compile a list of STUN & TURN servers and enable ability to find your own lists

## Journal

### 2023-4-22

Now have a fully working board.

- can swap between boards (svgs)
- can dynamically load circles
- moving circles is handled with a callback, preparing for webrtc data to update the board state.

### 2023-4-19

The import worked suprisingly well. Only had 1 issue but still requires a huge rework.

Had an issue measuring the text width in the svg with node-canvas & ssg/hydration issues.
Solution: use functional components instead of a class so that I can use hooks (useEffect)
Buzzkill: have to refactor the entire 600+ lines
