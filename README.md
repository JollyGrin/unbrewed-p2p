# Unbrewed 
Unbrewed: play your favorite Unmatched fan decks online with friends! All that's needed is a web-browser.
- uses unmatched.cards to load decks
- upload any map with just an image url
- play with friends by connecting to the same lobby/room

A combined web-app and go-server to play Unmatched fan-decks online. Designed to make it easy for anyone to run the sever through a few terminal commands and let others connect to it.

Feel free to submit PRs/Fork/or request features through the issue tracker.

## Run Locally

1. `cd gameserver && go build`
1. `cd ../ && yarn server`
1. then open a new terminal and run `yarn dev`
1. open http://localhost:3000

_Having issues with canvas?_

- run `yarn add canvas`
- for whatever reason this sometimes just doesn't install with default yarn

## Run a GameServer

_follow these instructions to run your own gameserver_

It's possible to run the server on your own computer and have others connect to you. Completely for free and without needing Unbrewed servers (in case they go offline).

1. `cd gameserver && go build`
1. `cd ../ && yarn server` (will be running a server on localhost:1111)
1. go to ngrok.com and signup for a free account
1. open a new terminal, navigate to folder, and type `yarn grok`
1. open `https://unbrewed.xyz/settings` and paste the link provided
1. You can provide the same url to others and they can connect to your server by pasting the same link.

Want to deploy a gameserver that exists 24/7? Add an issue to github or PR so we can update default server lists.

## How to add Fonts

1. add file to `public/fonts`
1. update `styles/fonts.css`
1. update `styles/styles.ts`
1. update `lib/devTools/prefixFonts.js` to add another html match for fixing production links. Github pages will put the repo after the url

# Credits

- [JonG](https://github.com/JonathanGuberman), creator of [ unmatched.cards](https://unmatched.cards/) (create your own unmatched deck), [created the styling for the card template](https://github.com/JonathanGuberman/unmatched_maker/blob/a7e96b69559461bfac7d3203d8d3899d4af36398/src/components/UnmatchedCard.vue)

---

# Journal

### 2024-03-30
The purpose of this refactor was to evergreen this app, and make it always possible to play unmatched fan decks in the browser. In this theme I added more ways to add data/decks/maps so it's less reliant on unmatched.cards (in case it becomes unavailable in the future)

Improved bag handling.
- Add deck with JSON or URL: instead of only being able to add a deck with unmatched.cards, I added two MVP inputs so you can add a deck by pasting JSON text, or a URL that contains a JSON download
- Add decks/maps in bulk: shows your entire decks/maps so you can copy/paste to store. Can also use a URL that downloads a JSON 

At the moment neither of these have any validation checking. So if you upload a broken JSON, it can break your app. You can fix this by clearing localStorage from your browser (Inspect > Application > Local Storage)

Later will be adding a list of URLs with decks and maps to ensure they can always be played, as long as a static HTML & Go server can run.

### 2024-03-24
Updated the website to use unbrewed.xyz. This was important to finally redirect traffic from unmatched.cards which has a built in "Test in unbrewed" button.
When navigating from unmatched.cards, will be redirected to the `/connect` page with the details loaded in. One caveat is that you'll need to refresh to show your loaded deck.

### 2024-03-13

Finally have everything mostly functional. 
- Token movement over websocket
- ability to create more tokens (and color them)
- added simple operations for discard/deck modal so you can draw them to your hand
- add a custom map (local only, both players need to load the same map)
- added some default decks that you can load into the bag

We have a default server live, so for the majority of players they can just create a new room and play

Next step will be to improve the landing page so it's understandable how to use the tool

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
