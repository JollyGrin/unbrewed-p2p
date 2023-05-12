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

## Run Locally

1. `cd gameserver && go build`
1. `cd ../ && yarn server`
1. then open a new terminal and run `yarn dev`
1. open http://localhost:3000

_Having issues with canvas?_

- run `yarn add canvas`
- for whatever reason this sometimes just doesn't install with default yarn

## How to add Fonts

1. add file to `public/fonts`
1. update `styles/fonts.css`
1. update `styles/styles.ts`
1. update `lib/devTools/prefixFonts.js` to add another html match for fixing production links. Github pages will put the repo after the url

# Credits

- [JonG](https://github.com/JonathanGuberman), creator of [ unmatched.cards](https://unmatched.cards/) (create your own unmatched deck), [created the styling for the card template](https://github.com/JonathanGuberman/unmatched_maker/blob/a7e96b69559461bfac7d3203d8d3899d4af36398/src/components/UnmatchedCard.vue)
- [Michal Wrzosek](https://github.com/michal-wrzosek), creator of [pitu pitu chat](https://michal-wrzosek.github.io/p2p-chat/)

# Goals

## Journal

### 2023-5-12

Just added the header component to react to the gameState. In doing so though I found that the AliceCarousel was not working
because it would cause the entire row to reset (scroll back to beginning) on every update.

I fixed this by using overflowY='clip' and overflowX='auto' and it's working well now. Will likely need to do some extra css to get the css more smooth.

### 2023-5-10

-REMOVED THE P2P-
We decided to just make a simple server that can be easily deployed. P2P ended up being too difficult.

Have the gameserver working now with:

- deck init: when loading gameboard, it will load your deck that you added and starred in /bag
- hand: drawing cards work and added styling to make it easier to read text
- discard: when hovering over a card you can select to discard.
- modal: added a modal which accepts a tag and then loads the relevant data from gameserver

Had to refactor the Pool class to instead be an object that can be passed around.

- refactored the functions to be isolated. They accept a `PoolType` and return a `PoolType`
- this works well with lodash flow to chain a pool action with a gameserver update function

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
